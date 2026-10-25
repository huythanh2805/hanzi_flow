import { test, expect, type Page } from "@playwright/test";
async function addToDeck(page: Page, names: string[]) {
  const dialog = page.getByRole("dialog", {
    name: "Thêm từ vào bộ",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  for (const name of names) {
    await dialog
      .getByRole("button", { name: "Tạo bộ mới", exact: true })
      .click();
    await dialog.getByLabel("Tên bộ mới", { exact: true }).fill(name);
    await dialog.getByRole("button", { name: "Tạo bộ", exact: true }).click();
    await expect(dialog.getByLabel(name, { exact: false })).toBeChecked();
  }
  await dialog
    .getByRole("button", { name: "Lưu vào bộ đã chọn", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(dialog).not.toBeVisible();
}
async function storedPractice(page: Page) {
  const id = page.url().split("/").at(-1)!;
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("hanziflow.practice.v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction("records"),
      r = tx
        .objectStore("records")
        .getAll(IDBKeyRange.bound(`question:${id}:`, `question:${id}:~`));
    const questions = await new Promise<{ vocabularyId: string }[]>(
      (resolve) => {
        r.onsuccess = () => resolve(r.result);
      },
    );
    db.close();
    return questions.map((q) => q.vocabularyId).sort();
  }, id);
}
test("library adds to multiple private decks, unions smart sources and hands frozen Flashcards to practice", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/vocabulary");
  for (const label of [
    "Chọn 爱 (hsk30-b1-0001)",
    "Chọn 爱好 (hsk30-b1-0002)",
    "Chọn 八 (hsk30-b1-0003)",
  ])
    await page.getByLabel(label, { exact: true }).check();
  await page.getByRole("button", { name: "Lưu 爱", exact: true }).click();
  await page.getByRole("button", { name: "Thêm vào bộ", exact: true }).click();
  await addToDeck(page, ["Du lịch", "Công việc"]);
  await page.getByLabel("Chọn tất cả từ trên trang", { exact: true }).uncheck();
  await page.getByLabel("Chọn 爸爸 (hsk30-b1-0004)", { exact: true }).check();
  await page.getByRole("button", { name: "Thêm vào bộ", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Thêm từ vào bộ",
    exact: true,
  });
  await dialog.getByLabel("Công việc", { exact: false }).check();
  await dialog
    .getByRole("button", { name: "Lưu vào bộ đã chọn", exact: true })
    .click();
  await page.goto("/decks");
  await expect(
    page.getByRole("heading", { name: "Bộ từ của tôi", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".deck-card").filter({ hasText: "Du lịch" }),
  ).toContainText("3 mục từ");
  await expect(
    page.locator(".deck-card").filter({ hasText: "Công việc" }),
  ).toContainText("4 mục từ");
  for (const name of ["Du lịch", "Công việc", "Từ đã lưu"])
    await page.getByLabel(`Chọn bộ ${name}`, { exact: true }).check();
  await expect(
    page.getByRole("complementary", { name: "Các bộ đã chọn" }),
  ).toContainText("4 mục từ duy nhất");
  await page
    .getByRole("button", { name: "Flashcards / Luyện tập", exact: false })
    .click();
  await page
    .getByRole("dialog", { name: "Học từ các bộ đã chọn" })
    .getByRole("button", { name: "Flashcards", exact: true })
    .click();
  await expect(page).toHaveURL(/\/flashcards\?decks=/);
  expect(page.url().length).toBeLessThan(1000);
  await expect(page.locator(".flashcard-hanzi")).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: /Xem đáp án/ }).click();
    await page
      .getByRole("button", { name: "Đã học · Tiếp tục", exact: true })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Bạn đã hoàn thành buổi học." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Luyện nhóm vừa học", exact: false })
    .click();
  await expect(page).toHaveURL(/\/practice\?selection=/);
  expect(page.url()).not.toContain("hsk30-");
  for (const label of ["Nghe chọn chữ", "Ghép cặp"])
    await page.getByLabel(label, { exact: true }).uncheck();
  await expect(page.locator(".practice-start")).toContainText(
    "4 mục từ · 4 câu",
  );
  await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/[\da-f-]{36}$/);
  expect(await storedPractice(page)).toEqual(
    [1, 2, 3, 4].map((n) => `hsk30-b1-${String(n).padStart(4, "0")}`),
  );
});
test("union groups persist across pages and membership changes clear unstarted selections", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await page.goto("/bands/1");
  await page
    .getByRole("button", { name: "Thêm bộ từ này vào bộ riêng", exact: true })
    .click();
  await addToDeck(page, ["Gộp Band"]);
  await page.goto("/bands/2");
  await page
    .getByRole("button", { name: "Thêm bộ từ này vào bộ riêng", exact: true })
    .click();
  const add = page.getByRole("dialog", { name: "Thêm từ vào bộ", exact: true });
  await add.getByLabel("Gộp Band", { exact: false }).check();
  await add.getByRole("button", { name: "Lưu vào bộ đã chọn" }).click();
  await expect(add).not.toBeVisible();
  await page.goto("/decks");
  await page.getByLabel("Chọn bộ Gộp Band", { exact: true }).check();
  await expect(page.locator(".deck-selection-bar")).toContainText(
    "1.272 mục từ duy nhất",
  );
  await page
    .getByRole("button", { name: "Flashcards / Luyện tập", exact: false })
    .click();
  const study = page.getByRole("dialog", { name: "Học từ các bộ đã chọn" });
  await study.getByRole("button", { name: "Chọn nhóm", exact: true }).click();
  await study.getByLabel("Chọn nhóm 1", { exact: true }).check();
  await study.getByRole("button", { name: "Sau", exact: true }).click();
  await study.getByLabel("Chọn nhóm 13", { exact: true }).check();
  await expect(study).toContainText("Đang chọn 40 mục từ");
  const second = await context.newPage();
  await second.goto("/settings");
  await second.getByLabel("Số từ trong mỗi nhóm học").selectOption("10");
  await second.getByRole("button", { name: "Lưu cài đặt" }).click();
  await expect(study).toContainText("Đang chọn 0 mục từ");
  await second.getByLabel("Số từ trong mỗi nhóm học").selectOption("20");
  await second.getByRole("button", { name: "Lưu cài đặt" }).click();
  await expect(study).toContainText("Mỗi nhóm 20 từ");
  await expect(study).toContainText("Đang chọn 0 mục từ");
  await study.getByLabel("Chọn nhóm 13", { exact: true }).check();
  await study.getByRole("button", { name: "Trước", exact: true }).click();
  await study.getByLabel("Chọn nhóm 1", { exact: true }).check();
  await study.getByRole("button", { name: "Sau", exact: true }).click();
  await second.goto("/vocabulary/hsk30-b3-0001");
  await second
    .getByRole("button", { name: "Thêm vào bộ", exact: true })
    .click();
  const otherAdd = second.getByRole("dialog", {
    name: "Thêm từ vào bộ",
    exact: true,
  });
  await otherAdd.getByLabel("Gộp Band", { exact: false }).check();
  await otherAdd.getByRole("button", { name: "Lưu vào bộ đã chọn" }).click();
  await expect(study).toContainText("Đang chọn 0 mục từ");
  await expect(
    study.getByLabel("Chọn nhóm 13", { exact: true }),
  ).not.toBeChecked();
  await study.getByLabel("Chọn nhóm 13", { exact: true }).check();
  await study.getByRole("button", { name: "Trước", exact: true }).click();
  await study.getByLabel("Chọn nhóm 1", { exact: true }).check();
  await study.getByRole("button", { name: "Luyện tập", exact: true }).click();
  for (const label of ["Nghe chọn chữ", "Ghép cặp"])
    await page.getByLabel(label, { exact: true }).uncheck();
  await expect(page.locator(".practice-start")).toContainText(
    "40 mục từ · 40 câu",
  );
  await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await expect(page).toHaveURL(/\/practice\/[\da-f-]{36}$/);
  const expected = [
    ...Array.from({ length: 20 }, (_, i) => i + 1),
    ...Array.from({ length: 20 }, (_, i) => i + 241),
  ].map((n) => `hsk30-b1-${String(n).padStart(4, "0")}`);
  expect(await storedPractice(page)).toEqual(expected.sort());
  const activeURL = page.url();
  await second.goto("/decks");
  await second
    .getByRole("button", { name: "Xóa bộ Gộp Band", exact: true })
    .click();
  await second
    .getByRole("dialog", { name: "Xóa bộ từ" })
    .getByRole("button", { name: "Xóa bộ", exact: true })
    .click();
  await expect(
    second.getByRole("dialog", { name: "Xóa bộ từ" }),
  ).not.toBeVisible();
  await page.goto(activeURL);
  await expect(page.locator(".practice-options .practice-option")).toHaveCount(
    4,
  );
  expect(await storedPractice(page)).toEqual(expected.sort());
});
test("detail picker, search, metadata edits and removals retain global word flags", async ({
  page,
}) => {
  await page.goto("/vocabulary/hsk30-b1-0001");
  await page.getByRole("button", { name: "Lưu từ vựng", exact: true }).click();
  await page.goto("/decks");
  await page
    .getByRole("button", { name: "Tạo bộ mới", exact: true })
    .first()
    .click();
  const create = page.getByRole("dialog", { name: "Tạo bộ từ mới" });
  await create.getByLabel("Tên bộ từ", { exact: true }).fill("Bộ thử chi tiết");
  await create.getByRole("button", { name: "Tạo bộ", exact: true }).click();
  await expect(create).not.toBeVisible();
  await page
    .locator(".deck-card-link")
    .filter({ hasText: "Bộ thử chi tiết" })
    .click();
  await page.getByRole("button", { name: "Thêm từ", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Chọn từ trong thư viện" });
  await picker.getByLabel("Chọn 爱 (hsk30-b1-0001)", { exact: true }).check();
  await picker.getByLabel("Chọn 爱好 (hsk30-b1-0002)", { exact: true }).check();
  await picker
    .getByRole("button", { name: "Thêm các từ đã chọn", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  await expect(page.locator(".deck-word-row")).toHaveCount(2);
  await page.getByLabel("Tìm từ trong bộ", { exact: true }).fill("àihào");
  await expect(page.locator(".deck-word-row")).toHaveCount(1);
  await expect(page.locator(".deck-word-row")).toContainText("爱好");
  await page.getByLabel("Tìm từ trong bộ", { exact: true }).fill("");
  await expect(page.locator(".deck-word-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Sửa bộ", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Chỉnh sửa bộ từ" });
  await edit.getByLabel("Tên bộ từ", { exact: true }).fill("Bộ đã đổi tên");
  await edit.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bộ đã đổi tên", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Chọn 爱 (hsk30-b1-0001)", { exact: true }).check();
  await page
    .getByRole("button", { name: "Bỏ 1 từ khỏi bộ", exact: true })
    .click();
  await expect(page.locator(".deck-word-row")).toHaveCount(1);
  await page.goto("/decks/saved");
  await expect(page.locator(".deck-word-row")).toHaveCount(1);
  await expect(page.locator(".deck-word-row")).toContainText("爱");
});
test("failed creation retains the form, retry creates once, and dialogs restore focus", async ({
  page,
}) => {
  await page.goto("/decks");
  await page
    .getByRole("button", { name: "Tạo bộ mới", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Tạo bộ từ mới" });
  await dialog
    .getByLabel("Tên bộ từ", { exact: true })
    .fill("Giữ khi mất mạng");
  await page.route("**/decks", (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await dialog.getByRole("button", { name: "Tạo bộ", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Tên bộ từ", { exact: true })).toHaveValue(
    "Giữ khi mất mạng",
  );
  await page.unroute("**/decks");
  await dialog.getByRole("button", { name: "Tạo bộ", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.locator(".deck-card").filter({ hasText: "Giữ khi mất mạng" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Tạo bộ mới", exact: true })
    .first()
    .click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tạo bộ mới", exact: true }).first(),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/decks");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
