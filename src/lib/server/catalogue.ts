import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import { selectVocabulary } from "@/lib/domain/catalogue";
import { preferencesSchema } from "@/lib/domain/validation";
import {
  defaultPreferences,
  type Bootstrap,
  type Filters,
  type PageResult,
  type ProgressMap,
  type Topic,
  type Vocabulary,
} from "@/lib/domain/types";
import topicData from "../../../data/topics.json";

let cataloguePromise: Promise<Vocabulary[]> | undefined;
export function trialCatalogue() {
  return (cataloguePromise ??= readFile(
    path.join(process.cwd(), "data/catalogue.json"),
    "utf8",
  ).then((content) => JSON.parse(content) as Vocabulary[]));
}
export const authenticatedUser = cache(async () => {
  if (!supabaseConfigured()) return null;
  const db = await createSupabaseServer();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});
export const getBootstrap = cache(async (): Promise<Bootstrap> => {
  if (!supabaseConfigured()) {
    const rows = await trialCatalogue();
    const counts: Record<string, number> = {};
    const topicCounts: Record<string, number> = {};
    const topicEntryIds: Record<string, string[]> = {};
    rows.forEach((v) => {
      counts[v.band] = (counts[v.band] ?? 0) + 1;
      v.topics.forEach((t) => {
        topicCounts[t] = (topicCounts[t] ?? 0) + 1;
        (topicEntryIds[t] ??= []).push(v.id);
      });
    });
    return {
      mode: "trial",
      user: null,
      progress: {},
      preferences: defaultPreferences,
      topics: topicData,
      counts,
      topicCounts,
      topicEntryIds,
      total: rows.length,
      uniqueSpellings: new Set(rows.map((v) => v.word)).size,
      featured: rows.filter((v) => v.id === "hsk30-b1-0124"),
    };
  }
  const user = await authenticatedUser();
  if (!user) redirect("/login");
  const db = await createSupabaseServer();
  const [summary, topics, profile, featured] = await Promise.all([
    db.rpc("catalogue_summary"),
    db.from("topics").select("*"),
    db
      .from("profiles")
      .select("preferences, display_name")
      .eq("user_id", user.id)
      .single(),
    db.from("catalogue_entries").select("*").eq("id", "hsk30-b1-0124"),
  ]);
  for (const result of [summary, topics, profile, featured])
    if (result.error)
      throw new Error(
        `Không thể tải dữ liệu Supabase: ${result.error.message}`,
      );
  const progress: ProgressMap = {};
  // PostgREST defaults to 1,000 rows: explicitly page to preserve every personal record.
  for (let start = 0; ; start += 1000) {
    const result = await db
      .from("user_vocabulary")
      .select(
        "vocabulary_id,state,favorite,difficult,suspended,studied_at,updated_at",
      )
      .eq("user_id", user.id)
      .order("vocabulary_id")
      .range(start, start + 999);
    if (result.error) throw new Error(result.error.message);
    for (const p of result.data) progress[p.vocabulary_id] = p;
    if (result.data.length < 1000) break;
  }
  const prefs = preferencesSchema.safeParse({
    ...defaultPreferences,
    ...profile.data?.preferences,
  });
  return {
    mode: "cloud",
    user: {
      id: user.id,
      email: user.email ?? "",
      name: profile.data?.display_name || user.email?.split("@")[0] || "Bạn",
    },
    progress,
    preferences: prefs.success ? prefs.data : defaultPreferences,
    topics: topics.data as Topic[],
    ...summary.data,
    featured: featured.data as Vocabulary[],
  };
});
export async function searchCatalogue(
  filters: Filters,
  trialProgress: ProgressMap = {},
): Promise<PageResult> {
  if (!supabaseConfigured())
    return selectVocabulary(await trialCatalogue(), filters, trialProgress);
  const user = await authenticatedUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const db = await createSupabaseServer();
  const { data, error } = await db.rpc("search_vocabulary", {
    p_query: filters.query,
    p_band: filters.band,
    p_topic: filters.topic,
    p_state: filters.state,
    p_favorite: filters.favorite,
    p_difficult: filters.difficult,
    p_sort: filters.sort,
    p_page: filters.page,
    p_size: filters.pageSize,
  });
  if (error) throw new Error(error.message);
  return data as PageResult;
}
export async function getVocabulary(id: string): Promise<Vocabulary | null> {
  if (!supabaseConfigured())
    return (await trialCatalogue()).find((v) => v.id === id) ?? null;
  if (!(await authenticatedUser())) redirect("/login");
  const db = await createSupabaseServer();
  const { data, error } = await db
    .from("catalogue_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Vocabulary | null;
}
