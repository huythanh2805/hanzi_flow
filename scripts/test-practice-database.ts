import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { Vocabulary } from "../src/lib/domain/types";
import { practiceRepeatSlot } from "../src/lib/domain/practice";
import { practiceLexicon } from "../src/lib/domain/practice";
import {
  buildExerciseQuestions,
  exerciseSessionState,
} from "../src/lib/domain/practice-exercises";
import { randomUUID } from "node:crypto";
const psql =
  process.env.PSQL_PATH ?? "C:/Program Files/PostgreSQL/16/bin/psql.exe";
let database = "postgres";
function sql(input: string) {
  const r = spawnSync(
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
      maxBuffer: 24 * 1024 * 1024,
      env: { ...process.env, PGCLIENTENCODING: "UTF8" },
    },
  );
  if (r.status !== 0)
    throw new Error(
      (r.stderr || r.error?.message || "SQL failed").slice(-5000),
    );
  return r.stdout.trim();
}
const actual = sql("show data_directory;").replace(/\\/g, "/").toLowerCase();
if (
  actual !==
  path.resolve(".local-tests/postgres").replace(/\\/g, "/").toLowerCase()
)
  throw new Error("Refusing to test outside the isolated local cluster.");
const name = `hanziflow_practice_${Date.now()}`;
const literal = (v: unknown) =>
  `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const actor =
  "set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';";
sql(`create database ${name};`);
database = name;
try {
  sql(`create schema auth;create schema extensions;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  grant usage on schema public,auth,extensions to anon,authenticated,service_role;
  insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`);
  for (const file of [
    "202610250001_core.sql",
    "202610250003_licensed_enrichment.sql",
    "202610250004_practice.sql",
    "202610250005_practice_defer.sql",
    "202610250006_practice_interleaved_repeats.sql",
    "202610250007_practice_random_repeat_position.sql",
    "202610250008_practice_exercises.sql",
    "202610250009_personal_decks.sql",
  ])
    sql(await readFile(`supabase/migrations/${file}`, "utf8"));
  console.log("PASS: practice migration parses with restricted roles and RLS.");
  for (const remaining of [0, 1, 20, 5636]) {
    for (const seed of [0, 3, 19, 4294967295]) {
      const eventId = `30000000-0000-4000-8000-${seed.toString(16).padStart(12, "0")}`;
      const actual = Number(
        sql(`select public.practice_repeat_slot('${eventId}',${remaining});`),
      );
      if (actual !== practiceRepeatSlot(eventId, remaining))
        throw new Error("Cloud and browser random-slot algorithms differ");
    }
  }
  const rows = JSON.parse(
    await readFile("data/catalogue.json", "utf8"),
  ) as Vocabulary[];
  const sources = [
    ...new Set(
      rows.flatMap((v) => [v.source_id, ...v.senses.map((s) => s.source_id)]),
    ),
  ];
  sql(
    `insert into public.vocabulary_sources(id,name,version,license,attribution) select id,id,'local-test','test-fixture','isolated catalogue fixture' from jsonb_array_elements_text(${literal(sources)}) id;`,
  );
  for (let n = 0; n < rows.length; n += 500) {
    const batch = rows.slice(n, n + 500);
    sql(`insert into public.vocabulary(id,source_id,band,word,pinyin,official_entry,official_pinyin,source_order,search_text)
      select id,source_id,band,word,pinyin,official_entry,official_pinyin,source_order,word from jsonb_to_recordset(${literal(batch)}) as v(id text,source_id text,band text,word text,pinyin text,official_entry text,official_pinyin text,source_order int);`);
    const senses = batch.flatMap((v) =>
      v.senses.map((s, index) => ({
        ...s,
        vocabulary_id: v.id,
        sort_order: index,
      })),
    );
    if (senses.length)
      sql(`with source as (select * from jsonb_to_recordset(${literal(senses)}) as s(id text,vocabulary_id text,source_id text,sort_order int,source_url text,attribution jsonb,translation_meta jsonb))
      insert into public.vocabulary_senses(id,vocabulary_id,source_id,sort_order,source_url,attribution,translation_meta)
      select id,vocabulary_id,source_id,sort_order,source_url,coalesce(attribution,'[]'),coalesce(translation_meta,'{}') from source;
      insert into public.vocabulary_translations(sense_id,language,text,source_id)
      select s->>'id',lang,s->>lang,s->>'source_id' from jsonb_array_elements(${literal(senses)}) s cross join unnest(array['vi','en']) lang where coalesce(s->>lang,'')<>'';`);
  }
  const topics = JSON.parse(await readFile("data/topics.json", "utf8"));
  sql(
    `insert into public.topics select * from jsonb_to_recordset(${literal(topics)}) t(id text,name text,description text,icon text,color text);`,
  );
  const memberships = rows.flatMap((v) =>
    v.topics.map((topic_id) => ({
      vocabulary_id: v.id,
      topic_id,
      source_id: v.source_id,
    })),
  );
  sql(
    `insert into public.vocabulary_topics select * from jsonb_to_recordset(${literal(memberships)}) t(vocabulary_id text,topic_id text,source_id text);`,
  );
  sql("analyze;");
  console.log("PASS: seeded all 11,092 real entries and bilingual senses.");
  const create = (
    source: unknown,
    requestId: string,
    mode = "exam",
    language = "vi",
  ) =>
    `${actor}select public.practice_create(${literal({ requestId, source, mode, direction: "mixed", language, lessonSize: 20 })});`;
  const before = sql(
    "select md5(coalesce(string_agg(row_to_json(t)::text,'' order by user_id,vocabulary_id),'')) from public.user_vocabulary t;",
  );
  const first = JSON.parse(
    sql(
      create(
        { kind: "band", band: "1" },
        "10000000-0000-4000-8000-000000000001",
      ),
    ),
  );
  if (first.total !== 500) throw new Error("Band 1 must contain 500 questions");
  const sid = first.id;
  if (
    JSON.parse(
      sql(
        create(
          { kind: "band", band: "1" },
          "10000000-0000-4000-8000-000000000001",
        ),
      ),
    ).id !== sid
  )
    throw new Error("Creation retry duplicated session");
  const largeStart = Date.now();
  const large = JSON.parse(
    sql(
      create(
        { kind: "band", band: "7-9" },
        "10000000-0000-4000-8000-000000000002",
        "exam",
        "en",
      ),
    ),
  );
  if (large.total !== 5636)
    throw new Error("Band 7-9 must contain all 5636 entries");
  sql(`do $$ begin assert (select count(*)=5636 and count(distinct vocabulary_id)=5636 from public.practice_questions where session_id='${large.id}'),'full Band lost or duplicated entries';
    assert not exists((select id from public.vocabulary where band='7-9') except (select vocabulary_id from public.practice_questions where session_id='${large.id}')),'full Band ID mismatch';end $$;`);
  console.log(
    `PASS: full Band 1 / 7-9 identity sets, 500 / 5636 distinct questions; large session prepared in ${Date.now() - largeStart}ms.`,
  );
  const batch = JSON.parse(
    sql(`${actor}select public.practice_read('${sid}',0,25);`),
  );
  if (
    batch.questions.length !== 25 ||
    batch.session.correct !== null ||
    batch.questions.some(
      (q: Record<string, unknown>) =>
        q.feedback || q.correctOptionId || q.vocabularyId,
    )
  )
    throw new Error("Exam key leaked");
  const option = batch.questions[0].options[0].id;
  const command = {
    eventId: "20000000-0000-4000-8000-000000000001",
    revision: 0,
    kind: "answer",
    ordinal: 0,
    optionId: option,
  };
  const ack = JSON.parse(
    sql(`${actor}select public.practice_commit('${sid}',${literal(command)});`),
  );
  const replay = JSON.parse(
    sql(`${actor}select public.practice_commit('${sid}',${literal(command)});`),
  );
  if (ack.revision !== 1 || replay.revision !== 1 || ack.answered !== 1)
    throw new Error("Idempotent answer failed");
  function fails(query: string, needle: string) {
    try {
      sql(query);
    } catch (e) {
      if (String(e).includes(needle)) return;
      throw e;
    }
    throw new Error(`Expected rejection: ${needle}`);
  }
  fails(
    `${actor}select public.practice_commit('${sid}',${literal({ ...command, eventId: "20000000-0000-4000-8000-000000000002" })});`,
    "STALE_REVISION",
  );
  fails(
    `${actor}select public.practice_commit('${sid}',${literal({ ...command, revision: 1, eventId: "20000000-0000-4000-8000-000000000003", correct: true })});`,
    "Invalid command fields",
  );
  fails(
    `${actor}select public.practice_commit('${sid}',${literal({ ...command, eventId: command.eventId, optionId: "00000000-0000-4000-8000-000000000099" })});`,
    "EVENT_REUSED",
  );
  fails(
    `set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';select public.practice_read('${sid}');`,
    "SESSION_NOT_FOUND",
  );
  fails(
    `${actor}select * from public.practice_questions;`,
    "permission denied",
  );
  fails(
    `set role anon;select public.practice_read('${sid}');`,
    "permission denied",
  );
  const submitted = JSON.parse(
    sql(
      `${actor}select public.practice_commit('${sid}',${literal({ kind: "submit", eventId: "20000000-0000-4000-8000-000000000004", revision: 1 })});`,
    ),
  );
  if (submitted.unanswered !== 499 || submitted.correct + submitted.wrong !== 1)
    throw new Error("Submission scoring failed");
  const result = JSON.parse(
    sql(`${actor}select public.practice_read('${sid}',0,25);`),
  );
  if (!result.questions[0].feedback?.correctOptionId)
    throw new Error("Results missing feedback");
  fails(
    `${actor}select public.practice_commit('${sid}',${literal({ ...command, revision: 2, eventId: "20000000-0000-4000-8000-000000000005" })});`,
    "Phiên đã nộp",
  );
  const learn = JSON.parse(
    sql(
      create(
        {
          kind: "groups",
          collectionType: "band",
          collectionId: "1",
          groups: [1, 3],
        },
        "10000000-0000-4000-8000-000000000003",
        "learn",
        "en",
      ),
    ),
  );
  if (learn.total !== 40) throw new Error("Multiple groups lost entries");
  const lb = JSON.parse(
    sql(`${actor}select public.practice_read('${learn.id}');`),
  );
  sql(
    `${actor}select public.practice_commit('${learn.id}',${literal({ ...command, eventId: "20000000-0000-4000-8000-000000000006", optionId: lb.questions[0].options[0].id })});`,
  );
  const la = JSON.parse(
    sql(`${actor}select public.practice_read('${learn.id}');`),
  );
  if (!la.questions[0].feedback) throw new Error("Learn feedback missing");
  fails(
    `${actor}select public.practice_commit('${learn.id}',${literal({ ...command, eventId: "20000000-0000-4000-8000-000000000007", revision: 1, optionId: lb.questions[0].options[1].id })});`,
    "Câu đã chấm",
  );
  const deferred = JSON.parse(
    sql(
      create(
        {
          kind: "entries",
          ids: ["hsk30-b1-0001", "hsk30-b1-0002", "hsk30-b1-0003"],
        },
        "10000000-0000-4000-8000-000000000005",
        "learn",
        "en",
      ),
    ),
  );
  const deferCommand = {
    kind: "defer",
    ordinal: 0,
    revision: 0,
    eventId: "20000000-0000-4000-8000-000000000008",
  };
  const deferSQL = `${actor}select public.practice_commit('${deferred.id}',${literal(deferCommand)});`;
  const d = JSON.parse(sql(deferSQL));
  if (
    d.cursor !== 1 ||
    d.answered !== 0 ||
    d.correct !== 0 ||
    d.total !== 3 ||
    d.deferredCount !== 1
  )
    throw new Error("Defer graded, duplicated or lost a word");
  const deferReplay = JSON.parse(sql(deferSQL));
  if (deferReplay.revision !== 1 || deferReplay.deferredCount !== 1)
    throw new Error("Defer replay duplicated queue");
  const dq = JSON.parse(
    sql(`${actor}select public.practice_read('${deferred.id}');`),
  );
  if (!dq.questions[0].deferred || dq.questions[0].feedback)
    throw new Error("Deferred question revealed a key or lost its flag");
  let rev = 1;
  for (const ordinal of [1, 0, 2]) {
    if (ordinal === 2)
      fails(
        `${actor}select public.practice_commit('${deferred.id}',${literal({ ...deferCommand, ordinal: 2, revision: rev, eventId: "20000000-0000-4000-8000-000000000009" })});`,
        "từ cuối cùng",
      );
    const optionId = sql(
      `select correct_option_id from public.practice_questions where session_id='${deferred.id}' and ordinal=${ordinal};`,
    );
    const ack = JSON.parse(
      sql(
        `${actor}select public.practice_commit('${deferred.id}',${literal({ kind: "answer", ordinal, optionId, revision: rev, eventId: `20000000-0000-4000-8000-${String(ordinal + 10).padStart(12, "0")}` })});`,
      ),
    );
    rev++;
    if (ordinal === 1 && ack.cursor !== 0)
      throw new Error("Deferred word not interleaved before the last word");
    if (
      ordinal === 2 &&
      (ack.answered !== 3 || ack.correct !== 3 || ack.deferredCount !== 0)
    )
      throw new Error("Deferred answer changed first-round scoring");
  }
  console.log(
    "PASS: deferred learning words persist, replay safely, interleave before the tail and grade exactly once.",
  );
  const repeat = JSON.parse(
    sql(
      create(
        {
          kind: "entries",
          ids: [
            "hsk30-b1-0001",
            "hsk30-b1-0002",
            "hsk30-b1-0003",
            "hsk30-b1-0004",
            "hsk30-b1-0005",
            "hsk30-b1-0006",
          ],
        },
        "10000000-0000-4000-8000-000000000006",
        "learn",
        "en",
      ),
    ),
  );
  const rr = JSON.parse(
    sql(`${actor}select public.practice_read('${repeat.id}');`),
  );
  const key0 = sql(
    `select correct_option_id from public.practice_questions where session_id='${repeat.id}' and ordinal=0;`,
  );
  const wrong0 = rr.questions[0].options.find(
    (o: { id: string }) => o.id !== key0,
  ).id;
  let repeatRev = 0;
  const repeatSend = (kind: string, ordinal: number, optionId?: string) => {
    const cmd = {
      kind,
      ordinal,
      optionId,
      revision: repeatRev++,
      eventId: `30000000-0000-4000-8000-${String(repeatRev * 3 + 1).padStart(12, "0")}`,
    };
    return JSON.parse(
      sql(
        `${actor}select public.practice_commit('${repeat.id}',${literal(cmd)});`,
      ),
    );
  };
  repeatSend("answer", 0, wrong0);
  const queued = repeatSend("defer", 0);
  const order = JSON.parse(
    sql(
      `select to_jsonb(learning_queue) from public.practice_sessions where id='${repeat.id}';`,
    ),
  );
  const slot = order.indexOf(0);
  if (
    slot < 1 ||
    slot >= order.length ||
    queued.correct !== 0 ||
    queued.answered !== 1
  )
    throw new Error("Repeat not interleaved or changed score");
  const pendingRead = JSON.parse(
    sql(`${actor}select public.practice_read('${repeat.id}');`),
  );
  if (
    pendingRead.questions[0].selectedOptionId ||
    pendingRead.questions[0].feedback
  )
    throw new Error("Repeat leaked the previous answer");
  for (const ordinal of order.slice(0, slot)) {
    repeatSend(
      "answer",
      ordinal,
      sql(
        `select correct_option_id from public.practice_questions where session_id='${repeat.id}' and ordinal=${ordinal};`,
      ),
    );
  }
  const repeated = repeatSend("answer", 0, key0);
  const repeatedPayload = JSON.parse(
    sql(
      `select payload from public.practice_events where session_id='${repeat.id}' and payload->>'kind'='answer' and payload->>'ordinal'='0' order by created_at desc limit 1;`,
    ),
  );
  const repeatedReplay = JSON.parse(
    sql(
      `${actor}select public.practice_commit('${repeat.id}',${literal(repeatedPayload)});`,
    ),
  );
  if (repeatedReplay.repeatAnswered !== 1 || repeatedReplay.repeatCorrect !== 1)
    throw new Error("Repeat replay duplicated grading");
  if (
    repeated.correct !== slot ||
    repeated.answered !== slot + 1 ||
    repeated.repeatAnswered !== 1 ||
    repeated.repeatCorrect !== 1
  )
    throw new Error("Repeat rewrote or inflated first-round score");
  if (
    sql(
      `select option_id from public.practice_answers where session_id='${repeat.id}' and ordinal=0;`,
    ) !== wrong0
  )
    throw new Error("Original answer overwritten");
  repeatSend("submit", 0);
  const graded = JSON.parse(
    sql(`${actor}select public.practice_read('${repeat.id}');`),
  );
  if (
    graded.questions[0].feedback.isCorrect !== false ||
    graded.questions[0].selectedOptionId !== wrong0
  )
    throw new Error("Result did not retain first-round answer");
  console.log(
    "PASS: wrong-word retries interleave, hide old selection, keep first score immutable and report separate repeat grades.",
  );
  const retryId = result.questions[0].feedback.vocabularyId;
  const retry = JSON.parse(
    sql(
      create(
        { kind: "retry", parentId: sid, ids: [retryId] },
        "10000000-0000-4000-8000-000000000004",
        "learn",
      ),
    ),
  );
  if (retry.parentId !== sid || retry.total !== 1)
    throw new Error("Retry did not create separate child session");
  const recipe = buildExerciseQuestions(
    practiceLexicon(rows, "en"),
    rows
      .filter((v) => v.band === "1")
      .slice(0, 30)
      .map((v) => v.id),
    "mixed",
    randomUUID(),
    randomUUID,
    ["meaning_choice", "listening_choice", "matching"],
  );
  const input = {
    requestId: randomUUID(),
    source: {
      kind: "entries",
      ids: recipe.questions.map((q) => q.vocabularyId),
    },
    mode: "learn",
    direction: "mixed",
    language: "en",
    lessonSize: 20,
    exerciseTypes: ["meaning_choice", "listening_choice", "matching"],
  };
  let unsupportedExamRejected = false;
  try {
    sql(
      `${actor}select public.practice_create(${literal({ ...input, mode: "exam", requestId: randomUUID() })});`,
    );
  } catch {
    unsupportedExamRejected = true;
  }
  if (!unsupportedExamRejected)
    throw new Error("Raw RPC accepted unsupported exam activities");
  const install = `select public.practice_install_exercises('00000000-0000-0000-0000-000000000001',${literal(input)},${literal(recipe.questions)},array[${exerciseSessionState(recipe.questions).learningQueue!.join(",")}],${literal(recipe.counts)},${recipe.boardCount});`;
  const exerciseId = sql(`set role service_role;${install}`);
  if (sql(`set role service_role;${install}`) !== exerciseId)
    throw new Error("Exercise creation is not idempotent");
  try {
    sql(`${actor}${install}`);
    throw new Error("Browser installed private keys");
  } catch (e) {
    if (!String(e).includes("permission denied")) throw e;
  }
  const mq = recipe.questions.find((q) => q.exerciseType === "matching")!;
  let revision = 0;
  const exerciseSend = (
    kind: string,
    ordinal: number,
    optionId?: string,
    variant = "primary",
  ) =>
    JSON.parse(
      sql(
        `${actor}select public.practice_commit('${exerciseId}',${literal({ eventId: randomUUID(), revision: revision++, kind, ordinal, optionId, variant })});`,
      ),
    );
  const wrong = mq.options.find((o) => o.id !== mq.correctOptionId)!.id;
  exerciseSend("answer", mq.ordinal, wrong);
  let read = JSON.parse(
    sql(
      `${actor}select public.practice_read('${exerciseId}',${mq.ordinal},1);`,
    ),
  );
  let visible = read.questions.find(
    (q: { ordinal: number }) => q.ordinal === mq.ordinal,
  );
  if (
    visible.feedback ||
    visible.correctOptionId ||
    !visible.lastAttempt ||
    read.session.correct !== 0
  )
    throw new Error(
      "Wrong matching answer exposed a key or changed first score",
    );
  exerciseSend("answer", mq.ordinal, mq.correctOptionId);
  read = JSON.parse(
    sql(
      `${actor}select public.practice_read('${exerciseId}',${mq.ordinal},1);`,
    ),
  );
  visible = read.questions.find(
    (q: { ordinal: number }) => q.ordinal === mq.ordinal,
  );
  if (
    !visible.resolved ||
    read.session.correct !== 0 ||
    read.session.repeatCorrect !== 1
  )
    throw new Error("Matching retry grading failed");
  const deferredPair = recipe.questions.find(
    (q) => q.exerciseType === "matching" && q.ordinal !== mq.ordinal,
  )!;
  exerciseSend("defer", deferredPair.ordinal);
  exerciseSend(
    "answer",
    deferredPair.ordinal,
    deferredPair.choiceSnapshot!.correctOptionId,
    "choice",
  );
  const audio = recipe.questions.find(
    (q) => q.exerciseType === "listening_choice",
  )!;
  read = JSON.parse(
    sql(
      `${actor}select public.practice_read('${exerciseId}',${audio.ordinal},1);`,
    ),
  );
  visible = read.questions.find(
    (q: { ordinal: number }) => q.ordinal === audio.ordinal,
  );
  if (
    visible.prompt !== "" ||
    visible.feedback ||
    visible.promptPinyin ||
    !visible.audioText
  )
    throw new Error("Listening prompt leaked visible solution");
  exerciseSend("submit", 0);
  read = JSON.parse(
    sql(
      `${actor}select public.practice_read('${exerciseId}',${deferredPair.ordinal},1);`,
    ),
  );
  visible = read.questions.find(
    (q: { ordinal: number }) => q.ordinal === deferredPair.ordinal,
  );
  if (!visible.feedback.isCorrect || read.session.correct !== 1)
    throw new Error("First MCQ fallback was graded with a matching key");
  if (
    JSON.parse(sql(`${actor}select to_json(public.practice_lexicon('en'));`))
      .length !== 11092
  )
    throw new Error("Compact catalogue was truncated");
  console.log(
    "PASS: mixed snapshots, service-only atomic installation, idempotent creation, matching retry privacy, first-variant grading, listening redaction and complete compact lexicon.",
  );
  const fullExercise = buildExerciseQuestions(
    practiceLexicon(rows, "en"),
    rows.filter((v) => v.band === "7-9").map((v) => v.id),
    "mixed",
    randomUUID(),
    randomUUID,
    ["meaning_choice", "listening_choice", "matching"],
  );
  const fullInput = {
    ...input,
    requestId: randomUUID(),
    source: { kind: "band", band: "7-9" },
  };
  const fullStart = Date.now();
  const fullId = sql(
    `set role service_role;select public.practice_install_exercises('00000000-0000-0000-0000-000000000001',${literal(fullInput)},${literal(fullExercise.questions)},array[${exerciseSessionState(fullExercise.questions).learningQueue!.join(",")}],${literal(fullExercise.counts)},${fullExercise.boardCount});`,
  );
  console.log(
    `Full mixed recipe installed locally in ${Date.now() - fullStart}ms (${Math.round(JSON.stringify(fullExercise.questions).length / 1024)} KiB).`,
  );
  const fullReadStart = Date.now();
  const fullPage = JSON.parse(
    sql(`${actor}select public.practice_read('${fullId}',5625,25);`),
  );
  if (fullPage.session.total !== 5636)
    throw new Error("Truncated full mixed session");
  console.log(`Full mixed final-page read in ${Date.now() - fullReadStart}ms.`);
  const after = sql(
    "select md5(coalesce(string_agg(row_to_json(t)::text,'' order by user_id,vocabulary_id),'')) from public.user_vocabulary t;",
  );
  // Personal deck fixtures share the same isolated canonical catalogue.
  const deckA = randomUUID(),
    deckB = randomUUID();
  const deckRpc = (command: unknown) =>
    JSON.parse(sql(`${actor}select public.deck_mutate(${literal(command)});`));
  const resolveDeck = (refs: string[], groups?: number[], expected?: string) =>
    JSON.parse(
      sql(
        `${actor}select public.deck_resolve(array[${refs.map((x) => `'${x}'`).join(",")}],${groups ? `array[${groups.join(",")}]` : "null"},20,${expected ? `'${expected}'` : "null"});`,
      ),
    );
  deckRpc({
    kind: "create",
    id: deckA,
    name: "Travel",
    description: "Across Bands",
  });
  deckRpc({ kind: "create", id: deckB, name: "Work", description: "" });
  deckRpc({
    kind: "add",
    targets: [deckA],
    ids: rows.slice(0, 700).map((v) => v.id),
  });
  deckRpc({
    kind: "add",
    targets: [deckB],
    ids: rows.slice(500, 1200).map((v) => v.id),
  });
  const union = resolveDeck([deckB, deckA]);
  if (union.ids.length !== 1200 || new Set(union.ids).size !== 1200)
    throw new Error("Deck union duplicated or truncated entries");
  const groups = resolveDeck([deckA, deckB], [1, 13]);
  if (
    JSON.stringify(groups.ids) !==
    JSON.stringify([...union.ids.slice(0, 20), ...union.ids.slice(240, 260)])
  )
    throw new Error("Deck groups were sliced before union");
  deckRpc({ kind: "add", targets: [deckA], ids: [rows[0].id, rows[0].id] });
  if (resolveDeck([deckA, deckB]).fingerprint !== union.fingerprint)
    throw new Error("Duplicate membership changed source revision");
  const otherActor =
    "set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';";
  if (
    sql(`${otherActor}select count(*) from public.decks;`) !== "0" ||
    sql(`${otherActor}select count(*) from public.deck_entries;`) !== "0"
  )
    throw new Error("Deck RLS leaked ownership");
  let denied = 0;
  for (const query of [
    `${otherActor}select public.deck_resolve(array['${deckA}']);`,
    `${otherActor}select public.deck_mutate(${literal({ kind: "add", targets: [deckA], ids: [rows[800].id] })});`,
    `${actor}select public.deck_mutate(${literal({ kind: "add", targets: [deckA, randomUUID()], ids: [rows[800].id] })});`,
    `${actor}select public.deck_mutate(${literal({ kind: "update", id: deckA, revision: 0, name: "Stale", description: "" })});`,
    `${actor}select public.practice_create_before_decks('{}');`,
    `set role anon;select public.deck_list();`,
  ]) {
    try {
      sql(query);
    } catch {
      denied++;
    }
  }
  if (denied !== 6 || resolveDeck([deckA]).ids.length !== 700)
    throw new Error(
      "Deck authorization, revision or all-or-nothing insertion failed",
    );
  const page = JSON.parse(
    sql(
      `${actor}select public.deck_words(array['${deckA}','${deckB}'],'','','',36,30);`,
    ),
  );
  if (
    page.total !== 1200 ||
    page.items.length !== 30 ||
    page.items[0].id !== union.ids[1050]
  )
    throw new Error("Deck word pagination lost rows after 1000");
  const searched = JSON.parse(
    sql(
      `${actor}select public.deck_words(array['${deckA}','${deckB}'],'爱 好','','',1,30);`,
    ),
  );
  if (!searched.items.some((v: { id: string }) => v.id === rows[1].id))
    throw new Error("Deck search did not normalize whitespace");
  if (
    JSON.parse(
      sql(
        `${actor}select public.deck_words(array['${deckA}','${deckB}'],'%','','',1,30);`,
      ),
    ).total !== 0
  )
    throw new Error("Deck search treated wildcard input as a filter bypass");
  const frozenInput = {
    // A grouped source is frozen by the practice transaction below.
    requestId: randomUUID(),
    source: {
      kind: "decks",
      refs: [deckA, deckB],
      fingerprint: union.fingerprint,
      groups: [1, 13],
    },
    mode: "learn",
    direction: "mixed",
    language: "en",
    lessonSize: 20,
    exerciseTypes: ["meaning_choice"],
  };
  const frozen = JSON.parse(
    sql(`${actor}select public.practice_create(${literal(frozenInput)});`),
  );
  if (frozen.total !== 40 || frozen.source.kind !== "decks")
    throw new Error("Deck practice source was not preserved");
  let rejectedTypes = false;
  try {
    sql(
      `${actor}select public.practice_create(${literal({ ...frozenInput, exerciseTypes: ["matching"] })});`,
    );
  } catch {
    rejectedTypes = true;
  }
  if (!rejectedTypes)
    throw new Error("Reused deck request bypassed MCQ type validation");
  const frozenIds = JSON.parse(
    sql(
      `select jsonb_agg(vocabulary_id order by vocabulary_id) from public.practice_questions where session_id='${frozen.id}';`,
    ),
  );
  if (JSON.stringify(frozenIds) !== JSON.stringify([...groups.ids].sort()))
    throw new Error("Deck practice froze the wrong IDs");
  deckRpc({ kind: "remove", id: deckA, ids: [rows[0].id] });
  let changed = false;
  try {
    resolveDeck([deckA, deckB], undefined, union.fingerprint);
  } catch {
    changed = true;
  }
  if (!changed) throw new Error("Changed source was silently accepted");
  const metadata = JSON.parse(sql(`${actor}select public.deck_list();`));
  deckRpc({
    kind: "delete",
    id: deckA,
    revision: metadata.find((d: { id: string }) => d.id === deckA).revision,
  });
  deckRpc({
    kind: "delete",
    id: deckB,
    revision: metadata.find((d: { id: string }) => d.id === deckB).revision,
  });
  if (
    JSON.parse(
      sql(`${actor}select public.practice_create(${literal(frozenInput)});`),
    ).id !== frozen.id
  )
    throw new Error("Creation retry re-resolved a deleted deck");
  if (
    JSON.parse(sql(`${actor}select public.practice_read('${frozen.id}');`))
      .session.total !== 40
  )
    throw new Error("Deleting a deck deleted active practice");
  if (
    sql("select count(*) from public.vocabulary;") !== "11092" ||
    sql("select count(*) from public.deck_entries;") !== "0"
  )
    throw new Error(
      "Deck delete affected vocabulary or retained orphan memberships",
    );
  console.log(
    "PASS: deck union/grouping, 1200-row pagination, duplicate membership, RLS, denied foreign writes, atomic destinations, stale edits, source fingerprints, frozen practice and delete-safe creation retries.",
  );
  const afterDecks = sql(
    "select md5(coalesce(string_agg(row_to_json(t)::text,'' order by user_id,vocabulary_id),'')) from public.user_vocabulary t;",
  );
  if (before !== after || before !== afterDecks)
    throw new Error("Practice modified vocabulary progress");
  sql(
    `${actor}select public.practice_mark_difficult('${sid}',array['${retryId}']);`,
  );
  sql(
    `do $$ begin assert (select state='NEW' and difficult and not favorite and studied_at is null from public.user_vocabulary where vocabulary_id='${retryId}'),'bulk difficulty granted study/mastery';end $$;`,
  );
  console.log(
    "PASS: private answer keys, owner RLS, anonymous denial, server scoring, forged score rejection, idempotency, revision conflicts, immutable learn answers, early submission, independent retries and unchanged learning progress.",
  );
} finally {
  database = "postgres";
  sql(`drop database ${name};`);
}
