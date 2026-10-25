begin;

alter table public.vocabulary_senses
  add column if not exists source_url text,
  add column if not exists attribution jsonb not null default '[]',
  add column if not exists match_method text,
  add column if not exists translation_meta jsonb not null default '{}';
alter table public.vocabulary_examples
  add column if not exists source_url text,
  add column if not exists attribution jsonb not null default '[]',
  add column if not exists original_chinese text,
  add column if not exists level_check jsonb,
  add column if not exists translation_meta jsonb not null default '{}';
create index if not exists vocabulary_word on public.vocabulary(word);

-- Only service_role can write content. The importer additionally re-runs ICU
-- segmentation on every example. This trigger validates its persisted lexical
-- proof against the current catalogue, including coverage and exact token Bands.
create or replace function public.hanziflow_check_example_band()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target public.vocabulary; token jsonb; token_rank integer; actual_rank integer;
  maximum integer := 0; target_seen boolean := false; reconstructed text := '';
begin
  if new.level_check is null then
    if new.source_id like 'tatoeba-%' then raise exception 'Corpus example requires Band proof'; end if;
    return new;
  end if;
  select * into strict target from public.vocabulary where id=new.vocabulary_id;
  if jsonb_typeof(new.level_check) is distinct from 'object'
     or new.level_check->>'version' is distinct from 'hsk2021-icu-v1'
     or new.level_check->>'scope' is distinct from 'vocabulary-only'
     or new.level_check->>'target_band' is distinct from target.band
     or jsonb_typeof(new.level_check->'tokens') is distinct from 'array' then
    raise exception 'Invalid example Band proof';
  end if;
  for token in select value from jsonb_array_elements(new.level_check->'tokens') loop
    if token->>'band' is null or token->>'band' not in ('1','2','3','4','5','6','7-9') or coalesce(token->>'text','')='' then raise exception 'Invalid example token'; end if;
    token_rank := case when token->>'band'='7-9' then 7 else (token->>'band')::integer end;
    if token->>'text'=target.word then
      actual_rank := case when target.band='7-9' then 7 else target.band::integer end;
      target_seen := true;
    else
      select max(case when band='7-9' then 7 else band::integer end) into actual_rank
        from public.vocabulary where word=token->>'text';
    end if;
    if actual_rank is null or token_rank<>actual_rank then raise exception 'Unknown word or incorrect token Band'; end if;
    maximum := greatest(maximum,actual_rank);
    reconstructed := reconstructed || (token->>'text');
  end loop;
  if not target_seen or maximum>(case when target.band='7-9' then 7 else target.band::integer end)
     or new.level_check->>'max_band' is distinct from (case when maximum=7 then '7-9' else maximum::text end)
     or reconstructed<>regexp_replace(new.chinese,'[[:space:][:punct:]“”‘’…·—–。，！？：；、（）《》「」『』【】]+','','g') then
    raise exception 'Example exceeds target Band or token coverage is incomplete: %', new.id;
  end if;
  return new;
end $$;
revoke all on function public.hanziflow_check_example_band() from public,anon,authenticated;
drop trigger if exists hanziflow_example_band on public.vocabulary_examples;
create trigger hanziflow_example_band before insert or update on public.vocabulary_examples
for each row execute function public.hanziflow_check_example_band();

create or replace view public.catalogue_entries with (security_invoker=true) as
select v.*,
  (select a.url from public.vocabulary_audio a where a.vocabulary_id=v.id order by a.id limit 1) as audio_url,
  coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',s.id,'source_id',s.source_id,'part_of_speech',s.part_of_speech,
    'source_url',s.source_url,'attribution',s.attribution,'match_method',s.match_method,'translation_meta',s.translation_meta,
    'vi',(select t.text from public.vocabulary_translations t where t.sense_id=s.id and t.language='vi'),
    'en',(select t.text from public.vocabulary_translations t where t.sense_id=s.id and t.language='en'))) order by s.sort_order,s.id)
    from public.vocabulary_senses s where s.vocabulary_id=v.id),'[]') as senses,
  coalesce((select jsonb_agg(vt.topic_id order by vt.topic_id) from public.vocabulary_topics vt where vt.vocabulary_id=v.id),'[]') as topics,
  coalesce((select jsonb_agg(to_jsonb(e)-'vocabulary_id' order by e.id) from public.vocabulary_examples e where e.vocabulary_id=v.id),'[]') as examples
from public.vocabulary v;

notify pgrst,'reload schema';
commit;
