import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import type { Vocabulary } from "../src/lib/domain/types";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(
  url,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const browser = await chromium.launch(),
  users: string[] = [];
const baseURL = process.env.DECKS_TEST_URL || "http://localhost:3000";
try {
  const accounts = [];
  for (let i = 0; i < 2; i++) {
    const email = `hanziflow-decks-qa-${randomUUID()}@example.invalid`,
      password = `QA!${randomBytes(24).toString("base64url")}9z!`;
    const r = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { hanziflow_test: true, display_name: "Deck QA" },
    });
    if (r.error || !r.data.user)
      throw new Error("Cannot create disposable deck QA account");
    users.push(r.data.user.id);
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if ((await db.auth.signInWithPassword({ email, password })).error)
      throw new Error("QA sign-in failed");
    accounts.push({ email, password, db });
  }
  const db = accounts[0].db,
    other = accounts[1].db;
  const rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await db.rpc(name, args);
    if (r.error) throw new Error(`${name}: ${r.error.message}`);
    return r.data;
  };
  const rows = JSON.parse(
      await readFile("data/catalogue.json", "utf8"),
    ) as Vocabulary[],
    deckA = randomUUID(),
    deckB = randomUUID();
  for (const [id, name] of [
    [deckA, "Du lịch QA"],
    [deckB, "Công việc QA"],
  ])
    await rpc("deck_mutate", {
      p_command: {
        kind: "create",
        id,
        name,
        description: "Bộ cá nhân để kiểm tra",
      },
    });
  await rpc("deck_mutate", {
    p_command: {
      kind: "add",
      targets: [deckA],
      ids: rows.slice(0, 700).map((v) => v.id),
    },
  });
  await rpc("deck_mutate", {
    p_command: {
      kind: "add",
      targets: [deckB],
      ids: rows.slice(500, 1200).map((v) => v.id),
    },
  });
  const merged = await rpc("deck_resolve", { p_refs: [deckA, deckB] });
  expect(merged.ids).toHaveLength(1200);
  expect(new Set(merged.ids).size).toBe(1200);
  await rpc("deck_mutate", {
    p_command: {
      kind: "add",
      targets: [deckA],
      ids: rows.slice(0, 20).map((v) => v.id),
    },
  });
  expect(
    (await rpc("deck_resolve", { p_refs: [deckB, deckA] })).fingerprint,
  ).toBe(merged.fingerprint);
  const later = await rpc("deck_words", {
    p_refs: [deckA, deckB],
    p_page: 36,
    p_size: 30,
  });
  expect(later.total).toBe(1200);
  expect(later.items[0].id).toBe(merged.ids[1050]);
  const searched = await rpc("deck_words", {
    p_refs: [deckA, deckB],
    p_query: "ài hào",
  });
  expect(searched.items.some((v: { id: string }) => v.id === rows[1].id)).toBe(
    true,
  );
  await rpc("patch_vocabulary", {
    p_id: rows[0].id,
    p_patch: { favorite: true, difficult: true, state: "LEARNING" },
  });
  expect(
    (await rpc("deck_resolve", { p_refs: ["saved", "difficult", "learned"] }))
      .ids,
  ).toEqual([rows[0].id]);
  expect(
    (await other.rpc("deck_resolve", { p_refs: [deckA] })).error,
  ).toBeTruthy();
  expect((await other.from("decks").select("*")).data).toEqual([]);
  expect((await other.from("deck_entries").select("*")).data).toEqual([]);
  expect(
    (
      await other.rpc("deck_mutate", {
        p_command: { kind: "add", targets: [deckA], ids: [rows[1300].id] },
      })
    ).error,
  ).toBeTruthy();
  expect(
    (await db.from("decks").update({ name: "FORGED" }).eq("id", deckA)).error,
  ).toBeTruthy();
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({
        baseURL,
        colorScheme: "dark",
        viewport: { width: 1440, height: 1000 },
      }),
    ),
  );
  for (const c of contexts)
    await c.addInitScript({
      content: `
    Object.defineProperty(window,"SpeechSynthesisUtterance",{value:function(text){this.text=text;},configurable:true});
    Object.defineProperty(window,"speechSynthesis",{value:Object.assign(new EventTarget(),{getVoices:()=>[{lang:"zh-CN",name:"QA Mandarin"}],cancel:()=>{},speak:u=>setTimeout(()=>{if(u.onstart)u.onstart({});if(u.onend)u.onend({});},10)}),configurable:true});
  `,
    });
  const pages = await Promise.all(contexts.map((c) => c.newPage())),
    errors: string[] = [];
  for (const p of pages) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(30000);
    p.setDefaultNavigationTimeout(45000);
    await p.goto("/login");
    await p.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("hanziflow.decks.v1", 1);
        r.onupgradeneeded = () =>
          r.result.createObjectStore("decks", { keyPath: "id" });
        r.onsuccess = () => resolve(r.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("decks", "readwrite");
        tx.objectStore("decks").put({
          id: crypto.randomUUID(),
          name: "Bộ bản thử không nhập",
          description: "",
          revision: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          members: [],
        });
        tx.oncomplete = () => resolve();
      });
      db.close();
    });
    await p.getByLabel("Email", { exact: true }).fill(accounts[0].email);
    await p.locator('input[type="password"]').fill(accounts[0].password);
    await p.locator('form button[type="submit"]').click();
    await expect(p).toHaveURL(/\/dashboard$/, { timeout: 45000 });
  }
  const [a, b] = pages;
  await a.goto("/decks");
  await expect(a.locator(".deck-card")).toHaveCount(5);
  await expect(a.locator("main")).not.toContainText("Bộ bản thử không nhập");
  await a.getByRole("button", { name: "Tạo bộ mới", exact: true }).click();
  const editor = a.getByRole("dialog", { name: "Tạo bộ từ mới", exact: true });
  await editor.getByLabel("Tên bộ từ", { exact: true }).fill("Thiết bị QA");
  await editor
    .getByLabel("Mô tả", { exact: true })
    .fill("Đồng bộ giữa thiết bị");
  await editor.getByRole("button", { name: "Tạo bộ", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await b.goto("/decks");
  await expect(
    b.locator(".deck-card").filter({ hasText: "Thiết bị QA" }),
  ).toBeVisible();
  const deckC = (await rpc("deck_list")).find(
    (d: { name: string }) => d.name === "Thiết bị QA",
  );
  expect(deckC).toBeTruthy();
  const extra = rows[1300];
  await a.goto(`/vocabulary/${extra.id}`);
  await a.getByRole("button", { name: "Thêm vào bộ", exact: true }).click();
  const add = a.getByRole("dialog", { name: "Thêm từ vào bộ", exact: true });
  for (const name of ["Du lịch QA", "Công việc QA", "Thiết bị QA"])
    await add.getByLabel(name, { exact: false }).check();
  await a.route(`**/vocabulary/${extra.id}`, (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await add.getByRole("button", { name: "Lưu vào bộ đã chọn" }).click();
  await expect(add.getByRole("alert")).toBeVisible();
  await expect(add.getByLabel("Du lịch QA", { exact: false })).toBeChecked();
  await a.unroute(`**/vocabulary/${extra.id}`);
  await add.getByRole("button", { name: "Lưu vào bộ đã chọn" }).click();
  await expect(add).not.toBeVisible();
  expect(
    (await rpc("deck_resolve", { p_refs: [deckA, deckB, "saved"] })).ids,
  ).toHaveLength(1201);
  const singleton = await rpc("deck_resolve", { p_refs: [deckC.id] });
  await b.goto(
    `/flashcards?decks=${deckC.id}&version=${singleton.fingerprint}&size=20`,
  );
  await expect(b.locator(".flashcard-hanzi")).toHaveText(extra.word);
  await a.goto("/decks");
  for (const name of ["Du lịch QA", "Công việc QA", "Từ đã lưu"])
    await a.getByLabel(`Chọn bộ ${name}`, { exact: true }).check();
  await expect(a.locator(".deck-selection-bar")).toContainText(
    "1.201 mục từ duy nhất",
  );
  await mkdir(".local-tests/decks", { recursive: true });
  await a.screenshot({
    path: ".local-tests/decks/overview-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await a
    .getByRole("button", { name: "Flashcards / Luyện tập", exact: false })
    .click();
  const study = a.getByRole("dialog", { name: "Học từ các bộ đã chọn" });
  await study.getByRole("button", { name: "Chọn nhóm", exact: true }).click();
  await study.getByLabel("Chọn nhóm 1", { exact: true }).check();
  await study.getByRole("button", { name: "Sau", exact: true }).click();
  await study.getByLabel("Chọn nhóm 13", { exact: true }).check();
  await expect(study).toContainText("Đang chọn 40 mục từ");
  await study.getByRole("button", { name: "Luyện tập", exact: true }).click();
  await a.getByLabel("Ngôn ngữ nghĩa", { exact: true }).selectOption("en");
  await expect(a.locator(".practice-start")).toContainText(
    "40 mục từ · 40 câu",
  );
  await expect(
    a.getByRole("button", { name: "Bắt đầu", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const creationRequests: {
    url: string;
    body: string;
    headers: Record<string, string>;
  }[] = [];
  a.on("request", (r) => {
    const body = r.postData();
    if (r.method() === "POST" && body?.includes('"requestId"'))
      creationRequests.push({ url: r.url(), body, headers: r.headers() });
  });
  await a.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(a).toHaveURL(/\/practice\/[\da-f-]{36}$/, { timeout: 60000 });
  const sessionId = a.url().split("/").at(-1)!;
  let batch = await rpc("practice_read", { p_id: sessionId });
  expect(batch.session.total).toBe(40);
  expect(batch.session.source.kind).toBe("decks");
  expect(
    Object.values(batch.session.exerciseCounts).reduce(
      (n, v) => Number(n) + Number(v),
      0,
    ),
  ).toBe(40);
  expect(
    Object.values(batch.session.exerciseCounts).every((v) => Number(v) > 0),
  ).toBe(true);
  const privateRows = await admin
    .from("practice_questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("ordinal");
  if (privateRows.error) throw privateRows.error;
  const expected = [
    ...merged.ids.slice(0, 20),
    ...merged.ids.slice(240, 260),
  ].sort();
  expect(privateRows.data.map((q) => q.vocabulary_id).sort()).toEqual(expected);
  await b.goto(`/practice/${sessionId}`);
  const q = privateRows.data.find((q) => q.ordinal === batch.session.cursor)!;
  if (q.exercise_type === "matching")
    await b
      .getByRole("group", { name: "Nghĩa cần ghép" })
      .getByRole("button", {
        name: q.options.find(
          (o: { id: string }) => o.id === q.correct_option_id,
        ).label,
        exact: true,
      })
      .click();
  else {
    if (q.exercise_type === "listening_choice") {
      await b
        .getByRole("button", { name: "Phát âm câu hỏi", exact: true })
        .click();
      await expect(
        b.locator(".practice-options .practice-option").first(),
      ).toBeEnabled();
    }
    await b
      .locator(".practice-options .practice-option")
      .nth(
        q.options.findIndex(
          (o: { id: string }) => o.id === q.correct_option_id,
        ),
      )
      .click();
  }
  await expect
    .poll(
      async () =>
        (await rpc("practice_read", { p_id: sessionId })).session.answered,
    )
    .toBe(1);
  expect(
    (await rpc("practice_read", { p_id: sessionId })).session.correct,
  ).toBe(1);
  let grades = 1;
  for (const type of ["meaning_choice", "listening_choice", "matching"]) {
    const next = privateRows.data.find((row) => row.exercise_type === type)!;
    if (type === q.exercise_type) continue;
    await b
      .getByLabel("Đến câu", { exact: true })
      .fill(String(next.ordinal + 1));
    await b.getByRole("button", { name: "Đến câu", exact: true }).click();
    if (type === "matching")
      await b
        .getByRole("group", { name: "Nghĩa cần ghép" })
        .getByRole("button", {
          name: next.options.find(
            (o: { id: string }) => o.id === next.correct_option_id,
          ).label,
          exact: true,
        })
        .click();
    else {
      if (type === "listening_choice") {
        await b
          .getByRole("button", { name: "Phát âm câu hỏi", exact: true })
          .click();
        await expect(
          b.locator(".practice-options .practice-option").first(),
        ).toBeEnabled();
      }
      await b
        .locator(".practice-options .practice-option")
        .nth(
          next.options.findIndex(
            (o: { id: string }) => o.id === next.correct_option_id,
          ),
        )
        .click();
    }
    grades++;
    await expect
      .poll(
        async () =>
          (await rpc("practice_read", { p_id: sessionId })).session.answered,
      )
      .toBe(grades);
  }
  expect(
    (await rpc("practice_read", { p_id: sessionId })).session.correct,
  ).toBe(3);
  const current = await rpc("deck_resolve", { p_refs: [deckA, deckB] });
  const examInput = {
    requestId: randomUUID(),
    source: {
      kind: "decks",
      refs: [deckA, deckB],
      fingerprint: current.fingerprint,
      groups: [1],
    },
    mode: "exam",
    direction: "mixed",
    language: "en",
    lessonSize: 20,
    exerciseTypes: ["meaning_choice"],
  };
  const exam = await rpc("practice_create", { p_input: examInput });
  expect(
    (
      await db.rpc("practice_create", {
        p_input: { ...examInput, exerciseTypes: ["matching"] },
      })
    ).error,
  ).toBeTruthy();
  expect(exam.total).toBe(20);
  expect(
    (await rpc("practice_read", { p_id: exam.id })).questions.every(
      (q: { feedback?: unknown }) => !q.feedback,
    ),
  ).toBe(true);
  const metadata = await rpc("deck_list");
  for (const id of [deckA, deckB])
    await rpc("deck_mutate", {
      p_command: {
        kind: "delete",
        id,
        revision: metadata.find((d: { id: string }) => d.id === id).revision,
      },
    });
  expect((await rpc("practice_create", { p_input: examInput })).id).toBe(
    exam.id,
  );
  batch = await rpc("practice_read", { p_id: sessionId });
  expect(batch.session.total).toBe(40);
  expect(batch.session.answered).toBe(3);
  const trace = creationRequests.at(-1)!;
  expect(trace).toBeTruthy();
  const replay = await a.request.post(trace.url, {
    data: trace.body,
    headers: {
      "next-action": trace.headers["next-action"],
      "content-type": trace.headers["content-type"],
      origin: baseURL,
      accept: "text/x-component",
    },
  });
  expect(replay.ok()).toBe(true);
  expect(await replay.text()).toContain(sessionId);
  await b.goto("/decks");
  await expect(b.getByRole("heading",{name:"Bộ từ của tôi",exact:true})).toBeVisible();
  await expect(b.locator(".deck-card")).toHaveCount(4);
  await b.setViewportSize({ width: 390, height: 844 });
  await b.keyboard.press("Escape");
  expect(
    await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await b.screenshot({
    path: ".local-tests/decks/overview-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await b.goto(`/decks/${deckC.id}`);await expect(b.locator(".deck-word-row")).toHaveCount(1);expect(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await b.screenshot({path:".local-tests/decks/detail-mobile.png",fullPage:true,animations:"disabled"});
  const progress = await admin
    .from("user_vocabulary")
    .select("*")
    .eq("user_id", users[0]);
  expect(progress.data).toHaveLength(1);
  expect(progress.data![0]).toMatchObject({
    vocabulary_id: rows[0].id,
    state: "LEARNING",
    favorite: true,
    difficult: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS live decks: 1200+ canonical IDs, smart/private unions, pagination, RLS, cross-device CRUD, failed-save retry, isolated trial storage, Flashcards, all three practice types, private exams, frozen sources after deletion, idempotent creation replay, mobile and unchanged progress.",
  );
} finally {
  await browser.close();
  for (const id of users) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) throw new Error("Deck QA cleanup failed");
  }
}
