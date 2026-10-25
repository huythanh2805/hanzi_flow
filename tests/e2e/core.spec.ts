import { test, expect } from "@playwright/test";

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
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
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
