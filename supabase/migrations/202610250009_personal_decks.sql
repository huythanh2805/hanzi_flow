begin;
create table public.decks (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 80), description text not null default '' check(length(description)<=500),
  revision integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index decks_owner on public.decks(user_id,updated_at desc);
create table public.deck_entries (
  deck_id uuid not null references public.decks(id) on delete cascade,
  vocabulary_id text not null references public.vocabulary(id), created_at timestamptz not null default now(),
  primary key(deck_id,vocabulary_id)
);
alter table public.decks enable row level security;
alter table public.deck_entries enable row level security;
revoke all on public.decks,public.deck_entries from public,anon,authenticated;
grant select on public.decks,public.deck_entries to authenticated;
grant all on public.decks,public.deck_entries to service_role;
create policy decks_owner on public.decks for select to authenticated using(user_id=(select auth.uid()));
create policy deck_entries_owner on public.deck_entries for select to authenticated using(exists(select 1 from public.decks d where d.id=deck_id and d.user_id=(select auth.uid())));

create function public.deck_list() returns jsonb language sql stable security definer set search_path='' set jit=off as $$
  select coalesce(jsonb_agg(item order by smart desc,updated desc,id),'[]') from (
    select d.id::text id,false smart,d.updated_at::text updated,jsonb_build_object('id',d.id,'name',d.name,'description',d.description,'revision',d.revision,'createdAt',d.created_at,'updatedAt',d.updated_at,'total',count(e.vocabulary_id),'studied',count(*) filter(where u.state<>'NEW')) item
      from public.decks d left join public.deck_entries e on e.deck_id=d.id left join public.user_vocabulary u on u.user_id=d.user_id and u.vocabulary_id=e.vocabulary_id
      where d.user_id=auth.uid() group by d.id
    union all
    select x.id,true,'',jsonb_build_object('id',x.id,'name',x.name,'description','Tự cập nhật theo tiến độ của bạn','revision',0,'createdAt','','updatedAt','','smart',true,'total',count(u.vocabulary_id),'studied',count(*) filter(where u.state<>'NEW'))
      from (values ('saved','Từ đã lưu'),('difficult','Từ khó'),('learned','Từ đã học')) x(id,name)
      left join public.user_vocabulary u on u.user_id=auth.uid() and case x.id when 'saved' then u.favorite when 'difficult' then u.difficult else u.state<>'NEW' end
      where auth.uid() is not null group by x.id,x.name
  ) items;
$$;
create function public.deck_mutate(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' set jit=off as $$
declare uid uuid:=auth.uid(); action text:=p_command->>'kind'; target uuid; targets uuid[]; ids text[]; d public.decks; affected integer; added integer:=0;
begin
  if uid is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  if action is null or action not in ('create','update','delete','add','remove') then raise exception 'Invalid deck command'; end if;
  if action in ('create','update') and (p_command->>'name' is null or length(trim(p_command->>'name')) not between 1 and 80 or p_command->>'description' is null or length(p_command->>'description')>500) then raise exception 'Tên hoặc mô tả bộ từ không hợp lệ.'; end if;
  if action='create' then
    target:=(p_command->>'id')::uuid;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target::text,0));
    select * into d from public.decks where id=target;
    if d.id is not null then
      if d.user_id<>uid or d.name<>trim(p_command->>'name') or d.description<>trim(p_command->>'description') then raise exception 'Yêu cầu tạo bộ đã được sử dụng.'; end if;
    else insert into public.decks(id,user_id,name,description) values(target,uid,trim(p_command->>'name'),trim(p_command->>'description')); end if;
    return jsonb_build_object('id',target,'added',0);
  end if;
  if action='add' then select array_agg(distinct value::uuid order by value::uuid) into targets from jsonb_array_elements_text(p_command->'targets');
  else targets:=array[(p_command->>'id')::uuid]; end if;
  if coalesce(cardinality(targets),0) not between 1 and 50 then raise exception 'Hãy chọn bộ từ.'; end if;
  -- Lock all destinations in a fixed order before changing any membership.
  perform id from public.decks where id=any(targets) and user_id=uid order by id for update;
  if (select count(*) from public.decks where id=any(targets) and user_id=uid)<>cardinality(targets) then raise exception 'Bộ từ không tồn tại hoặc bạn không có quyền truy cập.' using errcode='42501'; end if;
  if action in ('update','delete') then
    select * into d from public.decks where id=targets[1];
    if d.revision is distinct from (p_command->>'revision')::integer then raise exception 'Bộ đã thay đổi ở tab khác. Hãy tải lại trước khi sửa.'; end if;
    if action='delete' then delete from public.decks where id=d.id;
    elsif d.name is distinct from trim(p_command->>'name') or d.description is distinct from trim(p_command->>'description') then
      update public.decks set name=trim(p_command->>'name'),description=trim(p_command->>'description'),revision=revision+1,updated_at=now() where id=d.id;
    end if;
  else
    select array_agg(distinct value) into ids from jsonb_array_elements_text(p_command->'ids');
    if coalesce(cardinality(ids),0) not between 1 and 11092 or exists(select 1 from unnest(ids) x where not exists(select 1 from public.vocabulary where id=x)) then raise exception 'Có mục từ không tồn tại trong thư viện.'; end if;
    foreach target in array targets loop
      if action='add' then
        insert into public.deck_entries(deck_id,vocabulary_id) select target,x from unnest(ids) x on conflict do nothing;
      else delete from public.deck_entries where deck_id=target and vocabulary_id=any(ids); end if;
      get diagnostics affected=row_count;
      added:=added+affected;
      if affected>0 then update public.decks set revision=revision+1,updated_at=now() where id=target; end if;
    end loop;
  end if;
  return jsonb_build_object('id',targets[1],'added',added);
end $$;

create function public.deck_resolve(p_refs text[],p_groups integer[] default null,p_size integer default 20,p_expected text default null)
returns jsonb language plpgsql stable security definer set search_path='' set jit=off as $$
declare uid uuid:=auth.uid(); refs text[]; custom uuid[]; ids text[]; selected text[]; fingerprint text; versions text; title_value text;
begin
  if uid is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  if coalesce(cardinality(p_refs),0) not between 1 and 50 or p_size not in (10,15,20,25,30) then raise exception 'Nguồn bộ từ không hợp lệ.'; end if;
  select array_agg(distinct x order by x) into refs from unnest(p_refs) x;
  select coalesce(array_agg(x::uuid),'{}') into custom from unnest(refs) x where x not in ('saved','difficult','learned');
  if exists(select 1 from unnest(custom) x where not exists(select 1 from public.decks where id=x and user_id=uid)) then raise exception 'Bộ từ không tồn tại hoặc bạn không có quyền truy cập.' using errcode='42501'; end if;
  select coalesce(array_agg(v.id order by case when v.band='7-9' then 7 else v.band::int end,v.source_order,v.id),'{}') into ids
    from public.vocabulary v where exists(select 1 from public.deck_entries e where e.deck_id=any(custom) and e.vocabulary_id=v.id)
      or exists(select 1 from public.user_vocabulary u where u.user_id=uid and u.vocabulary_id=v.id and
        ('saved'=any(refs) and u.favorite or 'difficult'=any(refs) and u.difficult or 'learned'=any(refs) and u.state<>'NEW'));
  select coalesce(string_agg(id::text||':'||revision::text,'|' order by id),'') into versions from public.decks where id=any(custom);
  fingerprint:=md5(array_to_string(refs,'|')||'|'||versions||'|'||array_to_string(ids,'|'));
  if p_expected is not null and p_expected<>fingerprint then raise exception 'SOURCE_CHANGED: Bộ từ đã thay đổi. Hãy chọn lại nhóm.'; end if;
  title_value:=case when cardinality(refs)>1 then cardinality(refs)||' bộ từ kết hợp' when refs[1]='saved' then 'Từ đã lưu' when refs[1]='difficult' then 'Từ khó' when refs[1]='learned' then 'Từ đã học' else (select name from public.decks where id=custom[1]) end;
  selected:=ids;
  if p_groups is not null then
    if cardinality(p_groups)=0 or exists(select 1 from unnest(p_groups) g where g<1 or g>ceil(cardinality(ids)::numeric/p_size)) then raise exception 'Nhóm đã thay đổi. Hãy chọn lại nhóm.'; end if;
    select coalesce(array_agg(id order by n),'{}') into selected from unnest(ids) with ordinality t(id,n) where ((n-1)/p_size+1)::int=any(p_groups);
  end if;
  return jsonb_build_object('studiedIds',(select coalesce(jsonb_agg(u.vocabulary_id),'[]') from public.user_vocabulary u where u.user_id=uid and u.vocabulary_id=any(selected) and u.state<>'NEW'),'ids',selected,'total',cardinality(ids),'fingerprint',fingerprint,'title',title_value);
end $$;

create function public.deck_words(p_refs text[],p_query text default '',p_band text default '',p_state text default '',p_page integer default 1,p_size integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' set jit=off as $$
declare snapshot jsonb; ids text[]; filtered text[]; page_ids text[]; items jsonb; progress jsonb; total_value integer;
  pattern text := '%' || replace(replace(replace(lower(extensions.unaccent(regexp_replace(coalesce(p_query,''),'\s','','g'))),'\','\\'),'%','\%'),'_','\_') || '%';
begin
  if p_page<1 or p_size not between 1 and 100 or length(p_query)>100 or p_state not in ('','NEW','LEARNING','MASTERED') or p_band not in ('','1','2','3','4','5','6','7-9') then raise exception 'Bộ lọc không hợp lệ.'; end if;
  snapshot:=public.deck_resolve(p_refs);
  select array_agg(value) into ids from jsonb_array_elements_text(snapshot->'ids');
  select coalesce(array_agg(v.id order by case when v.band='7-9' then 7 else v.band::int end,v.source_order,v.id),'{}') into filtered
    from public.vocabulary v left join public.user_vocabulary u on u.user_id=auth.uid() and u.vocabulary_id=v.id
    where v.id=any(ids) and (p_band='' or v.band=p_band) and (p_state='' or coalesce(u.state,'NEW')=p_state) and (p_query='' or v.search_text like pattern escape '\');
  total_value:=cardinality(filtered);page_ids:=filtered[(p_page-1)*p_size+1:p_page*p_size];
  select coalesce(jsonb_agg(to_jsonb(c) order by array_position(page_ids,c.id)),'[]') into items from public.catalogue_entries c where c.id=any(page_ids);
  select coalesce(jsonb_object_agg(u.vocabulary_id,to_jsonb(u)),'{}') into progress from public.user_vocabulary u where u.user_id=auth.uid() and u.vocabulary_id=any(page_ids);
  return jsonb_build_object('items',items,'total',total_value,'page',p_page,'pageSize',p_size,'progress',progress,'fingerprint',snapshot->>'fingerprint');
end $$;
revoke all on function public.deck_list(),public.deck_mutate(jsonb),public.deck_resolve(text[],integer[],integer,text),public.deck_words(text[],text,text,text,integer,integer) from public,anon;
grant execute on function public.deck_list(),public.deck_mutate(jsonb),public.deck_resolve(text[],integer[],integer,text),public.deck_words(text[],text,text,text,integer,integer) to authenticated;

alter function public.practice_create(jsonb) rename to practice_create_before_decks;
revoke all on function public.practice_create_before_decks(jsonb) from public,anon,authenticated;
create function public.practice_create(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' set jit=off as $$
declare uid uuid:=auth.uid(); src jsonb:=p_input->'source'; snapshot jsonb; refs text[]; groups integer[]; existing public.practice_sessions; result jsonb;
begin
  if uid is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  if src->>'kind'<>'decks' then return public.practice_create_before_decks(p_input); end if;
  if p_input ? 'exerciseTypes' and p_input->'exerciseTypes' is distinct from '["meaning_choice"]'::jsonb then raise exception 'Các dạng bài mới phải được chuẩn bị qua máy chủ.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||(p_input->>'requestId'),0));
  select * into existing from public.practice_sessions where user_id=uid and request_id=(p_input->>'requestId')::uuid;
  if existing.id is not null then
    if existing.source<>src or existing.mode<>p_input->>'mode' or existing.language<>p_input->>'language' or existing.direction<>p_input->>'direction' or existing.lesson_size<>(p_input->>'lessonSize')::int or existing.exercise_types<>array['meaning_choice'] then raise exception 'EVENT_REUSED'; end if;
    return public.practice_meta(existing.id);
  end if;
  select array_agg(value) into refs from jsonb_array_elements_text(src->'refs');
  if src ? 'groups' then select coalesce(array_agg(value::int),'{}') into groups from jsonb_array_elements_text(src->'groups'); end if;
  snapshot:=public.deck_resolve(refs,groups,(p_input->>'lessonSize')::int,src->>'fingerprint');
  result:=public.practice_create_before_decks(p_input||jsonb_build_object('source',jsonb_build_object('kind','entries','ids',snapshot->'ids')));
  update public.practice_sessions set source=src,title=snapshot->>'title' where id=(result->>'id')::uuid;
  return public.practice_meta((result->>'id')::uuid);
end $$;
revoke all on function public.practice_create(jsonb) from public,anon;
grant execute on function public.practice_create(jsonb) to authenticated;

create or replace function public.practice_install_exercises(p_owner uuid,p_input jsonb,p_questions jsonb,p_queue integer[],p_counts jsonb,p_board_count integer)
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
      when 'decks' then coalesce(p_input->>'deckTitle','Personal decks') when 'personal' then case p_input->'source'->>'filter' when 'learned' then 'Từ đã học' when 'favorite' then 'Từ đã lưu' else 'Từ khó' end
      when 'retry' then 'Luyện lại từ đã chọn' else 'Nhóm vừa học' end,
    total_value,(p_input->'source'->>'parentId')::uuid,types,p_counts,p_board_count,p_queue,p_queue[1]);
  if exists(select 1 from jsonb_array_elements(p_questions) q where not exists(select 1 from jsonb_array_elements(q->'options') o where o->>'id'=q->>'correctOptionId')) then raise exception 'Invalid private key'; end if;
    insert into public.practice_questions(session_id,ordinal,vocabulary_id,direction,prompt,prompt_pinyin,options,correct_option_id,feedback,exercise_type,board_id,audio_text,choice_snapshot)
    select sid,(q->>'ordinal')::int,q->>'vocabularyId',q->>'direction',q->>'prompt',q->>'promptPinyin',q->'options',(q->>'correctOptionId')::uuid,q->'feedback',coalesce(q->>'exerciseType','meaning_choice'),(q->>'boardId')::uuid,q->>'audioText',q->'choiceSnapshot' from jsonb_array_elements(p_questions) q;
  return sid;
end $$;
revoke all on function public.practice_install_exercises(uuid,jsonb,jsonb,integer[],jsonb,integer) from public,anon,authenticated;
grant execute on function public.practice_install_exercises(uuid,jsonb,jsonb,integer[],jsonb,integer) to service_role;


notify pgrst, 'reload schema';
commit;
