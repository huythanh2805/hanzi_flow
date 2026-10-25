begin;

-- Reorder unanswered learning questions without duplicating their canonical ID
-- or changing their first-answer score. Existing sessions start with an empty queue.
alter table public.practice_sessions add column deferred_ordinals integer[] not null default '{}';

create function public.practice_next_pending(p_id uuid) returns integer language sql stable security definer set search_path='' as $$
  select q.ordinal from public.practice_sessions s
  join public.practice_questions q on q.session_id=s.id
  left join public.practice_answers a on a.session_id=q.session_id and a.ordinal=q.ordinal
  where s.id=p_id and s.user_id=auth.uid() and a.option_id is null
  order by array_position(s.deferred_ordinals,q.ordinal) nulls first,q.ordinal limit 1;
$$;
revoke all on function public.practice_next_pending(uuid) from public,anon,authenticated;

create or replace function public.practice_meta(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',s.id,'title',s.title,'source',s.source,'mode',s.mode,'direction',s.direction,'language',s.language,
    'lessonSize',s.lesson_size,'total',s.total,'status',s.status,'revision',s.revision,'cursor',s.cursor,
    'deferredCount',cardinality(s.deferred_ordinals),
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
      'options',q.options,'selectedOptionId',a.option_id,'marked',coalesce(a.marked,false),
      'deferred',q.ordinal=any(s.deferred_ordinals),
      'feedback',case when s.status='submitted' or (s.mode='learn' and a.option_id is not null) then q.feedback||jsonb_build_object('correctOptionId',q.correct_option_id,'isCorrect',case when a.option_id is null then null else a.option_id=q.correct_option_id end) else null end)) item
    from public.practice_questions q left join public.practice_answers a using(session_id,ordinal)
    where q.session_id=p_id and q.ordinal>=p_offset and q.ordinal<p_offset+p_limit
  ) page;
  return jsonb_build_object('session',public.practice_meta(p_id),'questions',qs);
end $$;

create or replace function public.practice_commit(p_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.practice_sessions; event public.practice_events; q public.practice_questions; a public.practice_answers;
  eid uuid:=(p_command->>'eventId')::uuid; action text:=p_command->>'kind'; pos integer:=(p_command->>'ordinal')::int; option_value uuid:=(p_command->>'optionId')::uuid; response_value jsonb;
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
    if action='answer' then
      if option_value is null or not exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=option_value::text) then raise exception 'Invalid option'; end if;
      if s.mode='learn' and a.option_id is not null then raise exception 'Câu đã chấm không thể sửa.'; end if;
      insert into public.practice_answers(session_id,ordinal,option_id) values(p_id,pos,option_value)
        on conflict(session_id,ordinal) do update set option_id=excluded.option_id,updated_at=now();
      update public.practice_sessions set deferred_ordinals=array_remove(deferred_ordinals,pos) where id=p_id;
    elsif action='defer' then
      if s.mode<>'learn' or a.option_id is not null then raise exception 'Chỉ hỏi lại sau với câu Luyện học chưa trả lời.'; end if;
      if not exists(select 1 from public.practice_questions pq left join public.practice_answers pa using(session_id,ordinal)
        where pq.session_id=p_id and pq.ordinal<>pos and pa.option_id is null) then raise exception 'Đây là từ cuối cùng chưa trả lời.'; end if;
      insert into public.practice_answers(session_id,ordinal,marked) values(p_id,pos,true)
        on conflict(session_id,ordinal) do update set marked=true,updated_at=now();
      update public.practice_sessions set deferred_ordinals=array_append(array_remove(deferred_ordinals,pos),pos) where id=p_id;
    else
      if jsonb_typeof(p_command->'marked') is distinct from 'boolean' then raise exception 'Invalid mark'; end if;
      insert into public.practice_answers(session_id,ordinal,marked) values(p_id,pos,(p_command->>'marked')::bool)
        on conflict(session_id,ordinal) do update set marked=excluded.marked,updated_at=now();
    end if;
    update public.practice_sessions set revision=revision+1,updated_at=now(),cursor=case
      when mode='learn' and action in ('answer','defer') then coalesce(public.practice_next_pending(p_id),pos)
      when action='answer' then least(pos+1,total-1) else cursor end where id=p_id;
  end if;
  response_value:=public.practice_meta(p_id);
  insert into public.practice_events(session_id,event_id,payload,response) values(p_id,eid,p_command,response_value);
  return response_value;
end $$;
commit;
