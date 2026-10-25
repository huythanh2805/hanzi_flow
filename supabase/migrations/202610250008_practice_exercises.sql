-- Additive exercise snapshots. Existing MCQ sessions retain their keys and score.
begin;
alter table public.practice_sessions add column exercise_types text[] not null default array['meaning_choice'],
  add column exercise_counts jsonb, add column board_count integer not null default 0;
alter table public.practice_questions drop constraint practice_questions_options_check;
alter table public.practice_questions add constraint practice_questions_options_check check(jsonb_array_length(options) between 2 and 4),
  add column exercise_type text not null default 'meaning_choice' check(exercise_type in ('meaning_choice','listening_choice','matching')),
  add column board_id uuid, add column audio_text text, add column choice_snapshot jsonb;
create index practice_questions_board on public.practice_questions(session_id,board_id) where board_id is not null;
alter table public.practice_answers add column first_variant text not null default 'primary' check(first_variant in ('primary','choice')),
  add column active_variant text not null default 'primary' check(active_variant in ('primary','choice')),
  add column matching_resolved boolean not null default false, add column board_removed boolean not null default false,
  add column last_correct boolean;

-- Public lexical content only: compact and unpaginated, avoiding the 1000-row REST cap.
create function public.practice_lexicon(p_language text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
  if auth.uid() is null or p_language not in ('vi','en') then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  select jsonb_agg(jsonb_build_object('id',v.id,'word',v.word,'pinyin',v.pinyin,'band',v.band,'sourceOrder',v.source_order,
    'topics',coalesce((select jsonb_agg(topic_id) from public.vocabulary_topics where vocabulary_id=v.id),'[]'),
    'meaning',coalesce(s.text,''),'aliases',public.practice_aliases(coalesce(s.text,'')),
    'senseId',s.id,'sourceId',coalesce(s.source_id,v.source_id),'sourceUrl',s.source_url,'attribution',s.attribution,
    'translationMeta',s.translation_meta->p_language) order by v.id) into result
  from public.vocabulary v left join lateral (
    select vs.*,vt.text from public.vocabulary_senses vs join public.vocabulary_translations vt on vt.sense_id=vs.id and vt.language=p_language
    where vs.vocabulary_id=v.id and trim(vt.text)<>'' and cardinality(public.practice_aliases(vt.text))>0 order by vs.sort_order,vs.id limit 1
  ) s on true;
  return result;
end $$;
revoke all on function public.practice_lexicon(text) from public,anon;
grant execute on function public.practice_lexicon(text) to authenticated;

-- Trusted server installation, one transaction. Never callable using a browser JWT.
create function public.practice_install_exercises(p_owner uuid,p_input jsonb,p_questions jsonb,p_queue integer[],p_counts jsonb,p_board_count integer)
returns uuid language plpgsql security definer set search_path='' set jit=off set statement_timeout='60s' as $$
declare sid uuid; types text[]; total_value integer:=jsonb_array_length(p_questions); old public.practice_sessions;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||(p_input->>'requestId'),0));
  select array_agg(value order by value) into types from jsonb_array_elements_text(p_input->'exerciseTypes');
  if p_input->>'mode' is distinct from 'learn' or total_value not between 1 and 11092 or cardinality(types) not between 1 and 3
    or not types <@ array['meaning_choice','listening_choice','matching'] then raise exception 'Invalid exercise recipe'; end if;
  select * into old from public.practice_sessions where user_id=p_owner and request_id=(p_input->>'requestId')::uuid for update;
  if old.id is not null then
    if old.source<>p_input->'source' or old.mode<>p_input->>'mode' or old.language<>p_input->>'language'
      or old.direction<>p_input->>'direction' or old.lesson_size<>(p_input->>'lessonSize')::int
      or not (old.exercise_types @> types and old.exercise_types <@ types) then raise exception 'EVENT_REUSED'; end if;
    return old.id;
  end if;
  if (select count(distinct (x->>'ordinal')::int) from jsonb_array_elements(p_questions) x)<>total_value
    or (select min((x->>'ordinal')::int)<>0 or max((x->>'ordinal')::int)<>total_value-1 from jsonb_array_elements(p_questions) x)
    or cardinality(p_queue)<>total_value or (select count(distinct n) from unnest(p_queue) n)<>total_value then raise exception 'Incomplete recipe'; end if;
  sid:=gen_random_uuid();
  insert into public.practice_sessions(id,user_id,request_id,source,mode,direction,language,lesson_size,title,total,parent_id,exercise_types,exercise_counts,board_count,learning_queue,cursor)
  values(sid,p_owner,(p_input->>'requestId')::uuid,p_input->'source','learn',p_input->>'direction',p_input->>'language',(p_input->>'lessonSize')::int,
    case p_input->'source'->>'kind' when 'band' then 'Toàn bộ Band '||(p_input->'source'->>'band')
      when 'groups' then jsonb_array_length(p_input->'source'->'groups')||' nhóm · '||case when p_input->'source'->>'collectionType'='band' then 'Band '||(p_input->'source'->>'collectionId') else coalesce((select name from public.topics where id=p_input->'source'->>'collectionId'),'Chủ đề') end
      when 'personal' then case p_input->'source'->>'filter' when 'learned' then 'Từ đã học' when 'favorite' then 'Từ đã lưu' else 'Từ khó' end
      when 'retry' then 'Luyện lại từ đã chọn' else 'Nhóm vừa học' end,
    total_value,(p_input->'source'->>'parentId')::uuid,types,p_counts,p_board_count,p_queue,p_queue[1]);
  if exists(select 1 from jsonb_array_elements(p_questions) q where not exists(select 1 from jsonb_array_elements(q->'options') o where o->>'id'=q->>'correctOptionId')) then raise exception 'Invalid private key'; end if;
    insert into public.practice_questions(session_id,ordinal,vocabulary_id,direction,prompt,prompt_pinyin,options,correct_option_id,feedback,exercise_type,board_id,audio_text,choice_snapshot)
    select sid,(q->>'ordinal')::int,q->>'vocabularyId',q->>'direction',q->>'prompt',q->>'promptPinyin',q->'options',(q->>'correctOptionId')::uuid,q->'feedback',coalesce(q->>'exerciseType','meaning_choice'),(q->>'boardId')::uuid,q->>'audioText',q->'choiceSnapshot' from jsonb_array_elements(p_questions) q;
  return sid;
end $$;
revoke all on function public.practice_install_exercises(uuid,jsonb,jsonb,integer[],jsonb,integer) from public,anon,authenticated;
grant execute on function public.practice_install_exercises(uuid,jsonb,jsonb,integer[],jsonb,integer) to service_role;

create function public.practice_key(q public.practice_questions,variant text) returns uuid language sql immutable set search_path='' as $$
  select case when variant='choice' and q.choice_snapshot is not null then (q.choice_snapshot->>'correctOptionId')::uuid else q.correct_option_id end;
$$;
revoke all on function public.practice_key(public.practice_questions,text) from public,anon,authenticated;

create function public.practice_public_question(p_id uuid,p_ordinal integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.practice_sessions; q public.practice_questions; a public.practice_answers; variant text; view_value jsonb; matching boolean; selected uuid; shown boolean; result jsonb; members jsonb; opts jsonb;
begin
  select * into s from public.practice_sessions where id=p_id and user_id=auth.uid();
  if s.id is null then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  select * into q from public.practice_questions where session_id=p_id and ordinal=p_ordinal;
  select * into a from public.practice_answers where session_id=p_id and ordinal=p_ordinal;
  variant:=case when s.status='submitted' then coalesce(a.first_variant,'primary') else coalesce(a.active_variant,'primary') end;
  view_value:=case when variant='choice' and q.choice_snapshot is not null then q.choice_snapshot else jsonb_build_object('prompt',q.prompt,'promptPinyin',q.prompt_pinyin,'direction',q.direction,'options',q.options) end;
  matching:=q.exercise_type='matching' and variant='primary' and s.status<>'submitted';
  selected:=case when s.status='submitted' or s.mode='exam' then a.option_id when a.repeat_pending then null else coalesce(a.repeat_option_id,a.option_id) end;
  shown:=s.status='submitted' or (s.mode='learn' and selected is not null and (not matching or a.matching_resolved));
  result:=jsonb_build_object('ordinal',q.ordinal,'variant',variant,'exerciseType',case when variant='choice' then 'meaning_choice' else q.exercise_type end,
    'prompt',view_value->>'prompt','promptPinyin',view_value->>'promptPinyin','direction',view_value->>'direction','options',view_value->'options',
    'selectedOptionId',case when matching and not coalesce(a.matching_resolved,false) then null else selected end,
    'marked',coalesce(a.marked,false),'deferred',q.ordinal=any(s.deferred_ordinals),'resolved',coalesce(a.matching_resolved,false),
    'audioText',case when q.exercise_type='listening_choice' and variant='primary' then q.audio_text else null end,
    'lastAttempt',case when matching and selected is not null and a.last_correct=false then jsonb_build_object('optionId',selected,'isCorrect',false) else null end,
    'feedback',case when shown then q.feedback||jsonb_build_object('correctOptionId',public.practice_key(q,variant),'isCorrect',case when selected is null then null else selected=public.practice_key(q,variant) end) else null end);
  if matching then
    select coalesce(jsonb_agg(jsonb_build_object('ordinal',b.ordinal,'word',b.feedback->>'word','pinyin',b.feedback->>'pinyin',
      'resolved',coalesce(ba.matching_resolved,false),'incorrect',coalesce(ba.last_correct=false,false)) order by b.ordinal),'[]') into members
      from public.practice_questions b left join public.practice_answers ba using(session_id,ordinal) where b.session_id=p_id and b.board_id=q.board_id and not coalesce(ba.board_removed,false);
    select coalesce(jsonb_agg(o),'[]') into opts from jsonb_array_elements(q.options) o where not exists(
      select 1 from public.practice_questions b join public.practice_answers ba using(session_id,ordinal)
      where b.session_id=p_id and b.board_id=q.board_id and ba.board_removed and b.correct_option_id::text=o->>'id');
    result:=result||jsonb_build_object('board',jsonb_build_object('id',q.board_id,'members',members,'options',opts));
  end if;
  return jsonb_strip_nulls(result);
end $$;
revoke all on function public.practice_public_question(uuid,integer) from public,anon,authenticated;

create or replace function public.practice_read(p_id uuid,p_offset integer default 0,p_limit integer default 25) returns jsonb language plpgsql security definer set search_path='' as $$
declare qs jsonb; begin
  if not exists(select 1 from public.practice_sessions where id=p_id and user_id=auth.uid()) then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  if p_offset<0 or p_limit not between 1 and 100 then raise exception 'Invalid page'; end if;
  select coalesce(jsonb_agg(public.practice_public_question(p_id,q.ordinal) order by q.ordinal),'[]') into qs
  from public.practice_questions q where q.session_id=p_id and (q.ordinal>=p_offset and q.ordinal<p_offset+p_limit or
    (exists(select 1 from public.practice_sessions where id=p_id and status='active') and q.board_id in
      (select b.board_id from public.practice_questions b where b.session_id=p_id and b.ordinal>=p_offset and b.ordinal<p_offset+p_limit)));
  return jsonb_build_object('session',public.practice_meta(p_id),'questions',qs);
end $$;

create or replace function public.practice_meta(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',s.id,'title',s.title,'source',s.source,'mode',s.mode,'direction',s.direction,'language',s.language,
    'exerciseTypes',s.exercise_types,'exerciseCounts',s.exercise_counts,'boardCount',s.board_count,
    'typeStats',case when s.mode='learn' or s.status='submitted' then (select coalesce(jsonb_object_agg(t.kind,jsonb_build_object('answered',t.n,'correct',t.c)),'{}') from (select case when a.first_variant='choice' then 'meaning_choice' else q.exercise_type end kind,count(a.option_id) n,count(*) filter(where a.option_id=public.practice_key(q,a.first_variant)) c from public.practice_questions q left join public.practice_answers a using(session_id,ordinal) where q.session_id=s.id group by 1) t) else null end,
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
      count(*) filter(where a.option_id=public.practice_key(q,a.first_variant))::int correct
    from public.practice_questions q left join public.practice_answers a using(session_id,ordinal) where q.session_id=s.id
  ) counts where s.id=p_id and s.user_id=auth.uid();
$$;


create or replace function public.practice_commit(p_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.practice_sessions; event public.practice_events; q public.practice_questions; a public.practice_answers;
  eid uuid:=(p_command->>'eventId')::uuid; action text:=p_command->>'kind'; pos integer:=(p_command->>'ordinal')::int;
  option_value uuid:=(p_command->>'optionId')::uuid; response_value jsonb; queue integer[]; gap integer; remaining integer; bounds integer[]; opts jsonb; key_value uuid; matching boolean; active_value text;
begin
  select * into s from public.practice_sessions where id=p_id and user_id=auth.uid() for update;
  if s.id is null then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  if jsonb_typeof(p_command) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_command) k where k not in ('eventId','revision','kind','ordinal','optionId','marked','variant')) then raise exception 'Invalid command fields'; end if;
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
    active_value:=coalesce(a.active_variant,'primary');
    matching:=q.exercise_type='matching' and active_value='primary';
    opts:=case when active_value='choice' and q.choice_snapshot is not null then q.choice_snapshot->'options' else q.options end;
    key_value:=public.practice_key(q,active_value);
    queue:=array_remove(public.practice_queue(p_id),pos);
    if action='answer' then
      if coalesce(p_command->>'variant','primary')<>active_value then raise exception 'VARIANT_CHANGED'; end if;
      if matching and exists(select 1 from public.practice_questions b join public.practice_answers ba using(session_id,ordinal) where b.session_id=p_id and b.board_id=q.board_id and b.correct_option_id=option_value and (ba.matching_resolved or ba.board_removed)) then raise exception 'PAIR_UNAVAILABLE'; end if;
      if option_value is null or not exists(select 1 from jsonb_array_elements(opts) o where o->>'id'=option_value::text) then raise exception 'Invalid option'; end if;
      if s.mode='learn' and a.option_id is not null then
        if not a.repeat_pending and not (matching and not a.matching_resolved) then raise exception 'Câu đã chấm không thể sửa.'; end if;
        update public.practice_answers set repeat_pending=false,repeat_option_id=option_value,last_correct=option_value=key_value,matching_resolved=case when matching then option_value=key_value else matching_resolved end,updated_at=now() where session_id=p_id and ordinal=pos;
        update public.practice_sessions set repeat_answered=repeat_answered+1,
          repeat_correct=repeat_correct+case when option_value=key_value then 1 else 0 end where id=p_id;
      else
        insert into public.practice_answers(session_id,ordinal,option_id,first_variant,last_correct,matching_resolved) values(p_id,pos,option_value,active_value,option_value=key_value,matching and option_value=key_value)
          on conflict(session_id,ordinal) do update set option_id=excluded.option_id,first_variant=excluded.first_variant,last_correct=excluded.last_correct,matching_resolved=excluded.matching_resolved,updated_at=now();
      end if;
      if matching and option_value<>key_value then queue:=public.practice_queue(p_id); end if;
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
      if q.exercise_type<>'meaning_choice' and q.choice_snapshot is not null then update public.practice_answers set active_variant='choice',board_removed=true where session_id=p_id and ordinal=pos; end if;
      -- Insert only between activities, so an intact board is never interrupted.
      select array_agg(idx order by idx) into bounds from (
        select n,idx,activity,lead(activity) over(order by idx) next_activity from (
          select n,idx,case when coalesce(ba.active_variant,'primary')='choice' then n::text else coalesce(b.board_id::text,n::text) end activity
          from unnest(queue) with ordinality t(n,idx) join public.practice_questions b on b.session_id=p_id and b.ordinal=n left join public.practice_answers ba on ba.session_id=p_id and ba.ordinal=n
        ) x
      ) y where next_activity is null or next_activity<>activity;
      gap:=coalesce(bounds[public.practice_repeat_slot(eid,coalesce(cardinality(bounds),0))],0);
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

create or replace function public.practice_result_ids(p_id uuid,p_filter text default 'wrong') returns text[] language plpgsql security definer set search_path='' as $$
declare result text[]; begin
  if not exists(select 1 from public.practice_sessions where id=p_id and user_id=auth.uid() and status='submitted') then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  if p_filter not in ('all','wrong','marked') then raise exception 'Invalid filter'; end if;
  select coalesce(array_agg(q.vocabulary_id order by q.ordinal),'{}') into result
    from public.practice_questions q left join public.practice_answers a using(session_id,ordinal) where q.session_id=p_id and
      (p_filter='all' or (p_filter='wrong' and a.option_id is distinct from public.practice_key(q,a.first_variant)) or (p_filter='marked' and a.marked));
  return result;
end $$;

-- Raw client RPCs cannot silently create an exam with unsupported activities.
alter function public.practice_create(jsonb) rename to practice_create_mcq;
revoke all on function public.practice_create_mcq(jsonb) from public,anon,authenticated;
create function public.practice_create(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  if p_input ? 'exerciseTypes' then
    if jsonb_typeof(p_input->'exerciseTypes') is distinct from 'array' then raise exception 'Invalid exercise types'; end if;
    if jsonb_array_length(p_input->'exerciseTypes')<>1 or p_input->'exerciseTypes'->>0 is distinct from 'meaning_choice' then
      raise exception 'Các dạng bài mới chỉ hỗ trợ Luyện học và phải được chuẩn bị qua máy chủ.';
    end if;
  end if;
  result:=public.practice_create_mcq(p_input-'exerciseTypes');
  if result->'exerciseTypes' is distinct from '["meaning_choice"]'::jsonb then raise exception 'EVENT_REUSED'; end if;
  return result;
end $$;
revoke all on function public.practice_create(jsonb) from public,anon;
grant execute on function public.practice_create(jsonb) to authenticated;
commit;
