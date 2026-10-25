-- Phase 1. Run with Supabase migrations, not a browser client.
begin;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table public.vocabulary_sources (
  id text primary key, name text not null, repository text, commit text, version text not null,
  standard text, license text not null, attribution text not null, metadata jsonb not null default '{}'
);
create table public.vocabulary (
  id text primary key, source_id text not null references public.vocabulary_sources(id),
  band text not null check (band in ('1','2','3','4','5','6','7-9')),
  word text not null, pinyin text not null, official_entry text not null, official_pinyin text not null,
  source_order integer not null check (source_order > 0), search_text text not null,
  unique(source_id,band,source_order)
);
create index vocabulary_band_order on public.vocabulary(band,source_order);
create index vocabulary_search on public.vocabulary using gin (search_text extensions.gin_trgm_ops);
create table public.vocabulary_senses (
  id text primary key, vocabulary_id text not null references public.vocabulary(id),
  source_id text not null references public.vocabulary_sources(id), part_of_speech text, sort_order integer not null default 0
);
create table public.vocabulary_translations (
  sense_id text not null references public.vocabulary_senses(id), language text not null check(language in ('vi','en')),
  text text not null, source_id text not null references public.vocabulary_sources(id), primary key(sense_id,language)
);
create index vocabulary_senses_entry on public.vocabulary_senses(vocabulary_id,sort_order,id);
create table public.vocabulary_examples (
  id text primary key, vocabulary_id text not null references public.vocabulary(id), source_id text not null references public.vocabulary_sources(id),
  chinese text not null, pinyin text, vi text, en text
);
create table public.vocabulary_audio (
  id text primary key, vocabulary_id text not null references public.vocabulary(id), source_id text not null references public.vocabulary_sources(id),
  url text not null check (url like 'https://%')
);
create index vocabulary_examples_entry on public.vocabulary_examples(vocabulary_id,id);
create index vocabulary_audio_entry on public.vocabulary_audio(vocabulary_id,id);
create table public.topics (id text primary key, name text not null, description text not null, icon text not null, color text not null);
create table public.vocabulary_topics (
  vocabulary_id text not null references public.vocabulary(id), topic_id text not null references public.topics(id),
  source_id text not null references public.vocabulary_sources(id), primary key(vocabulary_id,topic_id)
);
create index vocabulary_topics_topic on public.vocabulary_topics(topic_id,vocabulary_id);
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '', preferences jsonb not null default '{}', updated_at timestamptz not null default now()
);
create table public.user_vocabulary (
  user_id uuid not null references auth.users(id) on delete cascade, vocabulary_id text not null references public.vocabulary(id),
  state text not null default 'NEW' check (state in ('NEW','LEARNING','MASTERED')),
  favorite boolean not null default false, difficult boolean not null default false, suspended boolean not null default false,
  studied_at timestamptz, updated_at timestamptz not null default now(), primary key(user_id,vocabulary_id)
);
create index user_vocabulary_states on public.user_vocabulary(user_id,state);
create table public.review_cards (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  vocabulary_id text not null references public.vocabulary(id),
  skill text not null check(skill in ('recognition','meaning','listening','production')),
  due timestamptz not null, stability double precision not null default 0, difficulty double precision not null default 0,
  state integer not null default 0 check(state between 0 and 3), reps integer not null default 0, lapses integer not null default 0,
  elapsed_days integer not null default 0, scheduled_days integer not null default 0, learning_steps integer not null default 0,
  last_review timestamptz, revision integer not null default 0, scheduler_version text not null, metadata jsonb not null default '{}',
  unique(user_id,vocabulary_id,skill)
);
create index review_cards_queue on public.review_cards(user_id,due);
grant all on public.vocabulary_sources, public.vocabulary, public.vocabulary_senses, public.vocabulary_translations, public.vocabulary_examples, public.vocabulary_audio, public.topics, public.vocabulary_topics, public.profiles, public.user_vocabulary, public.review_cards to service_role;

-- All tables have RLS. Only service-role imports may mutate the catalogue.
do $$ declare tab text; begin
  foreach tab in array array['vocabulary_sources','vocabulary','vocabulary_senses','vocabulary_translations','vocabulary_examples','vocabulary_audio','topics','vocabulary_topics'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from anon, authenticated',tab);
    execute format('grant select on public.%I to anon, authenticated',tab);
    execute format('create policy catalogue_read on public.%I for select to anon, authenticated using (true)',tab);
  end loop;
  foreach tab in array array['profiles','user_vocabulary','review_cards'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from anon, authenticated',tab);
    execute format('grant select on public.%I to authenticated',tab);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',tab);
  end loop;
end $$;
grant insert, update on public.profiles to authenticated;
create policy profile_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profile_update on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Small atomic patch: never accept an identity from the caller; never grant mastery.
create function public.patch_vocabulary(p_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result public.user_vocabulary; uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_patch) <> 'object' or p_patch = '{}' then raise exception 'Invalid patch'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('state','favorite','difficult','suspended') then raise exception 'Invalid field'; end if;
    if k = 'state' and p_patch->>k <> 'LEARNING' then raise exception 'Invalid state'; end if;
    if k <> 'state' and jsonb_typeof(p_patch->k) <> 'boolean' then raise exception 'Invalid boolean'; end if;
    if p_patch->k = 'null'::jsonb then raise exception 'Null patch'; end if;
  end loop;
  insert into public.user_vocabulary(user_id,vocabulary_id,state,favorite,difficult,suspended,studied_at)
  values(uid,p_id,coalesce(p_patch->>'state','NEW'),coalesce((p_patch->>'favorite')::boolean,false),coalesce((p_patch->>'difficult')::boolean,false),coalesce((p_patch->>'suspended')::boolean,false),case when p_patch ? 'state' then now() else null end)
  on conflict(user_id,vocabulary_id) do update set
    state = case when public.user_vocabulary.state = 'MASTERED' then 'MASTERED' else coalesce(p_patch->>'state',public.user_vocabulary.state) end,
    favorite = coalesce((p_patch->>'favorite')::boolean,public.user_vocabulary.favorite),
    difficult = coalesce((p_patch->>'difficult')::boolean,public.user_vocabulary.difficult),
    suspended = coalesce((p_patch->>'suspended')::boolean,public.user_vocabulary.suspended),
    studied_at = coalesce(public.user_vocabulary.studied_at,case when p_patch ? 'state' then now() else null end), updated_at = now()
  returning * into result;
  return to_jsonb(result) - 'user_id';
end $$;
revoke all on function public.patch_vocabulary(text,jsonb) from public, anon;
grant execute on function public.patch_vocabulary(text,jsonb) to authenticated;

-- Read model preserves individual senses and canonical IDs.
create view public.catalogue_entries with (security_invoker=true) as
select v.*,
  (select a.url from public.vocabulary_audio a where a.vocabulary_id=v.id order by a.id limit 1) as audio_url,
  coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',s.id,'source_id',s.source_id,'part_of_speech',s.part_of_speech,
    'vi',(select t.text from public.vocabulary_translations t where t.sense_id=s.id and t.language='vi'),
    'en',(select t.text from public.vocabulary_translations t where t.sense_id=s.id and t.language='en'))) order by s.sort_order,s.id) from public.vocabulary_senses s where s.vocabulary_id=v.id),'[]') as senses,
  coalesce((select jsonb_agg(vt.topic_id order by vt.topic_id) from public.vocabulary_topics vt where vt.vocabulary_id=v.id),'[]') as topics,
  coalesce((select jsonb_agg(to_jsonb(e)-'vocabulary_id' order by e.id) from public.vocabulary_examples e where e.vocabulary_id=v.id),'[]') as examples
from public.vocabulary v;
grant select on public.catalogue_entries to anon, authenticated;

create function public.search_vocabulary(p_query text default '',p_band text default '',p_topic text default '',p_state text default '',p_favorite boolean default false,p_difficult boolean default false,p_sort text default 'order',p_page integer default 1,p_size integer default 30)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; total_count integer; actual_page integer; size integer := least(greatest(p_size,1),100);
  pattern text := '%' || replace(replace(replace(lower(extensions.unaccent(regexp_replace(coalesce(p_query,''),'\s','','g'))),'\','\\'),'%','\%'),'_','\_') || '%';
begin
  if length(p_query)>100 or p_page<1 or p_page>2000 or p_sort not in ('order','band','progress') or p_state not in ('','NEW','LEARNING','MASTERED') then raise exception 'Invalid filters'; end if;
  select count(*) into total_count from public.vocabulary v left join public.user_vocabulary u on u.vocabulary_id=v.id and u.user_id=auth.uid()
  where (p_band='' or v.band=p_band) and (p_topic='' or exists(select 1 from public.vocabulary_topics t where t.vocabulary_id=v.id and t.topic_id=p_topic))
    and (p_state='' or coalesce(u.state,'NEW')=p_state) and (not p_favorite or coalesce(u.favorite,false)) and (not p_difficult or coalesce(u.difficult,false))
    and (p_query='' or v.search_text like pattern escape '\');
  actual_page := least(p_page,greatest(1,ceil(total_count::numeric/size)::integer));
  select coalesce(jsonb_agg(to_jsonb(c)-'search_text' order by selected.rn),'[]') into result from (
    select v.id,row_number() over(order by case when p_sort='progress' then case coalesce(u.state,'NEW') when 'MASTERED' then 2 when 'LEARNING' then 1 else 0 end else 0 end desc,case v.band when '7-9' then 7 else v.band::integer end,v.source_order) rn
    from public.vocabulary v left join public.user_vocabulary u on u.vocabulary_id=v.id and u.user_id=auth.uid()
    where (p_band='' or v.band=p_band) and (p_topic='' or exists(select 1 from public.vocabulary_topics t where t.vocabulary_id=v.id and t.topic_id=p_topic))
      and (p_state='' or coalesce(u.state,'NEW')=p_state) and (not p_favorite or coalesce(u.favorite,false)) and (not p_difficult or coalesce(u.difficult,false))
      and (p_query='' or v.search_text like pattern escape '\')
    order by rn limit size offset (actual_page-1)*size
  ) selected join public.catalogue_entries c on c.id=selected.id;
  return jsonb_build_object('items',result,'total',total_count,'page',actual_page,'pageSize',size);
end $$;
revoke all on function public.search_vocabulary(text,text,text,text,boolean,boolean,text,integer,integer) from public;
grant execute on function public.search_vocabulary(text,text,text,text,boolean,boolean,text,integer,integer) to authenticated;

create function public.catalogue_summary() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total',(select count(*) from public.vocabulary),'uniqueSpellings',(select count(distinct word) from public.vocabulary),
    'counts',coalesce((select jsonb_object_agg(band,n) from (select band,count(*) n from public.vocabulary group by band) b),'{}'),
    'topicCounts',coalesce((select jsonb_object_agg(topic_id,n) from (select topic_id,count(*) n from public.vocabulary_topics group by topic_id) t),'{}'),
    'topicEntryIds',coalesce((select jsonb_object_agg(topic_id,ids) from (select topic_id,jsonb_agg(vocabulary_id order by vocabulary_id) ids from public.vocabulary_topics group by topic_id) t),'{}'));
$$;
revoke all on function public.catalogue_summary() from public;
grant execute on function public.catalogue_summary() to authenticated;
commit;
