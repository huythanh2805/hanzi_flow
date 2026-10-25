"use server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import { trialCatalogue } from "@/lib/server/catalogue";
import {
  deckCommandSchema,
  deckRefsSchema,
  deckGroupsSchema,
  type DeckCommand,
  type Deck,
  type DeckSnapshot,
  type DeckIndex,
} from "@/lib/domain/decks";
import { entryId } from "@/lib/domain/validation";
import type { ActionResult } from "@/lib/domain/action-result";
import type { PageResult, ProgressMap, Vocabulary } from "@/lib/domain/types";

async function respond<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof z.ZodError
          ? "Thông tin bộ từ không hợp lệ."
          : e instanceof Error
            ? e.message.replace(/^SOURCE_CHANGED:\s*/, "")
            : "Không lưu được bộ từ. Hãy thử lại.",
    };
  }
}
async function client() {
  const db = await createSupabaseServer(),
    r = await db.auth.getUser();
  if (r.error || !r.data.user)
    throw new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");
  return db;
}
export async function cloudDeckList() {
  return respond(async () => {
    const db = await client(),
      r = await db.rpc("deck_list");
    if (r.error) throw new Error(r.error.message);
    return r.data as Deck[];
  });
}
export async function cloudDeckMutate(input: DeckCommand) {
  return respond(async () => {
    const parsed = deckCommandSchema.parse(input),
      db = await client(),
      r = await db.rpc("deck_mutate", { p_command: parsed });
    if (r.error) throw new Error(r.error.message);
    return r.data as { id: string; added: number };
  });
}
export async function cloudDeckResolve(
  refs: string[],
  groups?: number[],
  size = 20,
  expected?: string,
) {
  return respond(async () => {
    deckRefsSchema.parse(refs);
    if (groups !== undefined) deckGroupsSchema.parse(groups);
    z.union([
      z.literal(10),
      z.literal(15),
      z.literal(20),
      z.literal(25),
      z.literal(30),
    ]).parse(size);
    if (expected) z.string().max(100).parse(expected);
    const db = await client(),
      r = await db.rpc("deck_resolve", {
        p_refs: refs,
        p_groups: groups ?? null,
        p_size: size,
        p_expected: expected ?? null,
      });
    if (r.error) throw new Error(r.error.message);
    return r.data as DeckSnapshot;
  });
}
export type DeckWordFilters = {
  query: string;
  band: string;
  state: string;
  page: number;
};
export type DeckWordPage = PageResult & {
  progress: ProgressMap;
  fingerprint: string;
};
export async function cloudDeckWords(refs: string[], filters: DeckWordFilters) {
  return respond(async () => {
    deckRefsSchema.parse(refs);
    z.object({
      query: z.string().max(100),
      band: z.enum(["", "1", "2", "3", "4", "5", "6", "7-9"]),
      state: z.enum(["", "NEW", "LEARNING", "MASTERED"]),
      page: z.number().int().min(1).max(11092),
    })
      .strict()
      .parse(filters);
    const db = await client(),
      r = await db.rpc("deck_words", {
        p_refs: refs,
        p_query: filters.query,
        p_band: filters.band,
        p_state: filters.state,
        p_page: filters.page,
        p_size: 30,
      });
    if (r.error) throw new Error(r.error.message);
    return r.data as DeckWordPage;
  });
}
export async function trialDeckIndex() {
  return respond(async () => {
    if (supabaseConfigured())
      throw new Error("Nguồn này chỉ dành cho bản thử.");
    return (await trialCatalogue()).map(({ id, band, source_order }) => ({
      id,
      band,
      source_order,
    })) as DeckIndex[];
  });
}
export async function deckVocabularyBatch(ids: string[]) {
  return respond(async () => {
    z.array(entryId).min(1).max(100).parse(ids);
    let rows: Vocabulary[];
    if (!supabaseConfigured()) {
      const wanted = new Set(ids);
      rows = (await trialCatalogue()).filter((v) => wanted.has(v.id));
    } else {
      const db = await client(),
        r = await db.from("catalogue_entries").select("*").in("id", ids);
      if (r.error) throw new Error(r.error.message);
      rows = r.data as Vocabulary[];
    }
    const byId = new Map(rows.map((v) => [v.id, v]));
    if (ids.some((id) => !byId.has(id)))
      throw new Error("Có mục từ không tồn tại trong thư viện.");
    return ids.map((id) => byId.get(id)!);
  });
}
