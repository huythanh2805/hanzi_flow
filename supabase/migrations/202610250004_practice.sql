-- Practice is separate from vocabulary progress and FSRS. No existing rows change.
begin;
create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, source jsonb not null, mode text not null check(mode in ('learn','exam')),
  direction text not null check(direction in ('mixed','word-meaning','meaning-word')), language text not null check(language in ('vi','en')),
  lesson_size integer not null check(lesson_size in (10,15,20,25,30)), title text not null,
  total integer not null check(total between 1 and 11092), status text not null default 'active' check(status in ('active','submitted')),
  revision integer not null default 0, cursor integer not null default 0,
  parent_id uuid references public.practice_sessions(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), submitted_at timestamptz,
  unique(user_id,request_id)
);
create index practice_sessions_owner on public.practice_sessions(user_id,updated_at desc);
create table public.practice_questions (
  session_id uuid not null references public.practice_sessions(id) on delete cascade, ordinal integer not null check(ordinal>=0),
  vocabulary_id text not null references public.vocabulary(id), direction text not null,
  prompt text not null, prompt_pinyin text, options jsonb not null check(jsonb_array_length(options)=4),
  correct_option_id uuid not null, feedback jsonb not null,
  primary key(session_id,ordinal), unique(session_id,vocabulary_id)
);
create table public.practice_answers (
  session_id uuid not null, ordinal integer not null, option_id uuid, marked boolean not null default false,
  updated_at timestamptz not null default now(), primary key(session_id,ordinal),
  foreign key(session_id,ordinal) references public.practice_questions(session_id,ordinal) on delete cascade
);
create table public.practice_events (
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  event_id uuid not null, payload jsonb not null, response jsonb not null,
  created_at timestamptz not null default now(), primary key(session_id,event_id)
);
do $$ declare t text; begin
  foreach t in array array['practice_sessions','practice_questions','practice_answers','practice_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
-- Sessions contain no answer keys. Raw question/answer/event tables are RPC-only.
grant select on public.practice_sessions to authenticated;
create policy practice_owner on public.practice_sessions for select to authenticated using((select auth.uid())=user_id);

create function public.practice_aliases(p_text text) returns text[] language sql immutable set search_path='' as $$
  select coalesce(array_agg(distinct value) filter(where value<>''),'{}') from (
    select trim(regexp_replace(coalesce(nullif(trim(regexp_replace(lower(pg_catalog.normalize(part,'NFC')),'\([^)]*\)|\[[^\]]*\]','','g')),''),lower(pg_catalog.normalize(part,'NFC'))),'[[:space:][:punct:]，。！？：；、“”‘’（）【】《》…·—–]+',' ','g')) value
    from regexp_split_to_table(p_text,E'[;,；，/\n]') part
  ) normalized;
$$;
revoke all on function public.practice_aliases(text) from public,anon,authenticated;

create function public.practice_meta(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',s.id,'title',s.title,'source',s.source,'mode',s.mode,'direction',s.direction,'language',s.language,
    'lessonSize',s.lesson_size,'total',s.total,'status',s.status,'revision',s.revision,'cursor',s.cursor,
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
revoke all on function public.practice_meta(uuid) from public,anon,authenticated;

create function public.practice_create(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set jit=off as $$
declare uid uuid:=auth.uid(); sid uuid; src jsonb:=p_input->'source'; kind text:=src->>'kind'; lang text:=p_input->>'language';
  mode_value text:=p_input->>'mode'; direction_value text:=p_input->>'direction'; size_value integer:=(p_input->>'lessonSize')::integer;
  request_value uuid:=(p_input->>'requestId')::uuid; parent_value uuid; title_value text; selected text[]; all_ids text[]; group_numbers integer[];
  lex jsonb[]; target_indices integer[]; selected_set jsonb; pool_map jsonb:='{}'; same_map jsonb; homographs jsonb;
  b text; cached_band text; ranks integer[]; same_n integer; start_n integer; idx integer; j integer; ordinal_value integer; target jsonb; candidate jsonb;
  chosen jsonb[]; used_words text[]; used_aliases text[]; candidate_aliases text[]; opts jsonb; option_value uuid; correct_value uuid;
  q_direction text; feedback_value jsonb; missing text[];
begin
  if uid is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  -- Serialize creation retries before doing any expensive work.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||request_value::text,0));
  select id into sid from public.practice_sessions where user_id=uid and request_id=request_value;
  if sid is not null then
    if exists(select 1 from public.practice_sessions where id=sid and (source is distinct from src or language is distinct from lang or direction is distinct from direction_value or lesson_size is distinct from size_value or (kind<>'retry' and mode is distinct from mode_value))) then raise exception 'EVENT_REUSED'; end if;
    return public.practice_meta(sid);
  end if;
  if request_value is null or lang not in ('vi','en') or mode_value not in ('learn','exam')
     or direction_value not in ('mixed','word-meaning','meaning-word') or size_value not in (10,15,20,25,30)
     or kind is null then raise exception 'Thiết lập bài luyện không hợp lệ.'; end if;
  if kind='band' then
    if src->>'band' not in ('1','2','3','4','5','6','7-9') then raise exception 'Band không hợp lệ.'; end if;
    select array_agg(id order by source_order) into selected from public.vocabulary where band=src->>'band';
    title_value:='Toàn bộ Band '||(src->>'band');
  elsif kind='groups' then
    if src->>'collectionType' not in ('band','topic') then raise exception 'Bộ từ không hợp lệ.'; end if;
    select array_agg(v.id order by case when v.band='7-9' then 7 else v.band::int end,v.source_order) into all_ids
    from public.vocabulary v where (src->>'collectionType'='band' and v.band=src->>'collectionId') or
      (src->>'collectionType'='topic' and exists(select 1 from public.vocabulary_topics vt where vt.vocabulary_id=v.id and vt.topic_id=src->>'collectionId'));
    select array_agg(distinct value::int) into group_numbers from jsonb_array_elements_text(src->'groups');
    if coalesce(cardinality(group_numbers),0)=0 or exists(select 1 from unnest(group_numbers) n where n<1 or n>ceil(coalesce(cardinality(all_ids),0)::numeric/size_value)) then
      raise exception 'Nhóm đã thay đổi. Hãy chọn lại nhóm.';
    end if;
    select array_agg(id order by ord) into selected from unnest(all_ids) with ordinality t(id,ord) where ((ord-1)/size_value+1)::int=any(group_numbers);
    title_value:=cardinality(group_numbers)||' nhóm · '||case when src->>'collectionType'='band' then 'Band '||(src->>'collectionId') else coalesce((select name from public.topics where id=src->>'collectionId'),'Chủ đề') end;
  elsif kind='personal' then
    if src->>'filter' not in ('learned','favorite','difficult') then raise exception 'Bộ lọc không hợp lệ.'; end if;
    select array_agg(v.id order by case when v.band='7-9' then 7 else v.band::int end,v.source_order) into selected
    from public.vocabulary v join public.user_vocabulary uv on uv.vocabulary_id=v.id and uv.user_id=uid
    where (src->>'filter'='learned' and uv.state<>'NEW') or (src->>'filter'='favorite' and uv.favorite) or (src->>'filter'='difficult' and uv.difficult);
    title_value:=case src->>'filter' when 'learned' then 'Từ đã học' when 'favorite' then 'Từ đã lưu' else 'Từ khó' end;
  elsif kind in ('entries','retry') then
    select array_agg(distinct value) into selected from jsonb_array_elements_text(src->'ids');
    if exists(select 1 from unnest(selected) x where not exists(select 1 from public.vocabulary where id=x)) then raise exception 'Mục từ không hợp lệ.'; end if;
    title_value:='Nhóm vừa học';
    if kind='retry' then
      parent_value:=(src->>'parentId')::uuid;
      if not exists(select 1 from public.practice_sessions where id=parent_value and user_id=uid and status='submitted') or
         exists(select 1 from unnest(selected) x where not exists(select 1 from public.practice_questions where session_id=parent_value and vocabulary_id=x)) then
        raise exception 'Không thể luyện lại phiên này.' using errcode='42501';
      end if;
      mode_value:='learn'; title_value:='Luyện lại · '||(select title from public.practice_sessions where id=parent_value);
    end if;
  else raise exception 'Nguồn từ không hợp lệ.'; end if;
  if coalesce(cardinality(selected),0) not between 1 and 11092 then raise exception 'Chưa có từ phù hợp để luyện tập.'; end if;
  sid:=gen_random_uuid();
  -- One compact lexicon, not the catalogue view's examples/audio payload.
  select array_agg(item order by band_rank,md5(request_value::text||id)) into lex from (
    select v.id,case when v.band='7-9' then 7 else v.band::int end band_rank,
      jsonb_build_object('id',v.id,'band',v.band,'word',v.word,'pinyin',v.pinyin,'meaning',coalesce(s.text,''),
        'aliases',public.practice_aliases(coalesce(s.text,'')),'senseId',s.id,'sourceId',coalesce(s.source_id,v.source_id),
        'sourceUrl',s.source_url,'attribution',s.attribution,'translationMeta',s.translation_meta->lang) item
    from public.vocabulary v left join lateral (
      select vs.*,vt.text from public.vocabulary_senses vs join public.vocabulary_translations vt on vt.sense_id=vs.id and vt.language=lang
      where vs.vocabulary_id=v.id and trim(vt.text)<>'' and cardinality(public.practice_aliases(vt.text))>0 order by vs.sort_order,vs.id limit 1
    ) s on true
  ) lexical;
  select jsonb_object_agg(x,true) into selected_set from unnest(selected) x;
  select array_agg(ord::int order by md5(request_value::text||(item->>'id'))) into target_indices
    from unnest(lex) with ordinality t(item,ord) where selected_set ? (item->>'id');
  select array_agg(item->>'id') into missing from unnest(lex) item where selected_set ? (item->>'id') and (item->>'meaning'='' or jsonb_array_length(item->'aliases')=0);
  if coalesce(cardinality(missing),0)>0 then raise exception 'Không thể tạo bài đầy đủ: % mục thiếu nghĩa (%).',cardinality(missing),array_to_string(missing[1:8],', '); end if;
  select jsonb_object_agg(band,n) into same_map from (select item->>'band' band,count(*) n from unnest(lex) item where item->>'meaning'<>'' group by item->>'band') c;
  select jsonb_object_agg(word,n) into homographs from (select word,count(*) n from public.vocabulary group by word having count(*)>1) c;
  foreach b in array array['1','2','3','4','5','6','7-9'] loop
    select array_agg(ord::int order by case when item->>'band'=b then 0 else 1 end,ord) into ranks
      from unnest(lex) with ordinality t(item,ord) where item->>'meaning'<>'' and
        (case when item->>'band'='7-9' then 7 else (item->>'band')::int end)<=(case when b='7-9' then 7 else b::int end);
    pool_map:=pool_map||jsonb_build_object(b,to_jsonb(ranks));
  end loop;
  insert into public.practice_sessions(id,user_id,request_id,source,mode,direction,language,lesson_size,title,total,parent_id)
    values(sid,uid,request_value,src,mode_value,direction_value,lang,size_value,title_value,cardinality(selected),parent_value);
  for ordinal_value in 0..cardinality(target_indices)-1 loop
    target:=lex[target_indices[ordinal_value+1]]; b:=target->>'band';
    if b is distinct from cached_band then
      select array_agg(value::int) into ranks from jsonb_array_elements_text(pool_map->b);
      same_n:=coalesce((same_map->>b)::int,0);cached_band:=b;
    end if;
    start_n:=(('x'||substr(md5(request_value::text||(target->>'id')),1,8))::bit(32)::bigint % greatest(same_n,1))::int;
    chosen:=array[target]; used_words:=array[target->>'word'];
    select array_agg(value) into used_aliases from jsonb_array_elements_text(target->'aliases');
    for j in 0..cardinality(ranks)-1 loop
      exit when cardinality(chosen)=4;
      idx:=case when j<same_n then ranks[(start_n+j)%same_n+1] else ranks[j+1] end;
      candidate:=lex[idx];
      select coalesce(array_agg(value),'{}') into candidate_aliases from jsonb_array_elements_text(candidate->'aliases');
      if candidate->>'word'=any(used_words) or candidate_aliases&&used_aliases or cardinality(candidate_aliases)=0 then continue; end if;
      chosen:=array_append(chosen,candidate); used_words:=array_append(used_words,candidate->>'word'); used_aliases:=used_aliases||candidate_aliases;
    end loop;
    if cardinality(chosen)<>4 then raise exception 'Không đủ đáp án phân biệt cho %. Chưa tạo bài; không bỏ qua mục từ.',target->>'id'; end if;
    q_direction:=case when direction_value='mixed' then case when ordinal_value%2=0 then 'word-meaning' else 'meaning-word' end else direction_value end;
    opts:='[]';correct_value:=null;
    for candidate in select x from unnest(chosen) x order by md5(request_value::text||(target->>'id')||(x->>'id')) loop
      option_value:=gen_random_uuid();
      opts:=opts||jsonb_build_array(jsonb_build_object('id',option_value,'label',case when q_direction='word-meaning' then candidate->>'meaning' else candidate->>'word' end));
      if candidate->>'id'=target->>'id' then correct_value:=option_value; end if;
    end loop;
    feedback_value:=jsonb_strip_nulls(jsonb_build_object('vocabularyId',target->>'id','word',target->>'word','pinyin',target->>'pinyin',
      'meaning',target->>'meaning','senseId',target->>'senseId','sourceId',target->>'sourceId','sourceUrl',target->'sourceUrl',
      'attribution',target->'attribution','translationMeta',target->'translationMeta'));
    insert into public.practice_questions(session_id,ordinal,vocabulary_id,direction,prompt,prompt_pinyin,options,correct_option_id,feedback)
      values(sid,ordinal_value,target->>'id',q_direction,case when q_direction='word-meaning' then target->>'word' else target->>'meaning' end,
        case when q_direction='word-meaning' and homographs ? (target->>'word') then target->>'pinyin' else null end,opts,correct_value,feedback_value);
  end loop;
  return public.practice_meta(sid);
end $$;

create function public.practice_read(p_id uuid,p_offset integer default 0,p_limit integer default 25) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.practice_sessions; qs jsonb; begin
  select * into s from public.practice_sessions where id=p_id and user_id=auth.uid();
  if s.id is null then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  if p_offset<0 or p_limit not between 1 and 100 then raise exception 'Invalid page'; end if;
  select coalesce(jsonb_agg(item order by ordinal),'[]') into qs from (
    select q.ordinal,jsonb_strip_nulls(jsonb_build_object('ordinal',q.ordinal,'direction',q.direction,'prompt',q.prompt,'promptPinyin',q.prompt_pinyin,
      'options',q.options,'selectedOptionId',a.option_id,'marked',coalesce(a.marked,false),
      'feedback',case when s.status='submitted' or (s.mode='learn' and a.option_id is not null) then q.feedback||jsonb_build_object('correctOptionId',q.correct_option_id,'isCorrect',case when a.option_id is null then null else a.option_id=q.correct_option_id end) else null end)) item
    from public.practice_questions q left join public.practice_answers a using(session_id,ordinal)
    where q.session_id=p_id and q.ordinal>=p_offset and q.ordinal<p_offset+p_limit
  ) page;
  return jsonb_build_object('session',public.practice_meta(p_id),'questions',qs);
end $$;

create function public.practice_commit(p_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if eid is null or action not in ('answer','mark','submit') then raise exception 'Invalid command'; end if;
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
    else
      if jsonb_typeof(p_command->'marked') is distinct from 'boolean' then raise exception 'Invalid mark'; end if;
      insert into public.practice_answers(session_id,ordinal,marked) values(p_id,pos,(p_command->>'marked')::bool)
        on conflict(session_id,ordinal) do update set marked=excluded.marked,updated_at=now();
    end if;
    update public.practice_sessions set revision=revision+1,updated_at=now(),cursor=case when action='answer' then least(pos+1,total-1) else cursor end where id=p_id;
  end if;
  response_value:=public.practice_meta(p_id);
  insert into public.practice_events(session_id,event_id,payload,response) values(p_id,eid,p_command,response_value);
  return response_value;
end $$;

create function public.practice_result_ids(p_id uuid,p_filter text default 'wrong') returns text[] language plpgsql security definer set search_path='' as $$
declare result text[]; begin
  if not exists(select 1 from public.practice_sessions where id=p_id and user_id=auth.uid() and status='submitted') then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  if p_filter not in ('all','wrong','marked') then raise exception 'Invalid filter'; end if;
  select coalesce(array_agg(q.vocabulary_id order by q.ordinal),'{}') into result
    from public.practice_questions q left join public.practice_answers a using(session_id,ordinal) where q.session_id=p_id and
      (p_filter='all' or (p_filter='wrong' and a.option_id is distinct from q.correct_option_id) or (p_filter='marked' and a.marked));
  return result;
end $$;
create function public.practice_mark_difficult(p_id uuid,p_ids text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; uid uuid:=auth.uid(); begin
  if not exists(select 1 from public.practice_sessions where id=p_id and user_id=uid and status='submitted') then raise exception 'SESSION_NOT_FOUND' using errcode='42501'; end if;
  if cardinality(p_ids) not between 1 and 11092 or exists(select 1 from unnest(p_ids) x where not exists(select 1 from public.practice_questions where session_id=p_id and vocabulary_id=x)) then raise exception 'Invalid selection'; end if;
  with patched as (
    insert into public.user_vocabulary(user_id,vocabulary_id,difficult) select uid,x,true from (select distinct unnest(p_ids) x) chosen
    on conflict(user_id,vocabulary_id) do update set difficult=true,updated_at=now()
    returning vocabulary_id,state,favorite,difficult,suspended,studied_at,updated_at
  ) select coalesce(jsonb_agg(to_jsonb(patched)),'[]') into result from patched;
  return result;
end $$;
create function public.practice_list() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(public.practice_meta(id) order by updated_at desc),'[]')
    from (select id,updated_at from public.practice_sessions where user_id=auth.uid() order by updated_at desc limit 20) recent;
$$;
revoke all on function public.practice_list() from public,anon;
grant execute on function public.practice_list() to authenticated;
revoke all on function public.practice_create(jsonb), public.practice_read(uuid,integer,integer), public.practice_commit(uuid,jsonb), public.practice_result_ids(uuid,text), public.practice_mark_difficult(uuid,text[]) from public,anon;
grant execute on function public.practice_create(jsonb), public.practice_read(uuid,integer,integer), public.practice_commit(uuid,jsonb), public.practice_result_ids(uuid,text), public.practice_mark_difficult(uuid,text[]) to authenticated;
commit;
