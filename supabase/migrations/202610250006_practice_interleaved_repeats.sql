begin;

alter table public.practice_sessions
  add column learning_queue integer[],
  add column repeat_answered integer not null default 0 check(repeat_answered>=0),
  add column repeat_correct integer not null default 0 check(repeat_correct between 0 and repeat_answered);
alter table public.practice_answers
  add column repeat_pending boolean not null default false,
  add column repeat_option_id uuid,
  add column repeat_attempt integer not null default 0 check(repeat_attempt>=0);

-- Old sessions initialize lazily; their original answers and score are immutable.
create function public.practice_queue(p_id uuid) returns integer[] language sql stable security definer set search_path='' as $$
  select coalesce(s.learning_queue,(
    select coalesce(array_agg(q.ordinal order by array_position(s.deferred_ordinals,q.ordinal) nulls first,q.ordinal),'{}')
    from public.practice_questions q left join public.practice_answers a using(session_id,ordinal)
    where q.session_id=s.id and (a.option_id is null or a.repeat_pending)
  )) from public.practice_sessions s where s.id=p_id and s.user_id=auth.uid();
$$;
revoke all on function public.practice_queue(uuid) from public,anon,authenticated;

create or replace function public.practice_next_pending(p_id uuid) returns integer language sql stable security definer set search_path='' as $$
  select (public.practice_queue(p_id))[1];
$$;
create or replace function public.practice_meta(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',s.id,'title',s.title,'source',s.source,'mode',s.mode,'direction',s.direction,'language',s.language,
    'lessonSize',s.lesson_size,'total',s.total,'status',s.status,'revision',s.revision,
    'cursor',case when s.mode='learn' then coalesce(public.practice_next_pending(s.id),s.cursor) else s.cursor end,
    'deferredCount',cardinality(s.deferred_ordinals),
    'pendingCount',case when s.mode='learn' then cardinality(public.practice_queue(s.id)) else s.total-counts.answered end,
    'repeatAnswered',s.repeat_answered,'repeatCorrect',s.repeat_correct,
    'answered',counts.answered,'unanswered',s.total-counts.answered,
    'correct',case when s.mode='learn' or s.status='submitted' then counts.correct else null end,
    'wrong',case when s.mode='learn' or s.status='submitted' then counts.answered-counts.correct else null end,
    'createdAt',s.created_at,'submittedAt',s.submitted_at,'parentId',s.parent_id)
  from public.practice_sessions s cross join lateral (
    select count(*) filter(where a.option_id is not null)::int answered,
      count(*) filter(where a.option_id=q.correct_option_id)::int correct
    from public.practice_questions q left join public.practice_answers a using(session_id,ordinal) where q.session_id=s.id
  ) counts where s.id=p_id and s.user_id=auth.uid();
$$;

create or replace function public.practice_read(p_id uuid,p_offset integer default 0,p_limit integer default 25) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.practice_sessions; qs jsonb; begin
  select * into s from public.practice_sessions where id=p_id and user_id=auth.uid();
  if s.id is null then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  if p_offset<0 or p_limit not between 1 and 100 then raise exception 'Invalid page'; end if;
  select coalesce(jsonb_agg(item order by ordinal),'[]') into qs from (
    select q.ordinal,jsonb_strip_nulls(jsonb_build_object('ordinal',q.ordinal,'direction',q.direction,'prompt',q.prompt,'promptPinyin',q.prompt_pinyin,
      'options',q.options,'selectedOptionId',chosen.selected,'marked',coalesce(a.marked,false),
      'deferred',q.ordinal=any(s.deferred_ordinals),
      'feedback',case when s.status='submitted' or (s.mode='learn' and chosen.selected is not null) then q.feedback||jsonb_build_object('correctOptionId',q.correct_option_id,'isCorrect',case when chosen.selected is null then null else chosen.selected=q.correct_option_id end) else null end)) item
    from public.practice_questions q left join public.practice_answers a using(session_id,ordinal)
    cross join lateral (select case when s.status='submitted' or s.mode='exam' then a.option_id
      when a.repeat_pending then null else coalesce(a.repeat_option_id,a.option_id) end selected) chosen
    where q.session_id=p_id and q.ordinal>=p_offset and q.ordinal<p_offset+p_limit
  ) page;
  return jsonb_build_object('session',public.practice_meta(p_id),'questions',qs);
end $$;

create or replace function public.practice_commit(p_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.practice_sessions; event public.practice_events; q public.practice_questions; a public.practice_answers;
  eid uuid:=(p_command->>'eventId')::uuid; action text:=p_command->>'kind'; pos integer:=(p_command->>'ordinal')::int;
  option_value uuid:=(p_command->>'optionId')::uuid; response_value jsonb; queue integer[]; gap integer; remaining integer;
begin
  select * into s from public.practice_sessions where id=p_id and user_id=auth.uid() for update;
  if s.id is null then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  if jsonb_typeof(p_command) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_command) k where k not in ('eventId','revision','kind','ordinal','optionId','marked')) then raise exception 'Invalid command fields'; end if;
  select * into event from public.practice_events where session_id=p_id and event_id=eid;
  if event.event_id is not null then
    if event.payload<>p_command then raise exception 'EVENT_REUSED'; end if;
    return event.response;
  end if;
  if eid is null or action is null or action not in ('answer','mark','defer','submit') then raise exception 'Invalid command'; end if;
  if s.revision is distinct from (p_command->>'revision')::int then raise exception 'STALE_REVISION'; end if;
  if s.status<>'active' then raise exception 'Phiên đã nộp; không thể sửa kết quả.'; end if;
  if action='submit' then
    update public.practice_sessions set status='submitted',submitted_at=now(),revision=revision+1,updated_at=now() where id=p_id;
  else
    select * into q from public.practice_questions where session_id=p_id and ordinal=pos;
    if q.session_id is null then raise exception 'Invalid question'; end if;
    select * into a from public.practice_answers where session_id=p_id and ordinal=pos;
    queue:=array_remove(public.practice_queue(p_id),pos);
    if action='answer' then
      if option_value is null or not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=option_value::text) then raise exception 'Invalid option'; end if;
      if s.mode='learn' and a.option_id is not null then
        if not a.repeat_pending then raise exception 'Câu đã chấm không thể sửa.'; end if;
        update public.practice_answers set repeat_pending=false,repeat_option_id=option_value,updated_at=now() where session_id=p_id and ordinal=pos;
        update public.practice_sessions set repeat_answered=repeat_answered+1,
          repeat_correct=repeat_correct+case when option_value=q.correct_option_id then 1 else 0 end where id=p_id;
      else
        insert into public.practice_answers(session_id,ordinal,option_id) values(p_id,pos,option_value)
          on conflict(session_id,ordinal) do update set option_id=excluded.option_id,updated_at=now();
      end if;
      update public.practice_sessions set deferred_ordinals=array_remove(deferred_ordinals,pos) where id=p_id;
    elsif action='defer' then
      if s.mode<>'learn' then raise exception 'Chỉ hỏi lại trong Luyện học.'; end if;
      remaining:=cardinality(queue);
      if a.option_id is null and remaining=0 then raise exception 'Đây là từ cuối cùng chưa trả lời.'; end if;
      if a.option_id is not null then
        update public.practice_answers set repeat_pending=true,repeat_option_id=null,
          repeat_attempt=repeat_attempt+case when repeat_pending then 0 else 1 end,marked=true,updated_at=now()
          where session_id=p_id and ordinal=pos;
      else
        insert into public.practice_answers(session_id,ordinal,marked) values(p_id,pos,true)
          on conflict(session_id,ordinal) do update set marked=true,updated_at=now();
      end if;
      -- Insert after 1–3 other pending questions, before the tail when possible.
      gap:=case when remaining<2 then remaining else 1+(('x'||right(replace(eid::text,'-',''),4))::bit(16)::int % least(3,remaining-1)) end;
      queue:=coalesce(queue[1:gap],'{}')||array[pos]||coalesce(queue[gap+1:remaining],'{}');
      update public.practice_sessions set deferred_ordinals=array_append(array_remove(deferred_ordinals,pos),pos) where id=p_id;
    else
      if jsonb_typeof(p_command->'marked') is distinct from 'boolean' then raise exception 'Invalid mark'; end if;
      insert into public.practice_answers(session_id,ordinal,marked) values(p_id,pos,(p_command->>'marked')::bool)
        on conflict(session_id,ordinal) do update set marked=excluded.marked,updated_at=now();
    end if;
    update public.practice_sessions set revision=revision+1,updated_at=now(),
      learning_queue=case when mode='learn' and action in ('answer','defer') then queue else learning_queue end,
      cursor=case when mode='learn' and action in ('answer','defer') then coalesce(queue[1],pos)
        when action='answer' then least(pos+1,total-1) else cursor end where id=p_id;
  end if;
  response_value:=public.practice_meta(p_id);
  insert into public.practice_events(session_id,event_id,payload,response) values(p_id,eid,p_command,response_value);
  return response_value;
end $$;
commit;
