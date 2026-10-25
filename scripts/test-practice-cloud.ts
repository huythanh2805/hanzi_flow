import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Vocabulary } from "../src/lib/domain/types";

// Explicitly run against the owner's configured project, using disposable users only.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(
  url,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
const users: string[] = [];
const browser = await chromium.launch();
const baseURL = process.env.PRACTICE_TEST_URL || "http://localhost:3000";
try {
  const credentials = [];
  for (let i = 0; i < 2; i++) {
    const email = `hanziflow-practice-qa-${randomUUID()}@example.invalid`,
      password = `QA!${randomBytes(24).toString("base64url")}9z!`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { hanziflow_test: true, display_name: "Practice QA" },
    });
    if (error || !data.user)
      throw new Error("Disposable QA account creation failed");
    users.push(data.user.id);
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if ((await client.auth.signInWithPassword({ email, password })).error)
      throw new Error("QA login failed");
    credentials.push({ email, password, client });
  }
  const db = credentials[0].client,
    other = credentials[1].client;
  async function rpc(name: string, args: Record<string, unknown> = {}) {
    const r = await db.rpc(name, args);
    if (r.error) throw new Error(`${name}: ${r.error.message}`);
    return r.data;
  }
  const input = (source: unknown, language = "en", mode = "exam") => ({
    requestId: randomUUID(),
    source,
    language,
    mode,
    direction: "mixed",
    lessonSize: 20,
  });
  const catalogue = JSON.parse(
    await readFile("data/catalogue.json", "utf8"),
  ) as Vocabulary[];
  for (const band of ["1", "7-9"]) {
    const recipe = input({ kind: "band", band }),
      session = await rpc("practice_create", { p_input: recipe });
    const expected = catalogue
      .filter((v) => v.band === band)
      .map((v) => v.id)
      .sort();
    expect(session.total).toBe(expected.length);
    const actual: string[] = [];
    for (let offset = 0; offset < session.total; offset += 1000) {
      const r = await admin
        .from("practice_questions")
        .select("vocabulary_id")
        .eq("session_id", session.id)
        .order("ordinal")
        .range(offset, offset + 999);
      if (r.error) throw new Error(r.error.message);
      actual.push(...r.data.map((q) => q.vocabulary_id));
    }
    expect(actual.sort()).toEqual(expected);
    const batch = await rpc("practice_read", { p_id: session.id });
    expect(JSON.stringify(batch)).not.toMatch(
      /correctOptionId|isCorrect|vocabularyId/,
    );
    expect(batch.session.correct).toBeNull();
    expect((await rpc("practice_create", { p_input: recipe })).id).toBe(
      session.id,
    );
    expect(
      (await other.rpc("practice_read", { p_id: session.id })).error,
    ).toBeTruthy();
    console.log(
      `PASS live full Band ${band}: ${expected.length} exact IDs, private keys, idempotent creation and ownership`,
    );
  }
  const wide = await rpc("practice_create", {
    p_input: input(
      { kind: "entries", ids: catalogue.slice(0, 21).map((v) => v.id) },
      "en",
      "learn",
    ),
  });
  const atEnd = {
    kind: "defer",
    ordinal: 0,
    revision: 0,
    eventId: "40000000-0000-4000-8000-000000000013",
  };
  const wideAck = await rpc("practice_commit", {
    p_id: wide.id,
    p_command: atEnd,
  });
  const wideQueue = async () => {
    const r = await admin
      .from("practice_sessions")
      .select("learning_queue")
      .eq("id", wide.id)
      .single();
    if (r.error) throw new Error("QA wide queue missing");
    return r.data.learning_queue as number[];
  };
  expect((await wideQueue()).indexOf(0)).toBe(20);
  expect(
    (await rpc("practice_commit", { p_id: wide.id, p_command: atEnd }))
      .revision,
  ).toBe(wideAck.revision);
  expect((await wideQueue()).filter((n) => n === 0)).toHaveLength(1);
  await rpc("practice_commit", {
    p_id: wide.id,
    p_command: {
      ...atEnd,
      revision: wideAck.revision,
      eventId: "40000000-0000-4000-8000-000000000000",
    },
  });
  expect((await wideQueue()).indexOf(0)).toBe(1);
  console.log(
    "PASS live repeat positions 1 and 20, including the tail, with stable idempotent replay",
  );
  const invalid = await db.rpc("practice_create", {
    p_input: input({ kind: "band", band: "7-9" }, "vi"),
  });
  expect(invalid.error?.message).toContain("hsk30-b79-0367");
  expect(
    (await db.from("practice_questions").select("correct_option_id")).error,
  ).toBeTruthy();

  const session = await rpc("practice_create", {
    p_input: input({
      kind: "entries",
      ids: ["hsk30-b1-0001", "hsk30-b1-0002"],
    }),
  });
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({
        baseURL,
        viewport: { width: 1440, height: 1000 },
        colorScheme: "dark",
        reducedMotion: "reduce",
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const errors: string[] = [];
  for (const page of pages) {
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(credentials[0].email);
    await page.locator('input[type="password"]').fill(credentials[0].password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 45000 });
    if (page === pages[0]) {
      await page.goto("/practice?band=7-9");
      await page
        .getByRole("button", { name: "Toàn Band", exact: true })
        .click();
      await page
        .getByLabel("Ngôn ngữ nghĩa", { exact: true })
        .selectOption("vi");
      await expect(
        page.getByRole("button", { name: "Bắt đầu", exact: true }),
      ).toBeDisabled();
      await expect(page.locator(".form-error[role=alert]")).toContainText(
        "hsk30-b79-0367",
      );
    }
    await page.goto(`/practice/${session.id}`);
    await expect(page.locator(".practice-option")).toHaveCount(4);
  }
  const [a, b] = pages;
  await a.route("**/practice/**", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await a.locator(".practice-option").first().click();
  await expect(a.getByRole("button", { name: "Thử lưu lại" })).toBeVisible();
  await expect(a.locator(".practice-option").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(a.locator(".practice-save-state")).toContainText(
    "Chưa lưu thành công",
  );
  await a.unroute("**/practice/**");
  await a.getByRole("button", { name: "Thử lưu lại" }).click();
  await expect(a.locator(".practice-save-state")).toContainText("Đã lưu");
  await expect(a.locator(".practice-feedback")).toHaveCount(0);
  await b.locator(".practice-option").nth(1).click();
  await expect(b.locator(".form-error[role=alert]")).toContainText(
    "tab hoặc thiết bị khác",
  );
  await b.getByRole("button", { name: "Tải trạng thái đã lưu" }).click();
  await expect(b.locator(".practice-option").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await b.locator(".practice-option").nth(1).click();
  await expect(b.locator(".practice-option").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await b.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await b.getByRole("button", { name: "Xác nhận nộp" }).click();
  await expect(b).toHaveURL(/\/result$/);
  await expect(b.locator(".practice-result-word")).toHaveCount(2);
  await b.getByRole("button", { name: "Chọn tất cả", exact: true }).click();
  await b.getByRole("button", { name: "Lưu vào Từ khó" }).click();
  await expect(b.getByRole("button", { name: "Luyện lại 2 từ" })).toBeEnabled();
  const saved = await admin
    .from("user_vocabulary")
    .select("state,difficult,studied_at")
    .eq("user_id", users[0]);
  expect(saved.error).toBeNull();
  expect(saved.data).toHaveLength(2);
  expect(
    saved.data!.every((v) => v.state === "NEW" && v.difficult && !v.studied_at),
  ).toBe(true);
  await b.getByRole("button", { name: "Luyện lại 2 từ" }).click();
  await expect(b).toHaveURL(/\/practice\/[\da-f-]{36}$/, { timeout: 30000 });
  await expect(b.locator(".practice-option")).toHaveCount(4);
  const childURL = b.url();
  const deferredPrompt = await b.locator(".practice-question h2").innerText();
  await b
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect(b.locator(".practice-question h2")).not.toHaveText(
    deferredPrompt,
  );
  await expect(b.locator(".practice-player-meta")).toContainText(
    "0 đã trả lời",
  );
  await a.goto(childURL);
  await expect(a.locator(".practice-question h2")).not.toHaveText(
    deferredPrompt,
  );
  await expect(a.getByText("1 từ chờ hỏi lại", { exact: false })).toBeVisible();
  await b.reload();
  await b.locator(".practice-option").first().click();
  await expect(b.locator(".practice-feedback")).toBeVisible();
  await expect(b.locator(".practice-option").first()).toBeDisabled();
  await b.getByRole("button", { name: "Tiếp", exact: true }).click();
  await expect(b.locator(".practice-question h2")).toHaveText(deferredPrompt);
  await expect(b.locator(".practice-question .eyebrow")).toContainText(
    "ĐANG HỎI LẠI",
  );
  await expect(
    b.getByRole("button", { name: "Hỏi lại lượt sau", exact: true }),
  ).toBeDisabled();
  await b.locator(".practice-option").first().click();
  await expect(b.locator(".practice-player-meta")).toContainText(
    "2 đã trả lời",
  );
  await b.setViewportSize({ width: 390, height: 844 });
  expect(
    await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await b.screenshot({
    path: ".local-tests/practice-cloud-mobile.png",
    fullPage: true,
  });
  const quick = await rpc("practice_create", {
    p_input: input(
      {
        kind: "entries",
        ids: ["hsk30-b1-0001", "hsk30-b1-0002", "hsk30-b1-0003"],
      },
      "en",
      "learn",
    ),
  });
  await b.goto(`/practice/${quick.id}`);
  await b.getByLabel("Quick mode", { exact: true }).check();
  async function quickAnswer(ordinal: number, correct: boolean) {
    const { data: q, error } = await admin
      .from("practice_questions")
      .select("correct_option_id,options")
      .eq("session_id", quick.id)
      .eq("ordinal", ordinal)
      .single();
    if (error || !q) throw new Error("QA quick question missing");
    const options = q.options as { id: string }[];
    await b
      .locator(".practice-option")
      .nth(
        options.findIndex((o) =>
          correct ? o.id === q.correct_option_id : o.id !== q.correct_option_id,
        ),
      )
      .click();
  }
  await b.route("**/practice/**", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await quickAnswer(0, true);
  await expect(b.getByRole("button", { name: "Thử lưu lại" })).toBeVisible();
  await expect(b.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 1",
  );
  await b.unroute("**/practice/**");
  await b.getByRole("button", { name: "Thử lưu lại" }).click();
  await expect(b.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 2",
  );
  await expect(b.locator(".practice-feedback")).toHaveCount(0);
  await b.reload();
  await expect(b.getByLabel("Quick mode", { exact: true })).toBeChecked();
  await quickAnswer(1, false);
  await expect(b.locator(".practice-feedback.is-incorrect")).toBeVisible();
  await expect(b.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 2",
  );
  await b.getByRole("button", { name: "Tiếp", exact: true }).click();
  await b.route("**/practice/**", (route) =>
    route.request().method() === "POST" &&
    route.request().postData()?.includes('"kind":"submit"')
      ? route.abort("failed")
      : route.continue(),
  );
  await quickAnswer(2, true);
  await expect(b.getByRole("button", { name: "Thử lưu lại" })).toBeVisible();
  const beforeFinish = await rpc("practice_read", { p_id: quick.id });
  expect(beforeFinish.session).toMatchObject({
    status: "active",
    answered: 3,
    correct: 2,
  });
  await b.unroute("**/practice/**");
  await b.getByRole("button", { name: "Thử lưu lại" }).click();
  await expect(b).toHaveURL(new RegExp(`/practice/${quick.id}/result$`));
  await expect(b.locator(".practice-result-word")).toHaveCount(3);
  await expect(
    b
      .locator(".practice-result-stats .card")
      .filter({ hasText: "Đúng" })
      .locator("strong"),
  ).toHaveText("2");
  console.log(
    "PASS live Quick mode: save failure stays put, retry advances once, wrong answer pauses, last correct submits with safe finish retry and reload retains preference",
  );
  const repeatedSession = await rpc("practice_create", {
    p_input: input(
      {
        kind: "entries",
        ids: Array.from(
          { length: 6 },
          (_, i) => `hsk30-b1-${String(i + 1).padStart(4, "0")}`,
        ),
      },
      "en",
      "learn",
    ),
  });
  await b.goto(`/practice/${repeatedSession.id}`);
  await b.getByLabel("Quick mode", { exact: true }).uncheck();
  const rq = await admin
    .from("practice_questions")
    .select("ordinal,options,correct_option_id")
    .eq("session_id", repeatedSession.id)
    .order("ordinal");
  if (rq.error) throw new Error("QA repeat questions missing");
  const chooseRepeat = async (ordinal: number, correct: boolean) => {
    const q = rq.data.find((q) => q.ordinal === ordinal)!;
    const options = q.options as { id: string }[];
    await b
      .locator(".practice-option")
      .nth(
        options.findIndex((o) =>
          correct ? o.id === q.correct_option_id : o.id !== q.correct_option_id,
        ),
      )
      .click();
  };
  await chooseRepeat(0, false);
  await expect(b.locator(".practice-feedback.is-incorrect")).toBeVisible();
  await expect(
    b.getByRole("button", { name: "Hỏi lại lượt sau", exact: true }),
  ).toBeEnabled();
  await b.screenshot({
    path: ".local-tests/practice-repeat-after-wrong.png",
    fullPage: true,
  });
  await b
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect(b.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 2",
  );
  await expect(b.locator(".practice-save-state")).toContainText("Đã lưu");
  const queueRead = await admin
    .from("practice_sessions")
    .select("learning_queue")
    .eq("id", repeatedSession.id)
    .single();
  if (queueRead.error) throw new Error("QA repeat queue missing");
  const repeatQueue = queueRead.data.learning_queue as number[],
    repeatSlot = repeatQueue.indexOf(0);
  expect(repeatSlot).toBeGreaterThanOrEqual(1);
  expect(repeatSlot).toBeLessThanOrEqual(repeatQueue.length - 1);
  await a.goto(`/practice/${repeatedSession.id}`);
  await expect(a.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    `Câu hỏi ${repeatQueue[0] + 1}`,
  );
  await b.reload();
  for (const ordinal of repeatQueue.slice(0, repeatSlot)) {
    await chooseRepeat(ordinal, true);
    await expect(b.locator(".practice-feedback.is-correct")).toBeVisible();
    await b.getByRole("button", { name: "Tiếp", exact: true }).click();
  }
  await expect(b.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 1",
  );
  await expect(b.locator(".practice-feedback")).toHaveCount(0);
  await b.getByLabel("Quick mode", { exact: true }).check();
  await chooseRepeat(0, true);
  if (repeatSlot + 1 < repeatQueue.length) {
    await expect(b.locator(".practice-question")).toHaveAttribute(
      "aria-label",
      `Câu hỏi ${repeatQueue[repeatSlot + 1] + 1}`,
    );
  } else {
    await expect(b).toHaveURL(
      new RegExp(`/practice/${repeatedSession.id}/result$`),
    );
  }
  const repeatMeta = await rpc("practice_read", { p_id: repeatedSession.id });
  expect(repeatMeta.session).toMatchObject({
    answered: repeatSlot + 1,
    correct: repeatSlot,
    wrong: 1,
    repeatAnswered: 1,
    repeatCorrect: 1,
  });
  if (repeatSlot + 1 < repeatQueue.length) {
    await b.getByRole("button", { name: "Kết thúc lượt", exact: true }).click();
    await b.getByRole("button", { name: "Xác nhận nộp", exact: true }).click();
  }
  await expect(b).toHaveURL(
    new RegExp(`/practice/${repeatedSession.id}/result$`),
  );
  const firstResult = await rpc("practice_read", { p_id: repeatedSession.id });
  expect(firstResult.questions[0].feedback.isCorrect).toBe(false);
  console.log(
    "PASS live random future repeat position, two-device/reload resume, separate repeat grade, Quick mode and immutable first-round results",
  );
  expect(errors).toEqual([]);
  console.log(
    "PASS live two-device deferred queue/resume, failed save/retry, stale revision, exam secrecy, early submission, separate retry, explicit difficult flags and mobile layout",
  );
} finally {
  await browser.close();
  for (const id of users) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) throw new Error("QA account cleanup failed");
  }
}
