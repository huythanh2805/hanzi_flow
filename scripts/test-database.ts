import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { prepareData } from "./prepare-data";
import { normalizeSearch } from "../src/lib/domain/catalogue";
import path from "node:path";

// Isolated local PostgreSQL cluster only. Never uses .env.local or the owner's cloud DB.
const psql =
  process.env.PSQL_PATH ?? "C:/Program Files/PostgreSQL/16/bin/psql.exe";
let database = "postgres";
function sql(input: string) {
  const result = spawnSync(
    psql,
    [
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      "127.0.0.1",
      "-p",
      "55432",
      "-U",
      "postgres",
      "-d",
      database,
    ],
    {
      input,
      encoding: "utf8",
      env: { ...process.env, PGCLIENTENCODING: "UTF8" },
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(
      (result.stderr || result.error?.message || "SQL failed").slice(-4000),
    );
  return result.stdout;
}
const dataDirectory = sql("show data_directory;").trim().replace(/\\/g, "/");
if (
  dataDirectory.toLowerCase() !==
  path.resolve(".local-tests/postgres").replace(/\\/g, "/").toLowerCase()
)
  throw new Error(
    "Refusing to run: port 55432 is not the isolated .local-tests/postgres cluster.",
  );
const testDatabase = `hanziflow_test_${Date.now()}`;
sql(`create database ${testDatabase};`);
database = testDatabase;
async function run() {
  const { rows, manifest, topics, enrichment, imported } = await prepareData();
  const setup = `do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;end $$; create schema auth; create schema extensions;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
grant usage on schema public,auth,extensions to anon,authenticated,service_role;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`;
  const migration = await readFile(
    "supabase/migrations/202610250001_core.sql",
    "utf8",
  );
  sql(setup + "\n" + migration);
  sql(
    `insert into public.profiles(user_id,display_name,preferences) values('00000000-0000-0000-0000-000000000001','Existing learner','{"dailyGoal":15}');`,
  );
  const profileMigration = await readFile(
    "supabase/migrations/202610250002_create_profiles.sql",
    "utf8",
  );
  sql(profileMigration);
  sql(profileMigration);
  const contentMigration = await readFile(
    "supabase/migrations/202610250003_licensed_enrichment.sql",
    "utf8",
  );
  sql(contentMigration);
  sql(contentMigration);
  sql(`do $$ begin
    assert (select count(*) from public.profiles)=2,'existing accounts not backfilled';
    assert (select display_name='Existing learner' and preferences->>'dailyGoal'='15' from public.profiles where user_id='00000000-0000-0000-0000-000000000001'),'backfill overwrote preferences';
  end $$;
  insert into auth.users(id,email,raw_user_meta_data) values('00000000-0000-0000-0000-000000000003','new@example.invalid','{"full_name":"New learner"}');
  do $$ begin assert (select display_name='New learner' and preferences='{}'::jsonb from public.profiles where user_id='00000000-0000-0000-0000-000000000003'),'automatic profile missing'; end $$;
  delete from auth.users where id='00000000-0000-0000-0000-000000000003';
  do $$ begin assert not exists(select 1 from public.profiles where user_id='00000000-0000-0000-0000-000000000003'),'profile deletion did not cascade'; end $$;`);
  console.log(
    "PASS: automatic profiles, existing-account backfill, repeat migration preserves preferences, auth deletion cascades.",
  );
  console.log(
    "PASS: migration executes on PostgreSQL 16 with RLS and restricted grants.",
  );
  const literal = (value: unknown) =>
    `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  const values = rows.map((v) => ({
    id: v.id,
    source_id: v.source_id,
    band: v.band,
    word: v.word,
    pinyin: v.pinyin,
    official_entry: v.official_entry,
    official_pinyin: v.official_pinyin,
    source_order: v.source_order,
    search_text: normalizeSearch(
      [
        v.word,
        v.pinyin,
        ...v.senses.flatMap((s) => [s.vi ?? "", s.en ?? ""]),
      ].join(" "),
    ),
  }));
  const insert = `insert into public.vocabulary select * from jsonb_populate_recordset(null::public.vocabulary,${literal(values)}) on conflict(id) do update set word=excluded.word,pinyin=excluded.pinyin,search_text=excluded.search_text;`;
  sql(`insert into public.vocabulary_sources(id,name,version,license,attribution) values('${manifest.id}','Source','1','CC BY 4.0','HSK University'),('${enrichment.source.id}','Design reference','1','Project reference','Owner supplied');
insert into public.topics select * from jsonb_populate_recordset(null::public.topics,${literal(topics)});
${insert}
insert into public.vocabulary_senses(id,vocabulary_id,source_id) values('test-work','hsk30-b1-0124','${enrichment.source.id}');
insert into public.vocabulary_translations values('test-work','vi','công việc','${enrichment.source.id}');
insert into public.vocabulary_topics values('hsk30-b1-0124','work-career','${enrichment.source.id}');`);
  const assertions = `
do $$ begin
  assert (select count(*) from public.vocabulary)=11092,'source count';
  assert (select count(*) from public.vocabulary where word='打')=3,'duplicate spelling loss';
  assert (select count(*) from public.vocabulary group by band having band='2')=772,'band count';
end $$;
set role anon;
do $$ begin
  assert (select count(*) from public.vocabulary)=11092,'public catalogue';
  begin perform public.patch_vocabulary('hsk30-b1-0124','{"favorite":true}'); raise exception 'anon mutation permitted'; exception when insufficient_privilege then null; end;
  begin perform * from public.user_vocabulary; raise exception 'anon personal read permitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select public.patch_vocabulary('hsk30-b1-0124','{"state":"LEARNING","favorite":true}');
select public.patch_vocabulary('hsk30-b1-0124','{"difficult":true}');
insert into public.profiles(user_id,display_name) values(auth.uid(),'A') on conflict(user_id) do update set display_name=excluded.display_name;
do $$ begin
  assert (select count(*) from public.user_vocabulary)=1,'own progress';
  assert (select favorite and difficult and state='LEARNING' from public.user_vocabulary),'patch overwrote independent fields';
  assert public.search_vocabulary('','1','work-career','LEARNING')->>'total'='1','combined filters and shared progress';
  assert (public.search_vocabulary('gong zuo')->'items') @> '[{"id":"hsk30-b1-0124"}]'::jsonb,'pinyin normalization';
  assert (public.search_vocabulary('công việc')->'items') @> '[{"id":"hsk30-b1-0124"}]'::jsonb,'translation search';
  assert (public.search_vocabulary('%')->>'total')::integer=(select count(*) from public.vocabulary where position('%' in search_text)>0),'wildcard query must remain literal';
  assert (public.search_vocabulary('_')->>'total')::integer=(select count(*) from public.vocabulary where position('_' in search_text)>0),'underscore query must remain literal';
  assert public.search_vocabulary('','2')->>'total'='772','band filter';
  assert public.search_vocabulary('','1','','',false,false,'order',100,30)->>'page'='17','page clamp';
  assert public.search_vocabulary('','','','',true)->>'total'='1','favorite filter';
  assert public.search_vocabulary('','','','',false,true)->>'total'='1','difficult filter';
  begin perform public.patch_vocabulary('hsk30-b1-0124','{"state":"MASTERED"}'); raise exception 'false mastery accepted'; exception when raise_exception then if sqlerrm <> 'Invalid state' then raise; end if; end;
  begin perform public.patch_vocabulary('hsk30-b1-0124','{"user_id":"other"}'); raise exception 'forged actor accepted'; exception when raise_exception then if sqlerrm <> 'Invalid field' then raise; end if; end;
  begin update public.user_vocabulary set state='MASTERED'; raise exception 'direct mastery update permitted'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select count(*) from public.user_vocabulary)=0,'user B sees user A progress';
  assert (select count(*) from public.profiles where user_id='00000000-0000-0000-0000-000000000001')=0,'user B sees user A profile';
  assert public.search_vocabulary('','1','work-career','LEARNING')->>'total'='0','search leaked another user progress';
end $$;
insert into public.profiles(user_id,display_name) values(auth.uid(),'B') on conflict(user_id) do update set display_name=excluded.display_name;
update public.profiles set display_name='intruder' where user_id='00000000-0000-0000-0000-000000000001';
select public.patch_vocabulary('hsk30-b1-0124','{"favorite":true}');
reset role;
do $$ begin
  assert (select display_name from public.profiles where user_id='00000000-0000-0000-0000-000000000001')='A','cross-user update';
  assert (select count(*) from public.user_vocabulary)=2,'separate user entry keys';
end $$;
`;
  sql(assertions);
  console.log(
    "PASS: anonymous denial, user isolation, forged identity rejection, independent atomic patches and no false mastery.",
  );
  console.log(
    "PASS: database band/topic/combined/progress/favorite/difficult filters, pinyin/meaning search, pagination and read model.",
  );
  sql(
    insert +
      `do $$ begin assert (select count(*) from public.vocabulary)=11092,'idempotency';assert (select count(*) from public.user_vocabulary)=2,'import erased progress';assert (select favorite and difficult and studied_at is not null from public.user_vocabulary where user_id='00000000-0000-0000-0000-000000000001'),'import overwrote history';end $$;`,
  );
  console.log(
    "PASS: full 11,092-entry source re-import is idempotent and preserves personal history.",
  );
  sql(`insert into public.vocabulary_sources(id,name,version,license,attribution,repository,metadata)
    select id,name,version,license,attribution,repository,metadata from jsonb_to_recordset(${literal(imported.sources)}) as x(id text,name text,version text,license text,attribution text,repository text,metadata jsonb);`);
  const examples = rows.flatMap((v) =>
    v.examples.map((e) => ({
      ...e,
      vocabulary_id: v.id,
      translation_meta: e.translation_meta ?? {},
    })),
  );
  const insertExamples = `insert into public.vocabulary_examples select * from jsonb_populate_recordset(null::public.vocabulary_examples,${literal(examples)}) on conflict(id) do update set level_check=excluded.level_check;`;
  sql(insertExamples);
  sql(insertExamples);
  sql(`do $$ declare sample text; begin
    assert (select count(*) from public.vocabulary_examples)=${examples.length},'example re-import duplicated records';
    select e.id into strict sample from public.vocabulary_examples e join public.vocabulary v on v.id=e.vocabulary_id where v.band='1' limit 1;
    begin update public.vocabulary_examples set level_check=jsonb_set(level_check,'{max_band}','"7-9"') where id=sample; raise exception 'forged proof accepted';
      exception when raise_exception then if sqlerrm='forged proof accepted' then raise; end if; end;
    begin update public.vocabulary_examples set chinese=chinese||'外' where id=sample; raise exception 'incomplete coverage accepted';
      exception when raise_exception then if sqlerrm='incomplete coverage accepted' then raise; end if; end;
    begin update public.vocabulary_examples set level_check=null where id=sample; raise exception 'missing proof accepted';
      exception when raise_exception then if sqlerrm='missing proof accepted' then raise; end if; end;
    begin update public.vocabulary_examples set level_check=jsonb_set(level_check,'{tokens,0,band}','"7-9"') where id=sample; raise exception 'forged token Band accepted';
      exception when raise_exception then if sqlerrm='forged token Band accepted' then raise; end if; end;
  end $$;`);
  console.log(
    `PASS: ${examples.length} real corpus examples satisfy the database Band guard; repeat import, forged max/token Bands, incomplete coverage and missing proof checked.`,
  );
}
try {
  await run();
} finally {
  database = "postgres";
  sql(`drop database ${testDatabase};`);
}
