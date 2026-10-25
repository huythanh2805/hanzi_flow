import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !secret || !publicKey)
  throw new Error("Missing local Supabase configuration");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, options);
const actor = createClient(url, publicKey, options);
const report = JSON.parse(
  await readFile("data/imported/topic-report.json", "utf8"),
);
const email = `hanziflow-topic-qa-${randomUUID()}@example.invalid`;
const password = `HFtopics!${randomBytes(24).toString("base64url")}9z!`;
let userId: string | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  // Admin-confirmed disposable account; no email is sent and no real account is used.
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { hanziflow_test: true },
  });
  if (created.error || !created.data.user)
    throw new Error("Could not create disposable topic QA account");
  userId = created.data.user.id;
  const signedIn = await actor.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  const summary = await actor.rpc("catalogue_summary");
  assert.ifError(summary.error);
  for (const [topic, value] of Object.entries(report.byTopic) as [
    string,
    { count: number; byBand: Record<string, number> },
  ][]) {
    assert.equal(
      summary.data.topicCounts[topic],
      value.count,
      `Summary count: ${topic}`,
    );
    assert.equal(
      new Set(summary.data.topicEntryIds[topic]).size,
      value.count,
      `Topic identities: ${topic}`,
    );
    const band = await actor.rpc("search_vocabulary", {
      p_topic: topic,
      p_band: "1",
      p_page: 1,
      p_size: 100,
    });
    assert.ifError(band.error);
    assert.equal(
      band.data.total,
      value.byBand["1"],
      `Combined filter: ${topic}`,
    );
    for (const word of band.data.items)
      assert(word.band === "1" && word.topics.includes(topic));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: "http://localhost:3000",
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page
    .locator("form")
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
  await page.goto("/topics");
  await expect(page.locator(".topic-card")).toHaveCount(20);
  for (const [topic, value] of Object.entries(report.byTopic) as [
    string,
    { count: number },
  ][])
    await expect(
      page
        .locator(`.topic-card[href="/topics/${topic}"]`)
        .getByText(`${value.count} mục từ`, { exact: true }),
    ).toBeVisible();
  await page.goto("/topics/technology");
  await page.getByRole("textbox", { name: "Tìm từ vựng" }).fill("手机");
  await expect(
    page.getByRole("link", { name: "手机", exact: true }),
  ).toBeVisible();
  await writeFile(
    "data/imported/topic-cloud-checks.json",
    JSON.stringify(
      {
        topics: 20,
        authenticatedSummaryAndMembershipCounts: true,
        allTopicBand1Filters: true,
        liveLocalhostTopicCards: true,
        liveLocalhostTechnologySearch: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: all twenty authenticated cloud summaries and Band intersections; actual localhost:3000 topic cards and technology search.",
  );
} finally {
  await browser?.close();
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error)
      throw new Error("Disposable topic QA account cleanup failed");
  }
}
