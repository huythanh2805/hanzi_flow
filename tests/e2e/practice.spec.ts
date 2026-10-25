import { test, expect, type Page } from "@playwright/test";
import type {
  PrivatePracticeSession,
  PrivatePracticeQuestion,
} from "../../src/lib/domain/practice";

async function start(page: Page) {
  await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/[\da-f-]{36}$/, { timeout: 90000 });
  await expect(page.locator(".practice-option")).toHaveCount(4);
  if (await page.locator(".practice-question-controls").count()) {
    await expect(page.getByRole("button", { name: /^Hỏi lại/ })).toHaveCount(1);
    await expect(page.locator(".practice-defer")).toHaveCount(0);
  }
}
async function stored(page: Page) {
  const id = page.url().split("/").at(-1)!;
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("hanziflow.practice.v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const store = db.transaction("records").objectStore("records");
    const read = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
    const [session, questions] = await Promise.all([
      read<PrivatePracticeSession>(store.get(`session:${id}`)),
      read<PrivatePracticeQuestion[]>(
        store.getAll(IDBKeyRange.bound(`question:${id}:`, `question:${id}:~`)),
      ),
    ]);
    db.close();
    return {
      session,
      questions,
    };
  }, id);
}

test("multiple group pages preserve selection and freeze the exact first-round IDs", async ({
  page,
}) => {
  await page.goto("/practice?band=1");
  await page.getByLabel("Chọn nhóm 1", { exact: true }).check();
  await page.getByRole("button", { name: "Sau", exact: true }).click();
  await page.getByLabel("Chọn nhóm 13", { exact: true }).check();
  await page.getByRole("button", { name: "Trước", exact: true }).click();
  await expect(page.getByLabel("Chọn nhóm 1", { exact: true })).toBeChecked();
  await expect(page.locator(".practice-start")).toContainText(
    "40 mục từ · 40 câu",
  );
  await start(page);
  const url = page.url(),
    snapshot = await stored(page);
  const ids = snapshot.questions.map((q) => q.vocabularyId).sort();
  expect(ids).toEqual([
    ...Array.from(
      { length: 20 },
      (_, i) => `hsk30-b1-${String(i + 1).padStart(4, "0")}`,
    ),
    ...Array.from(
      { length: 20 },
      (_, i) => `hsk30-b1-${String(i + 241).padStart(4, "0")}`,
    ),
  ]);
  await page.goto("/settings");
  await page.getByLabel("Số từ trong mỗi nhóm học").selectOption("10");
  await page.getByRole("button", { name: "Lưu cài đặt" }).click();
  await page.goto(url);
  expect((await stored(page)).session.lessonSize).toBe(20);
  await expect(page.locator(".practice-option")).toHaveCount(4);
  await expect(
    page
      .locator(".practice-question-controls")
      .getByLabel("Quick mode", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect(page.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 2",
  );
  expect(
    (await stored(page)).session.learningQueue!.filter((n) => n === 0),
  ).toHaveLength(1);
  await expect(page.locator(".practice-feedback")).toHaveCount(0);
  await expect(page.locator(".practice-player-meta")).toContainText(
    "0 đã trả lời",
  );
  await page.reload();
  await expect(page.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 2",
  );
  await page.locator("h1").click();
  await page.keyboard.press("Control+1");
  await expect(page.locator(".practice-feedback")).toHaveCount(0);
  await page.keyboard.press("1");
  await expect(page.locator(".practice-feedback")).toBeVisible();
  await expect(page.locator(".practice-option").first()).toBeDisabled();
  await page
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect(page.locator(".practice-question")).not.toHaveAttribute(
    "aria-label",
    "Câu hỏi 2",
  );
  await expect(page.locator(".practice-player-meta")).toContainText(
    "1 đã trả lời",
  );
  expect(
    (await stored(page)).session.learningQueue!.filter((n) => n === 1),
  ).toHaveLength(1);
});

test("the single toolbar Hỏi lại skips immediately and queues a wrong answer again", async ({
  page,
}) => {
  const ids = Array.from(
    { length: 6 },
    (_, i) => `hsk30-b1-${String(i + 1).padStart(4, "0")}`,
  );
  await page.goto(`/practice?entries=${ids.join(",")}`);
  await start(page);
  await page
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect(page.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 2",
  );
  await expect(page.locator(".practice-player-meta")).toContainText(
    "0 đã trả lời",
  );
  await page
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect(page.locator(".practice-question")).not.toHaveAttribute(
    "aria-label",
    "Câu hỏi 2",
  );
  await expect(page.locator(".practice-player-meta")).toContainText(
    "0 đã trả lời",
  );
  const ordinal =
    Number(
      (await page
        .locator(".practice-question")
        .getAttribute("aria-label"))!.match(/\d+/)![0],
    ) - 1;
  const q = (await stored(page)).questions.find((q) => q.ordinal === ordinal)!;
  await page
    .locator(".practice-option")
    .nth(q.options.findIndex((o) => o.id !== q.correctOptionId))
    .click();
  await expect(page.locator(".practice-feedback.is-incorrect")).toBeVisible();
  const original = (await stored(page)).session.answers[ordinal].optionId;
  await page
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect(page.locator(".practice-question")).not.toHaveAttribute(
    "aria-label",
    `Câu hỏi ${ordinal + 1}`,
  );
  await expect(page.locator(".practice-player-meta")).toContainText(
    "1 đã trả lời · 0 đúng",
  );
  const snapshot = (await stored(page)).session;
  expect(snapshot.answers[ordinal].optionId).toBe(original);
  expect(snapshot.answers[ordinal].repeatPending).toBe(true);
  expect(snapshot.learningQueue!.filter((n) => n === ordinal)).toHaveLength(1);
  const cursor = snapshot.cursor;
  await page.reload();
  await expect(page.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    `Câu hỏi ${cursor + 1}`,
  );
});

test("exam hides feedback, permits edits, resumes and creates a separate retry", async ({
  page,
}) => {
  await page.goto("/practice?entries=hsk30-b1-0001,hsk30-b1-0002");
  await page.getByLabel("Chế độ", { exact: true }).selectOption("exam");
  await start(page);
  const parent = page.url();
  await page.locator(".practice-option").nth(0).click();
  await expect(page.locator(".practice-option").nth(0)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator(".practice-option").nth(1).click();
  await expect(page.locator(".practice-option").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".practice-feedback")).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Đến câu", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Đến câu", exact: true }).click();
  await expect(page.locator(".practice-option").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Còn 1 câu chưa trả lời." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận nộp" }).click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.locator(".practice-result-word")).toHaveCount(2);
  await page.getByRole("button", { name: "Chọn tất cả", exact: true }).click();
  await page.getByRole("button", { name: "Lưu vào Từ khó" }).click();
  await expect(
    page.getByRole("button", { name: "Luyện lại 2 từ" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Luyện lại 2 từ" }).click();
  await expect(page).toHaveURL(/\/practice\/[\da-f-]{36}$/);
  expect(page.url()).not.toBe(parent);
  expect((await stored(page)).session.parentId).toBe(parent.split("/").at(-1));
  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const personal = await page.context().newPage();
  await personal.goto("/practice");
  await personal
    .getByRole("button", { name: "Từ của bạn", exact: true })
    .click();
  await personal.getByLabel(/Bộ từ cá nhân/).selectOption("difficult");
  await expect(personal.locator(".practice-start")).toContainText(
    "2 mục từ · 2 câu",
  );
  await start(personal);
  expect((await stored(personal)).session.source).toEqual({
    kind: "personal",
    filter: "difficult",
  });
  await personal.close();
});

test("two tabs reject stale writes without discarding the unsaved selection", async ({
  page,
  context,
}) => {
  await page.goto("/practice?entries=hsk30-b1-0001,hsk30-b1-0002");
  await page.getByLabel("Chế độ", { exact: true }).selectOption("exam");
  await start(page);
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.locator(".practice-option")).toHaveCount(4);
  await page.locator(".practice-option").first().click();
  await expect(page.locator(".practice-save-state")).toContainText("Đã lưu");
  await second.locator(".practice-option").nth(1).click();
  await expect(second.locator(".form-error[role=alert]")).toContainText(
    "tab hoặc thiết bị khác",
  );
  await expect(second.locator(".practice-option").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(second.locator(".practice-save-state")).toContainText(
    "Chưa lưu thành công",
  );
  await second.getByRole("button", { name: "Tải trạng thái đã lưu" }).click();
  await expect(second.locator(".practice-option").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await second.close();
});

test("Hỏi lại skips immediately, survives reload and returns at its saved random position", async ({
  page,
}) => {
  await page.goto(
    "/practice?entries=hsk30-b1-0001,hsk30-b1-0002,hsk30-b1-0003",
  );
  await start(page);
  const prompt = await page.locator(".practice-question h2").innerText();
  await page
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect(page.locator(".practice-question h2")).not.toHaveText(prompt);
  await expect(page.locator(".practice-player-meta")).toContainText(
    "0 đã trả lời",
  );
  await expect(
    page.getByText("1 từ chờ hỏi lại", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".practice-feedback")).toHaveCount(0);
  const order = (await stored(page)).session.learningQueue!;
  await page.reload();
  await expect(page.locator(".practice-question h2")).not.toHaveText(prompt);
  for (let position = 0; position < order.length; position++) {
    await expect(page.locator(".practice-question")).toHaveAttribute(
      "aria-label",
      `Câu hỏi ${order[position] + 1}`,
    );
    if (order[position] === 0) {
      await expect(page.locator(".practice-question h2")).toHaveText(prompt);
      await expect(page.locator(".practice-question .eyebrow")).toContainText(
        "ĐANG HỎI LẠI",
      );
    }
    await page.locator(".practice-option").first().click();
    await expect(page.locator(".practice-feedback")).toBeVisible();
    if (position < order.length - 1)
      await page.getByRole("button", { name: "Tiếp", exact: true }).click();
  }
  await expect(page.locator(".practice-player-meta")).toContainText(
    "3 đã trả lời",
  );
  expect((await stored(page)).session.total).toBe(3);
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.locator(".practice-result-word")).toHaveCount(3);
});

test("Quick mode advances correct answers through the deferred queue, pauses wrong answers and finishes", async ({
  page,
}) => {
  await page.goto(
    "/practice?entries=hsk30-b1-0001,hsk30-b1-0002,hsk30-b1-0003,hsk30-b1-0004",
  );
  await page.getByLabel("Quick mode", { exact: true }).check();
  await start(page);
  await expect(page.getByLabel("Quick mode", { exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByLabel("Quick mode", { exact: true })).toBeChecked();
  const choose = async (ordinal: number, correct: boolean) => {
    const q = (await stored(page)).questions.find(
      (q) => q.ordinal === ordinal,
    )!;
    const option = q.options.findIndex((o) =>
      correct ? o.id === q.correctOptionId : o.id !== q.correctOptionId,
    );
    await page.locator(".practice-option").nth(option).click();
  };
  await choose(0, true);
  await expect(page.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 2",
  );
  await expect(page.locator(".practice-feedback")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect(page.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 3",
  );
  await choose(2, false);
  await expect(page.locator(".practice-feedback.is-incorrect")).toBeVisible();
  await expect(page.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 3",
  );
  const upcoming = (await stored(page)).session.learningQueue!;
  await page.getByRole("button", { name: "Tiếp", exact: true }).click();
  for (const ordinal of upcoming) {
    await expect(page.locator(".practice-question")).toHaveAttribute(
      "aria-label",
      `Câu hỏi ${ordinal + 1}`,
    );
    if (ordinal === 1)
      await expect(page.locator(".practice-question .eyebrow")).toContainText(
        "ĐANG HỎI LẠI",
      );
    await choose(ordinal, true);
  }
  await expect(page).toHaveURL(/\/result$/);
  await expect(
    page
      .locator(".practice-result-stats .card")
      .filter({ hasText: "Đúng" })
      .locator("strong"),
  ).toHaveText("3");
  await expect(
    page
      .locator(".practice-result-stats .card")
      .filter({ hasText: "Sai" })
      .locator("strong"),
  ).toHaveText("1");
  await expect(page.locator(".practice-result-word")).toHaveCount(4);
  await page.goto("/practice?entries=hsk30-b1-0001");
  await page.getByLabel("Chế độ", { exact: true }).selectOption("exam");
  await expect(page.getByLabel("Quick mode", { exact: true })).toHaveCount(0);
  await page.getByLabel("Chế độ", { exact: true }).selectOption("learn");
  await page.getByLabel("Quick mode", { exact: true }).uncheck();
  await start(page);
  await choose(0, true);
  await expect(page.locator(".practice-feedback.is-correct")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nộp bài", exact: true }),
  ).toBeEnabled();
  await expect(page).not.toHaveURL(/\/result$/);
});

test("a wrong answer can be reasked at a random future position without changing the first score", async ({
  page,
}) => {
  const ids = Array.from(
    { length: 6 },
    (_, i) => `hsk30-b1-${String(i + 1).padStart(4, "0")}`,
  );
  await page.goto(`/practice?entries=${ids.join(",")}`);
  await start(page);
  const questions = (await stored(page)).questions;
  const choose = async (ordinal: number, correct: boolean) => {
    const q = questions.find((q) => q.ordinal === ordinal)!;
    await page
      .locator(".practice-option")
      .nth(
        q.options.findIndex((o) =>
          correct ? o.id === q.correctOptionId : o.id !== q.correctOptionId,
        ),
      )
      .click();
    await expect(page.locator(".practice-feedback")).toBeVisible();
  };
  await choose(0, false);
  await expect(
    page.getByRole("button", { name: "Hỏi lại lượt sau", exact: true }),
  ).toBeEnabled();
  const prompt = await page.locator(".practice-question h2").innerText();
  await page
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect(page.locator(".practice-question")).toHaveAttribute(
    "aria-label",
    "Câu hỏi 2",
  );
  const queue = (await stored(page)).session.learningQueue!;
  expect(queue.indexOf(0)).toBeGreaterThanOrEqual(1);
  expect(queue.indexOf(0)).toBeLessThanOrEqual(queue.length - 1);
  await page.reload();
  for (const ordinal of queue.slice(0, queue.indexOf(0))) {
    await choose(ordinal, true);
    await page.getByRole("button", { name: "Tiếp", exact: true }).click();
  }
  await expect(page.locator(".practice-question h2")).toHaveText(prompt);
  await expect(page.locator(".practice-feedback")).toHaveCount(0);
  await expect(page.locator(".practice-option").first()).toBeEnabled();
  const before = (await stored(page)).session;
  await choose(0, true);
  const after = (await stored(page)).session;
  expect(after.correctCount).toBe(before.correctCount);
  expect(after.answers[0].optionId).toBe(before.answers[0].optionId);
  expect(after.repeatAnswered).toBe(1);
  expect(after.repeatCorrect).toBe(1);
  await page
    .getByRole("button", { name: "Kết thúc lượt", exact: true })
    .click();
  if (after.learningQueue?.length)
    await page
      .getByRole("button", { name: "Xác nhận nộp", exact: true })
      .click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(
    page.getByText("Hỏi lại trong buổi:", { exact: false }),
  ).toContainText("1 lượt · 1 đúng");
  await expect(
    page
      .locator(".practice-result-stats .card")
      .filter({ hasText: "Sai" })
      .locator("strong"),
  ).toHaveText("1");
});

test("Quick mode advances across the 25-question batch boundary", async ({
  page,
}) => {
  test.setTimeout(60000);
  const ids = Array.from(
    { length: 26 },
    (_, i) => `hsk30-b1-${String(i + 1).padStart(4, "0")}`,
  );
  await page.goto(`/practice?entries=${ids.join(",")}`);
  await page.getByLabel("Quick mode", { exact: true }).check();
  await start(page);
  const questions = (await stored(page)).questions;
  for (let ordinal = 0; ordinal < 26; ordinal++) {
    await expect(page.locator(".practice-question")).toHaveAttribute(
      "aria-label",
      `Câu hỏi ${ordinal + 1}`,
    );
    const q = questions.find((q) => q.ordinal === ordinal)!;
    await page
      .locator(".practice-option")
      .nth(q.options.findIndex((o) => o.id === q.correctOptionId))
      .click();
  }
  await expect(page).toHaveURL(/\/result$/);
  await expect(
    page
      .locator(".practice-result-stats .card")
      .filter({ hasText: "Đúng" })
      .locator("strong"),
  ).toHaveText("26");
});

test("full Band 7–9 downloads all 5,636 fixed questions in batches", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/practice");
  await page.getByRole("button", { name: "Toàn Band", exact: true }).click();
  await page.getByLabel(/Band cần kiểm tra/).selectOption("7-9");
  await page.getByLabel("Ngôn ngữ nghĩa", { exact: true }).selectOption("en");
  await expect(page.getByLabel("Chế độ", { exact: true })).toHaveValue("exam");
  await start(page);
  const snapshot = await stored(page);
  expect(snapshot.session.total).toBe(5636);
  expect(new Set(snapshot.questions.map((q) => q.vocabularyId)).size).toBe(
    5636,
  );
  await page.getByLabel("Đến câu", { exact: true }).fill("5636");
  await page.getByRole("button", { name: "Đến câu", exact: true }).click();
  await expect(page.locator(".practice-player-meta")).toContainText("5.636");
  await expect(page.locator(".practice-option")).toHaveCount(4);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
