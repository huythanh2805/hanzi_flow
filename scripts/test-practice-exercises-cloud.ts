import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import {
  buildExerciseQuestions,
  exerciseSessionState,
} from "../src/lib/domain/practice-exercises";
import type { PracticeLexeme } from "../src/lib/domain/practice";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(
  url,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const browser = await chromium.launch();
const users: string[] = [];
try {
  const email = `hanziflow-exercises-qa-${randomUUID()}@example.invalid`,
    password = `QA!${randomBytes(24).toString("base64url")}9z!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { hanziflow_test: true, display_name: "Exercise QA" },
  });
  if (created.error || !created.data.user)
    throw new Error("Cannot create disposable QA account");
  users.push(created.data.user.id);
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if ((await db.auth.signInWithPassword({ email, password })).error)
    throw new Error("QA sign-in failed");
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const r = await db.rpc(name, args);
    if (r.error) throw new Error(`${name}: ${r.error.message}`);
    return r.data;
  };
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({
        baseURL: process.env.PRACTICE_TEST_URL || "http://localhost:3000",
        colorScheme: "dark",
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const errors: string[] = [];
  for (const p of pages) {
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("/login");
    await p.getByLabel("Email", { exact: true }).fill(email);
    await p.locator('input[type="password"]').fill(password);
    await p.locator('form button[type="submit"]').click();
    await expect(p).toHaveURL(/\/dashboard$/, { timeout: 45000 });
  }
  const [a, b] = pages;
  await mkdir(".local-tests/practice-exercises", { recursive: true });
  const ids = Array.from(
    { length: 8 },
    (_, i) => `hsk30-b1-${String(i + 1).padStart(4, "0")}`,
  );
  await a.goto(`/practice?entries=${ids.join(",")}`);
  await a.getByLabel("Nghe chọn chữ", { exact: true }).uncheck();
  await a.getByLabel("Chữ ↔ nghĩa", { exact: true }).uncheck();
  await expect(a.locator(".practice-exercise-preview")).toContainText(
    "Ghép cặp: 8 từ",
    { timeout: 30000 },
  );
  const before = await admin
    .from("practice_sessions")
    .select("id")
    .eq("user_id", users[0]);
  expect(before.data).toHaveLength(0); // Preview must not create sessions.
  await a.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(a).toHaveURL(/\/practice\/[\da-f-]{36}$/, { timeout: 60000 });
  await expect(
    a.getByRole("heading", { name: "Ghép chữ với nghĩa" }),
  ).toBeVisible();
  await a.screenshot({
    path: ".local-tests/practice-exercises/matching-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await a.setViewportSize({ width: 390, height: 844 });
  await a.keyboard.press("Escape");
  await expect(a.locator(".sidebar")).toHaveAttribute("inert", "");
  expect(
    await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await a.screenshot({
    path: ".local-tests/practice-exercises/matching-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await a.setViewportSize({ width: 1280, height: 900 });
  const id = a.url().split("/").at(-1)!;
  let batch = await rpc("practice_read", { p_id: id });
  expect(batch.session).toMatchObject({
    total: 8,
    exerciseCounts: { matching: 8 },
    boardCount: 2,
  });
  const privateRows = await admin
    .from("practice_questions")
    .select("*")
    .eq("session_id", id)
    .order("ordinal");
  if (privateRows.error) throw privateRows.error;
  const q = privateRows.data.find((q) => q.ordinal === batch.session.cursor)!;
  const wrong = q.options.find(
    (o: { id: string }) => o.id !== q.correct_option_id,
  );
  await a
    .getByRole("group", { name: "Nghĩa cần ghép" })
    .getByRole("button", { name: wrong.label, exact: true })
    .click();
  await expect(a.locator(".practice-matching .content-note")).toContainText(
    "Chưa khớp",
  );
  await b.goto(`/practice/${id}`);
  await expect(b.locator(".practice-matching .content-note")).toContainText(
    "Chưa khớp",
  );
  batch = await rpc("practice_read", {
    p_id: id,
    p_offset: q.ordinal,
    p_limit: 1,
  });
  expect(
    batch.questions.find((v: { ordinal: number }) => v.ordinal === q.ordinal)
      .feedback,
  ).toBeUndefined();
  await b
    .getByRole("group", { name: "Nghĩa cần ghép" })
    .getByRole("button", {
      name: q.options.find((o: { id: string }) => o.id === q.correct_option_id)
        .label,
      exact: true,
    })
    .click();
  await expect(b.locator(".practice-player-meta")).toContainText(
    "1 đã trả lời · 0 đúng",
  );
  await expect
    .poll(
      async () =>
        (await rpc("practice_read", { p_id: id })).session.repeatCorrect,
    )
    .toBe(1);
  await b
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect
    .poll(async () => {
      const r = await admin
        .from("practice_answers")
        .select("ordinal")
        .eq("session_id", id)
        .eq("board_removed", true);
      return r.data?.length;
    })
    .toBe(1);
  const removed = await admin
    .from("practice_answers")
    .select("ordinal")
    .eq("session_id", id)
    .eq("board_removed", true)
    .single();
  const fallback = privateRows.data.find(
    (q) => q.ordinal === removed.data!.ordinal,
  )!;
  await b
    .getByLabel("Đến câu", { exact: true })
    .fill(String(fallback.ordinal + 1));
  await b.getByRole("button", { name: "Đến câu", exact: true }).click();
  await expect(b.locator(".practice-options .practice-option")).toHaveCount(4);
  await b
    .locator(".practice-options .practice-option")
    .nth(
      fallback.choice_snapshot.options.findIndex(
        (o: { id: string }) =>
          o.id === fallback.choice_snapshot.correctOptionId,
      ),
    )
    .click();
  await expect(b.locator(".practice-feedback.is-correct")).toBeVisible();
  await expect
    .poll(
      async () => (await rpc("practice_read", { p_id: id })).session.correct,
    )
    .toBe(1);
  expect(
    (await db.from("practice_questions").select("*").eq("session_id", id))
      .error,
  ).toBeTruthy();
  expect(
    (
      await db.rpc("practice_install_exercises", {
        p_owner: users[0],
        p_input: {},
        p_questions: [],
        p_queue: [],
        p_counts: {},
        p_board_count: 0,
      })
    ).error,
  ).toBeTruthy();
  const exam = await rpc("practice_create", {
    p_input: {
      requestId: randomUUID(),
      source: { kind: "entries", ids: ids.slice(0, 2) },
      mode: "exam",
      direction: "mixed",
      language: "en",
      lessonSize: 20,
    },
  });
  const examRead = await rpc("practice_read", { p_id: exam.id });
  expect(examRead.session.correct).toBeNull();
  expect(examRead.session.typeStats).toBeNull();
  expect(
    examRead.questions.every((q: { feedback?: unknown }) => !q.feedback),
  ).toBe(true);
  await contexts[1].addInitScript({
    content: `
    Object.defineProperty(window,"SpeechSynthesisUtterance",{value:function(text){this.text=text;},configurable:true});
    Object.defineProperty(window,"speechSynthesis",{value:Object.assign(new EventTarget(),{
      getVoices:()=>[{lang:"zh-CN",name:"QA Mandarin"}],cancel:()=>{},speak:u=>setTimeout(()=>{if(u.onstart)u.onstart({});if(u.onend)u.onend({});},10)
    }),configurable:true});
  `,
  });
  await b.goto(`/practice?entries=${ids.slice(0, 4).join(",")}`);
  await b.getByLabel("Chữ ↔ nghĩa", { exact: true }).uncheck();
  await b.getByLabel("Ghép cặp", { exact: true }).uncheck();
  await expect(b.locator(".practice-exercise-preview")).toContainText(
    "Nghe chọn chữ: 4 từ",
    { timeout: 30000 },
  );
  console.log(
    "Listening preflight passed",
    await b.evaluate(() =>
      window.speechSynthesis.getVoices().map((v) => v.lang),
    ),
  );
  await b.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(b).toHaveURL(/\/practice\/[\da-f-]{36}$/, { timeout: 60000 });
  const listeningId = b.url().split("/").at(-1)!;
  await expect(
    b.getByRole("heading", { name: "Nghe và chọn chữ Hán" }),
  ).toBeVisible();
  const listeningBatch = await rpc("practice_read", { p_id: listeningId });
  expect(listeningBatch.session.exerciseCounts.listening_choice).toBe(4);
  const audioRows = await admin
    .from("practice_questions")
    .select("*")
    .eq("session_id", listeningId)
    .eq("ordinal", listeningBatch.session.cursor)
    .single();
  if (audioRows.error) throw audioRows.error;
  const audioQ = audioRows.data;
  await expect(b.locator(".practice-listening-prompt")).not.toContainText(
    audioQ.feedback.word,
  );
  await expect(
    b.locator(".practice-options .practice-option").first(),
  ).toBeDisabled();
  await b.getByRole("button", { name: "Phát âm câu hỏi", exact: true }).click();
  await expect(
    b.locator(".practice-options .practice-option").first(),
  ).toBeEnabled();
  await b
    .locator(".practice-options .practice-option")
    .nth(
      audioQ.options.findIndex(
        (o: { id: string }) => o.id === audioQ.correct_option_id,
      ),
    )
    .click();
  await expect(b.locator(".practice-feedback.is-correct")).toBeVisible();
  expect(
    (await rpc("practice_read", { p_id: listeningId })).session.correct,
  ).toBe(1);
  await b.screenshot({
    path: ".local-tests/practice-exercises/listening-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  console.log(
    "PASS live listening: authenticated preparation, private frozen audio question, generic accessible prompt, playback gating and transactional grading (speech engine mocked; no audio-quality claim).",
  );
  expect(errors).toEqual([]);
  if (process.env.PRACTICE_FULL_EXERCISES === "1") {
    const lexicon = (await rpc("practice_lexicon", {
      p_language: "en",
    })) as PracticeLexeme[];
    const targetIds = lexicon.filter((v) => v.band === "7-9").map((v) => v.id);
    const requestId = randomUUID(),
      recipe = buildExerciseQuestions(
        lexicon,
        targetIds,
        "mixed",
        requestId,
        randomUUID,
        ["meaning_choice", "listening_choice", "matching"],
      );
    const installAt = Date.now();
    console.log(
      "Testing full-size mixed recipe:",
      recipe.questions.length,
      "words,",
      Math.round(JSON.stringify(recipe.questions).length / 1024),
      "KiB",
    );
    const installation = await admin.rpc("practice_install_exercises", {
      p_owner: users[0],
      p_input: {
        requestId,
        source: { kind: "band", band: "7-9" },
        mode: "learn",
        direction: "mixed",
        language: "en",
        lessonSize: 20,
        exerciseTypes: ["meaning_choice", "listening_choice", "matching"],
      },
      p_questions: recipe.questions,
      p_queue: exerciseSessionState(recipe.questions).learningQueue,
      p_counts: recipe.counts,
      p_board_count: recipe.boardCount,
    });
    if (installation.error)
      throw new Error(
        `Full recipe installation: ${installation.error.message}`,
      );
    console.log("Full recipe installed in", Date.now() - installAt, "ms");
    const savedIds: string[] = [];
    for (let offset = 0; offset < targetIds.length; offset += 1000) {
      const r = await admin
        .from("practice_questions")
        .select("vocabulary_id")
        .eq("session_id", installation.data)
        .order("ordinal")
        .range(offset, offset + 999);
      if (r.error) throw r.error;
      savedIds.push(...r.data.map((q) => q.vocabulary_id));
    }
    expect(savedIds.sort()).toEqual(targetIds.sort());
    expect(savedIds).toHaveLength(5636);
    const full = await rpc("practice_read", {
      p_id: installation.data,
      p_offset: 5625,
      p_limit: 25,
    });
    expect(full.session.total).toBe(5636);
    expect(full.session.exerciseCounts).toEqual(recipe.counts);
    console.log(
      "PASS live full mixed Band 7–9: 5,636 exact IDs, all three types, atomic full-size recipe installation and final batch read.",
    );
  }
  const progress = await admin
    .from("user_vocabulary")
    .select("*")
    .eq("user_id", users[0]);
  expect(progress.data).toHaveLength(0);
  console.log(
    "PASS live: read-only preview, server generation, atomic installation, 8 exact matching IDs, independent-browser resume, immutable first grade, retry grade, MCQ deferral, restricted keys and installation, exam privacy, unchanged vocabulary progress.",
  );
} finally {
  await browser.close();
  for (const id of users) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) throw new Error("QA cleanup failed");
  }
}
