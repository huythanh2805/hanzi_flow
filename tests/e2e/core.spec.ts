import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("search, combined filters, enriched bilingual content and pagination", async ({
  page,
}) => {
  await page.goto("/vocabulary");
  await expect(
    page.getByRole("heading", { name: "Thư viện từ vựng" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(30);
  await page.getByRole("button", { name: "Trang sau" }).click();
  await expect(page.getByText("Trang 2 / 370", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: "Tìm từ vựng" }).fill("gongzuo");
  await expect(
    page.getByRole("link", { name: "工作", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Lọc chủ đề" })
    .selectOption("work-career");
  await page.getByRole("combobox", { name: "Lọc HSK Band" }).selectOption("1");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.locator("tbody").getByText("công việc, làm việc", { exact: false }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Lọc HSK Band" }).selectOption("2");
  await expect(
    page.getByRole("heading", { name: "Chưa có từ vựng phù hợp" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bỏ bộ lọc" }).click();
  await page.getByRole("link", { name: "爱", exact: true }).click();
  await expect(
    page.getByText("to love; to be fond of; to like", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Ví dụ" }).click();
  await expect(
    page.getByText("Từ vựng trong câu: Band ≤ 1").first(),
  ).toBeVisible();
  await expect(page.getByText(/^VI:/).first()).toBeVisible();
  await expect(page.getByText(/^EN:/).first()).toBeVisible();
});

test("studying through a topic persists the same entry through its Band", async ({
  page,
}) => {
  await page.goto("/topics/work-career");
  await page.getByRole("textbox", { name: "Tìm từ vựng" }).fill("工作");
  await page.getByRole("link", { name: "工作", exact: true }).click();
  await page
    .getByRole("button", { name: "Đánh dấu đã học", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Đã đánh dấu học" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Lưu từ vựng", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Đã lưu từ vựng" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/bands/1");
  await page.getByRole("textbox", { name: "Tìm từ vựng" }).fill("工作");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.locator("tbody").getByText("Đang học", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bỏ lưu 工作", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("textbox", { name: "Tìm từ vựng" }).fill("工作");
  await expect(
    page.locator("tbody").getByText("Đang học", { exact: true }),
  ).toBeVisible();
  await page.goto("/topics/work-career");
  await expect(
    page
      .locator(".collection-stats .card")
      .filter({ hasText: "Đã học" })
      .locator("strong"),
  ).toHaveText("1");
});

test("flashcard reveal, keyboard learning and summary persist real progress", async ({
  page,
}) => {
  await page.goto("/flashcards?entry=hsk30-b1-0124");
  await expect(
    page.getByRole("heading", { name: "工作", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("gōngzuò", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Lưu thẻ", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Space");
  await expect(page.getByText("gōngzuò", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Đã học · Tiếp tục" }).click();
  await expect(
    page.getByRole("heading", { name: "Bạn đã hoàn thành buổi học." }),
  ).toBeVisible();
  await page.goto("/vocabulary/hsk30-b1-0124");
  await expect(page.getByText("Đang học", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tạm dừng từ này" }).click();
  await page.goto("/flashcards?entry=hsk30-b1-0124");
  await expect(
    page.getByRole("heading", { name: "Chưa có thẻ phù hợp" }),
  ).toBeVisible();
});

test("settings, dark theme and group size survive reload", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Số từ trong mỗi nhóm học").selectOption("10");
  await page.getByRole("button", { name: "Tối", exact: true }).click();
  await page.getByRole("button", { name: "Lưu cài đặt" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Số từ trong mỗi nhóm học")).toHaveValue("10");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/bands/1");
  await page.getByRole("tab", { name: "Nhóm học" }).click();
  await expect(page.getByText("10 từ · 0 đã học", { exact: true })).toHaveCount(
    12,
  );
  await expect(page.getByText("1 / 5", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Nhóm từ 2 .*10 từ/ }).click();
  await expect(
    page.getByRole("heading", { name: "半年", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".study-meta > span")).toHaveText("1 / 10");
});

test("mobile navigation and key screens stay within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Chào bạn, cùng học nhé." }),
  ).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page.getByRole("link", { name: "Chủ đề", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Điều gì khiến bạn tò mò?" }),
  ).toBeVisible();
  for (const route of [
    "/",
    "/dashboard",
    "/vocabulary",
    "/settings",
    "/flashcards?entry=hsk30-b1-0124",
    "/login",
  ]) {
    await page.goto(route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("read-only catalogue endpoint rejects malformed filters", async ({
  request,
}) => {
  const response = await request.post("/api/vocabulary/search", {
    data: { filters: { band: "9", pageSize: 10000 } },
  });
  expect(response.status()).toBe(400);
});

test("all twenty topics have content and technology supports search and lessons", async ({
  page,
}) => {
  await page.goto("/topics");
  await expect(page.locator(".topic-card")).toHaveCount(20);
  await expect(
    page.getByText("Đang bổ sung nội dung", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Có từ vựng đã phân loại").check();
  await expect(page.locator(".topic-card")).toHaveCount(20);
  await page.goto("/topics/technology");
  await page.getByRole("textbox", { name: "Tìm từ vựng" }).fill("手机");
  await expect(
    page.getByRole("link", { name: "手机", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "手机", exact: true }).click();
  await expect(
    page
      .locator(".detail-badges")
      .getByRole("link", { name: "Công nghệ & lập trình" }),
  ).toBeVisible();
  await page.goto("/topics/technology");
  await page.getByRole("tab", { name: "Nhóm học" }).click();
  await page.locator(".lesson-card").first().click();
  await expect(page.locator(".study-meta > span")).toHaveText(/^1 \/ \d+$/);
});

test("study redesign keeps dark surfaces neutral, text legible and card controls independent", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/flashcards?entry=hsk30-b1-0124");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const visual = await page.evaluate(() => {
    const rgb = (text: string) =>
      text
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
    const luminance = (values: number[]) =>
      values
        .map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const body = getComputedStyle(document.body);
    const card = getComputedStyle(document.querySelector(".flashcard")!);
    const prompt = getComputedStyle(
      document.querySelector(".flashcard-prompt")!,
    );
    const cta = getComputedStyle(document.querySelector(".reveal-button")!);
    const bg = rgb(body.backgroundColor);
    const cardBg = luminance(rgb(card.backgroundColor));
    return {
      bodySize: parseFloat(body.fontSize),
      promptSize: parseFloat(prompt.fontSize),
      brightness: luminance(bg),
      neutrality: Math.max(...bg) - Math.min(...bg),
      contrast: (luminance(rgb(prompt.color)) + 0.05) / (cardBg + 0.05),
      ctaHeight: parseFloat(cta.minHeight),
      animation: card.animationName,
    };
  });
  expect(visual.bodySize).toBeGreaterThanOrEqual(16);
  expect(visual.promptSize).toBeGreaterThanOrEqual(14);
  expect(visual.brightness).toBeLessThan(0.02);
  expect(visual.neutrality).toBeLessThan(12);
  expect(visual.contrast).toBeGreaterThanOrEqual(4.5);
  expect(visual.ctaHeight).toBeGreaterThanOrEqual(50);
  expect(visual.animation).toBe("none");
  await page.keyboard.press("Control+Space");
  await expect(page.getByText("gōngzuò", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Lật thẻ xem đáp án", exact: true })
    .click();
  await expect(page.getByText("gōngzuò", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Phát âm 工作", exact: true }).click();
  await expect(page.getByText("gōngzuò", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lưu thẻ", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Bỏ lưu thẻ", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Quay lại mặt trước của thẻ", exact: true })
    .click({ position: { x: 20, y: 20 } });
  await expect(page.getByText("gōngzuò", { exact: true })).toHaveCount(0);
});

test("study card fits narrow screens, long Hanzi and expanded Vietnamese answers", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const source = (await readFile("data/source/all.jsonl", "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const long = source.find((v) => [...v.word].length >= 4)!;
  await page.goto(`/flashcards?entry=${long.id}`);
  await expect(page.locator(".flashcard-hanzi")).toHaveText(long.word);
  for (const width of [320, 390, 767, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const sizes = await page.evaluate(() => {
      const card = document
        .querySelector(".flashcard")!
        .getBoundingClientRect();
      const word = document
        .querySelector(".flashcard-hanzi")!
        .getBoundingClientRect();
      return {
        card: card.toJSON(),
        word: word.toJSON(),
        arrows: [...document.querySelectorAll(".card-arrow")].map(
          (b) => b.getBoundingClientRect().width,
        ),
      };
    });
    expect(sizes.word.left).toBeGreaterThanOrEqual(sizes.card.left);
    expect(sizes.word.right).toBeLessThanOrEqual(sizes.card.right);
    expect(sizes.word.bottom).toBeLessThan(sizes.card.bottom);
    expect(sizes.arrows.every((w) => w >= 44)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/flashcards?entry=hsk30-b1-0124");
  await page.getByRole("button", { name: "Tùy chỉnh buổi học" }).click();
  await page.getByRole("combobox", { name: /Chế độ/ }).selectOption("vi");
  await page.getByRole("button", { name: "Tùy chỉnh buổi học" }).click();
  await page.getByRole("button", { name: /^Xem đáp án/ }).click();
  await expect(page.locator(".flashcard-answer .answer-text")).toContainText(
    "công việc",
  );
  const bounds = await page.evaluate(() => ({
    answer: document.querySelector(".flashcard-answer")!.getBoundingClientRect()
      .bottom,
    footer: document.querySelector(".flashcard-bottom")!.getBoundingClientRect()
      .top,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  expect(bounds.answer).toBeLessThanOrEqual(bounds.footer);
  expect(bounds.overflow).toBe(false);
});
