import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publicKey || !secret)
  throw new Error(
    "Configure Supabase credentials in .env.local. Values are never printed.",
  );
const baseURL = process.env.HANZIFLOW_CLOUD_TEST_URL || "http://localhost:3001";
if (!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(baseURL))
  throw new Error("Cloud UI tests require an explicitly local app server.");
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const created: string[] = [];
const clients = () =>
  createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const id = "hsk30-b1-0124";
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

async function assertNoBrowserSecret(directory: string) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) await assertNoBrowserSecret(full);
    else if (item.name.endsWith(".js"))
      assert.equal(
        (await readFile(full, "utf8")).includes(secret!),
        false,
        "Administrative credential leaked into a browser asset",
      );
  }
}
try {
  await assertNoBrowserSecret(".next/static");
  const { count, error: countError } = await admin
    .from("vocabulary")
    .select("id", { count: "exact", head: true });
  assert.ifError(countError);
  assert.equal(count, 11092);
  const users: { email: string; password: string; id: string }[] = [];
  for (let n = 0; n < 2; n++) {
    const email = `hanziflow-qa-${randomUUID()}@example.invalid`;
    const password = `HFqa!${randomBytes(24).toString("base64url")}9z!`;
    // Admin creation with confirmation avoids sending any email or altering real accounts.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { hanziflow_test: true },
    });
    assert.ifError(error);
    assert.ok(data.user);
    created.push(data.user.id);
    users.push({ email, password, id: data.user.id });
    const profile = await admin
      .from("profiles")
      .select("user_id,preferences")
      .eq("user_id", data.user.id)
      .single();
    assert.ifError(profile.error);
    assert.equal(profile.data.user_id, data.user.id);
    assert.deepEqual(profile.data.preferences, {});
  }
  console.log(
    "PASS: newly created Auth accounts receive profiles automatically before any login or settings save.",
  );
  const actor = clients();
  const other = clients();
  const device = clients();
  for (const [client, user] of [
    [actor, users[0]],
    [other, users[1]],
    [device, users[0]],
  ] as const) {
    const { error } = await client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    assert.ifError(error);
  }
  const patch = await actor.rpc("patch_vocabulary", {
    p_id: id,
    p_patch: { state: "LEARNING", favorite: true },
  });
  assert.ifError(patch.error);
  const firstStudy = patch.data.studied_at;
  const shared = await device
    .from("user_vocabulary")
    .select("state,favorite")
    .eq("vocabulary_id", id)
    .single();
  assert.ifError(shared.error);
  assert.equal(shared.data.state, "LEARNING");
  assert.equal(shared.data.favorite, true);
  const isolated = await other.from("user_vocabulary").select("vocabulary_id");
  assert.ifError(isolated.error);
  assert.equal(isolated.data.length, 0);
  const forged = await other.rpc("patch_vocabulary", {
    p_id: id,
    p_patch: { user_id: users[0].id, favorite: false },
  });
  assert.ok(forged.error);
  const direct = await other
    .from("user_vocabulary")
    .update({ state: "MASTERED" })
    .eq("user_id", users[0].id);
  assert.ok(direct.error);
  const anonymous = clients();
  const denied = await anonymous
    .from("user_vocabulary")
    .select("vocabulary_id");
  assert.ok(denied.error);
  for (const filter of [
    { p_band: "1", p_topic: "work-career", p_state: "LEARNING" },
    { p_query: "gong zuo", p_topic: "work-career" },
  ]) {
    const result = await actor.rpc("search_vocabulary", filter);
    assert.ifError(result.error);
    assert.equal(result.data.total, 1);
    assert.equal(result.data.items[0].id, id);
  }
  console.log(
    "PASS: live Supabase Auth, separate sessions, cross-user RLS, mutation permissions and shared Band/topic progress.",
  );
  const rerun = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--env-file-if-exists=.env.local",
      "scripts/import-data.ts",
    ],
    { encoding: "utf8", timeout: 120000 },
  );
  if (rerun.status !== 0)
    throw new Error("Repeat import failed; inspect import output locally.");
  const retained = await device
    .from("user_vocabulary")
    .select("state,favorite,studied_at")
    .eq("vocabulary_id", id)
    .single();
  assert.ifError(retained.error);
  assert.equal(retained.data.studied_at, firstStudy);
  assert.equal(retained.data.favorite, true);
  console.log(
    "PASS: real Supabase repeat import preserves account progress and original study timestamp.",
  );
  browser = await chromium.launch();
  const first = await browser.newContext({ baseURL });
  const second = await browser.newContext({ baseURL });
  const page = await first.newPage();
  const page2 = await second.newPage();
  for (const current of [page, page2]) {
    await current.goto("/dashboard");
    await expect(current).toHaveURL(/\/login$/);
    await current.getByLabel("Email", { exact: true }).fill(users[0].email);
    await current
      .getByLabel("Mật khẩu", { exact: true })
      .fill(users[0].password);
    await current
      .locator("form")
      .getByRole("button", { name: "Đăng nhập", exact: true })
      .click();
    await expect(current).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  }
  await page.goto("/topics/daily-conversation");
  await page.getByRole("link", { name: "谢谢", exact: true }).click();
  await page
    .getByRole("button", { name: "Đánh dấu đã học", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Đã đánh dấu học" }),
  ).toBeDisabled();
  await page2.goto("/bands/1");
  await page2.getByRole("textbox", { name: "Tìm từ vựng" }).fill("xiexie");
  await expect(
    page2.locator("tbody").getByText("Đang học", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page.goto("/settings");
  await page.getByLabel("Số từ trong mỗi nhóm học").selectOption("10");
  await page.getByRole("button", { name: "Lưu cài đặt" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu cài đặt");
  await page2.goto("/settings");
  await expect(page2.getByLabel("Số từ trong mỗi nhóm học")).toHaveValue("10");
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  console.log(
    "PASS: production browser login/logout, protected routes, Server Actions and persistence across two independent browser contexts.",
  );
  console.log(
    "PASS: server administrative credential absent from built browser JavaScript.",
  );
} finally {
  await browser?.close();
  for (const userId of created) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error)
      throw new Error(
        "Could not remove an ephemeral QA account; inspect the QA account in Supabase.",
      );
  }
  if (created.length)
    console.log(
      `Cleaned up ${created.length} ephemeral QA accounts and their test progress. No email was sent.`,
    );
}
