import { test, expect, type Page } from "@playwright/test";
import type {
  PrivatePracticeQuestion,
  PrivatePracticeSession,
} from "../../src/lib/domain/practice";
async function snapshot(page: Page) {
  const id = page.url().split("/").at(-1)!;
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("hanziflow.practice.v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const store = db.transaction("records").objectStore("records");
    const read = <T>(r: IDBRequest<T>) =>
      new Promise<T>((resolve) => {
        r.onsuccess = () => resolve(r.result);
      });
    const session = await read<PrivatePracticeSession>(
      store.get(`session:${id}`),
    );
    const questions = await read<PrivatePracticeQuestion[]>(
      store.getAll(IDBKeyRange.bound(`question:${id}:`, `question:${id}:~`)),
    );
    db.close();
    return { session, questions };
  }, id);
}
async function setup(
  page: Page,
  n: number,
  type: "matching" | "listening_choice",
) {
  const ids = Array.from(
    { length: n },
    (_, i) => `hsk30-b1-${String(i + 1).padStart(4, "0")}`,
  );
  await page.goto(`/practice?entries=${ids.join(",")}`);
  await page.getByLabel("Chữ ↔ nghĩa", { exact: true }).uncheck();
  await page
    .getByLabel(type === "matching" ? "Nghe chọn chữ" : "Ghép cặp", {
      exact: true,
    })
    .uncheck();
  await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/[\da-f-]{36}$/, { timeout: 90000 });
}
test("matching retries keep first score, reload and defer one pair to MCQ", async ({
  page,
}) => {
  await setup(page, 8, "matching");
  await expect(
    page.getByRole("heading", { name: "Ghép chữ với nghĩa" }),
  ).toBeVisible();
  const initial = await snapshot(page),
    ordinal = initial.session.cursor;
  const q = initial.questions.find((q) => q.ordinal === ordinal)!;
  const wrong = q.options.find((o) => o.id !== q.correctOptionId)!;
  await page
    .getByRole("group", { name: "Nghĩa cần ghép" })
    .getByRole("button", { name: wrong.label, exact: true })
    .click();
  await expect(page.locator(".practice-matching .content-note")).toContainText(
    "Chưa khớp",
  );
  await page.reload();
  await expect(page.locator(".practice-matching .content-note")).toContainText(
    "Chưa khớp",
  );
  await page
    .getByRole("group", { name: "Nghĩa cần ghép" })
    .getByRole("button", {
      name: q.options.find((o) => o.id === q.correctOptionId)!.label,
      exact: true,
    })
    .click();
  await expect(page.locator(".practice-player-meta")).toContainText(
    "1 đã trả lời · 0 đúng",
  );
  await expect
    .poll(async () => (await snapshot(page)).session.repeatCorrect)
    .toBe(1);
  await page
    .getByRole("button", { name: "Hỏi lại lượt sau", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        Object.values((await snapshot(page)).session.answers).filter(
          (a) => a.boardRemoved,
        ).length,
    )
    .toBe(1);
  const frozen = await snapshot(page),
    removed = frozen.questions.find(
      (q) => frozen.session.answers[q.ordinal]?.boardRemoved,
    )!;
  await page
    .getByLabel("Đến câu", { exact: true })
    .fill(String(removed.ordinal + 1));
  await page.getByRole("button", { name: "Đến câu", exact: true }).click();
  await expect(page.locator(".practice-options .practice-option")).toHaveCount(
    4,
  );
  const before = frozen.session.correctCount;
  await page
    .locator(".practice-option")
    .filter({
      hasText: removed.choiceSnapshot!.options.find(
        (o) => o.id === removed.choiceSnapshot!.correctOptionId,
      )!.label,
    })
    .click();
  await expect
    .poll(async () => (await snapshot(page)).session.correctCount)
    .toBe(before + 1);
});
test("listening hides the prompt and requires playback before answering", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      },
      configurable: true,
    });
    const synth = Object.assign(new EventTarget(), {
      getVoices: () => [
        {
          lang: "zh-CN",
          name: "QA Mandarin",
          voiceURI: "qa",
          localService: true,
          default: true,
        },
      ],
      cancel: () => {},
      speak: (utterance: SpeechSynthesisUtterance) =>
        setTimeout(() => {
          utterance.onstart?.({} as SpeechSynthesisEvent);
          utterance.onend?.({} as SpeechSynthesisEvent);
        }, 10),
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: synth,
      configurable: true,
    });
  });
  await setup(page, 4, "listening_choice");
  await expect(
    page.getByRole("heading", { name: "Nghe và chọn chữ Hán" }),
  ).toBeVisible();
  await expect(
    page.locator(".practice-options .practice-option").first(),
  ).toBeDisabled();
  const frozen = await snapshot(page),
    q = frozen.questions.find((q) => q.ordinal === frozen.session.cursor)!;
  await expect(page.locator(".practice-listening-prompt")).not.toContainText(
    q.feedback.word,
  );
  await expect(
    page.getByRole("button", { name: "Phát âm câu hỏi", exact: true }),
  ).not.toHaveAttribute("aria-label", new RegExp(q.feedback.word));
  await page
    .getByRole("button", { name: "Phát âm câu hỏi", exact: true })
    .click();
  await expect(
    page.locator(".practice-options .practice-option").first(),
  ).toBeEnabled();
  await page.getByLabel("Quick mode", { exact: true }).check();
  await page
    .locator(".practice-options .practice-option")
    .nth(q.options.findIndex((o) => o.id === q.correctOptionId))
    .click();
  await expect
    .poll(async () => (await snapshot(page)).session.correctCount)
    .toBe(1);
  await expect(page.locator(".practice-player-meta")).toContainText(
    "1 đã trả lời · 1 đúng",
  );
});
test("missing Mandarin voice gives an actionable choice before starting", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      value: Object.assign(new EventTarget(), {
        getVoices: () => [{ lang: "zh-HK", name: "Cantonese" }],
        cancel: () => {},
      }),
      configurable: true,
    });
  });
  await page.goto("/practice?band=1&group=1");
  await expect(page.locator(".practice-exercise-types")).toContainText(
    "Thiết bị chưa có giọng Mandarin",
    { timeout: 10000 },
  );
  await expect(
    page.getByRole("button", { name: "Bắt đầu", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Nghe chọn chữ", { exact: true }).uncheck();
  await expect(
    page.getByRole("button", { name: "Bắt đầu", exact: true }),
  ).toBeEnabled();
});
test("matching Quick mode completes the board with keyboard answers on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 4, "matching");
  await page.getByLabel("Quick mode", { exact: true }).check();
  for (let i = 0; i < 4; i++) {
    const state = await snapshot(page),
      q = state.questions.find((q) => q.ordinal === state.session.cursor)!;
    const answer = page
      .getByRole("group", { name: "Nghĩa cần ghép" })
      .getByRole("button", {
        name: q.options.find((o) => o.id === q.correctOptionId)!.label,
        exact: true,
      });
    await expect(answer).toBeEnabled();
    await expect(
      page
        .getByRole("group", { name: "Chữ Hán cần ghép" })
        .getByRole("button", { pressed: true }),
    ).toContainText(q.prompt);
    await answer.focus();
    await answer.press("Enter");
    if (i < 3)
      await expect
        .poll(
          async () =>
            Object.values((await snapshot(page)).session.answers).filter(
              (a) => a.matchingResolved,
            ).length,
        )
        .toBe(i + 1);
  }
  await expect(page).toHaveURL(/\/result$/);
  await expect(
    page
      .locator(".practice-result-stats .card")
      .filter({ hasText: "Đúng" })
      .locator("strong"),
  ).toHaveText("4");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("a board spanning the 25-question batch boundary stays complete", async ({
  page,
}) => {
  await setup(page, 32, "matching");
  const state = await snapshot(page);
  const cross = state.questions.find(
    (q) => q.ordinal >= 25 && q.boardOrdinals!.some((n) => n < 25),
  )!;
  expect(cross).toBeTruthy();
  await page
    .getByLabel("Đến câu", { exact: true })
    .fill(String(cross.ordinal + 1));
  await page.getByRole("button", { name: "Đến câu", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Chữ Hán cần ghép" }).getByRole("button"),
  ).toHaveCount(cross.boardOrdinals!.length);
  await expect(
    page.getByRole("group", { name: "Nghĩa cần ghép" }).getByRole("button"),
  ).toHaveCount(cross.boardOrdinals!.length);
});
