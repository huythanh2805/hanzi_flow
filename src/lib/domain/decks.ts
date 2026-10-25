import { z } from "zod";
import { entryId } from "./validation";
import type { ProgressMap } from "./types";

export const smartDecks = ["saved", "difficult", "learned"] as const;
export const deckRefSchema = z.union([z.enum(smartDecks), z.uuid()]);
export const deckRefsSchema = z.array(deckRefSchema).min(1).max(50);
export const deckGroupsSchema = z
  .array(z.number().int().min(1).max(2000))
  .min(1)
  .max(2000);
export const deckSourceSchema = z
  .object({
    kind: z.literal("decks"),
    refs: deckRefsSchema,
    groups: deckGroupsSchema.optional(),
    fingerprint: z.string().min(1).max(100).optional(),
  })
  .strict();
export type DeckSource = z.infer<typeof deckSourceSchema>;
export type Deck = {
  id: string;
  name: string;
  description: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  total: number;
  studied: number;
  smart?: boolean;
};
export type LocalDeck = Omit<Deck, "total" | "studied" | "smart"> & {
  members: string[];
};
export type DeckIndex = { id: string; band: string; source_order: number };
export type DeckSnapshot = {
  ids: string[];
  total: number;
  fingerprint: string;
  title: string;
  studiedIds?: string[];
};
export const smartDeckNames: Record<string, string> = {
  saved: "Từ đã lưu",
  difficult: "Từ khó",
  learned: "Từ đã học",
};
const metadata = {
  name: z.string().trim().min(1, "Hãy nhập tên bộ từ.").max(80),
  description: z.string().trim().max(500),
};
export const deckCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), id: z.uuid(), ...metadata }).strict(),
  z
    .object({
      kind: z.literal("update"),
      id: z.uuid(),
      revision: z.number().int().min(0),
      ...metadata,
    })
    .strict(),
  z
    .object({
      kind: z.literal("delete"),
      id: z.uuid(),
      revision: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      kind: z.literal("add"),
      targets: z.array(z.uuid()).min(1).max(50),
      ids: z.array(entryId).min(1).max(11092),
    })
    .strict(),
  z
    .object({
      kind: z.literal("remove"),
      id: z.uuid(),
      ids: z.array(entryId).min(1).max(11092),
    })
    .strict(),
]);
export type DeckCommand = z.infer<typeof deckCommandSchema>;
export function orderedDeckIds(index: DeckIndex[], ids: Iterable<string>) {
  const selected = new Set(ids);
  return index
    .filter((v) => selected.has(v.id))
    .sort(
      (a, b) =>
        (a.band === "7-9" ? 7 : Number(a.band)) -
          (b.band === "7-9" ? 7 : Number(b.band)) ||
        a.source_order - b.source_order ||
        a.id.localeCompare(b.id),
    )
    .map((v) => v.id);
}
export function deckSummaries(
  decks: LocalDeck[],
  progress: ProgressMap,
): Deck[] {
  const studied = (ids: string[]) =>
    ids.filter((id) => progress[id] && progress[id].state !== "NEW").length;
  return [
    ...smartDecks.map((id) => {
      const ids = Object.values(progress)
        .filter((p) =>
          id === "saved"
            ? p.favorite
            : id === "difficult"
              ? p.difficult
              : p.state !== "NEW",
        )
        .map((p) => p.vocabulary_id);
      return {
        id,
        name: smartDeckNames[id],
        description: "Tự cập nhật theo tiến độ của bạn",
        revision: 0,
        createdAt: "",
        updatedAt: "",
        total: ids.length,
        studied: studied(ids),
        smart: true,
      };
    }),
    ...decks
      .map(({ members, ...d }) => ({
        ...d,
        total: members.length,
        studied: studied(members),
      }))
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      ),
  ];
}
export function localDeckSnapshot(
  index: DeckIndex[],
  decks: LocalDeck[],
  progress: ProgressMap,
  refs: string[],
): DeckSnapshot {
  deckRefsSchema.parse(refs);
  const unique = [...new Set(refs)].sort(),
    ids = new Set<string>(),
    versions: string[] = [];
  for (const ref of unique) {
    if (smartDecks.includes(ref as (typeof smartDecks)[number])) {
      for (const p of Object.values(progress))
        if (
          ref === "saved"
            ? p.favorite
            : ref === "difficult"
              ? p.difficult
              : p.state !== "NEW"
        )
          ids.add(p.vocabulary_id);
    } else {
      const d = decks.find((d) => d.id === ref);
      if (!d)
        throw new Error(
          "Bộ từ không tồn tại hoặc bạn không có quyền truy cập.",
        );
      d.members.forEach((id) => ids.add(id));
      versions.push(`${ref}:${d.revision}`);
    }
  }
  const ordered = orderedDeckIds(index, ids);
  let hash = 2166136261;
  for (const c of [...unique, ...versions, ...ordered].join("|"))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return {
    ids: ordered,
    studiedIds: ordered.filter(
      (id) => progress[id] && progress[id].state !== "NEW",
    ),
    total: ordered.length,
    fingerprint: `trial-${(hash >>> 0).toString(16)}`,
    title:
      unique.length === 1
        ? (smartDeckNames[unique[0]] ??
          decks.find((d) => d.id === unique[0])!.name)
        : `${unique.length} bộ từ kết hợp`,
  };
}
export function selectDeckGroups(
  snapshot: DeckSnapshot,
  groups: number[] | undefined,
  size: number,
): DeckSnapshot {
  if (![10, 15, 20, 25, 30].includes(size))
    throw new Error("Kích thước nhóm không hợp lệ.");
  if (groups === undefined) return snapshot;
  deckGroupsSchema.parse(groups);
  const selected = new Set(groups);
  if ([...selected].some((n) => n > Math.ceil(snapshot.ids.length / size)))
    throw new Error("Nhóm đã thay đổi. Hãy chọn lại nhóm.");
  return {
    ...snapshot,
    ids: snapshot.ids.filter((_, i) => selected.has(Math.floor(i / size) + 1)),
  };
}
export function applyDeckCommand(
  decks: LocalDeck[],
  input: DeckCommand,
  validIds: Set<string>,
  now = new Date().toISOString(),
): LocalDeck[] {
  const cmd = deckCommandSchema.parse(input),
    next = structuredClone(decks);
  if ("ids" in cmd && cmd.ids.some((id) => !validIds.has(id)))
    throw new Error("Có mục từ không tồn tại trong thư viện.");
  if (cmd.kind === "create") {
    const old = next.find((d) => d.id === cmd.id);
    if (old) {
      if (old.name !== cmd.name || old.description !== cmd.description)
        throw new Error("Yêu cầu tạo bộ đã được sử dụng.");
      return next;
    }
    return [
      ...next,
      {
        id: cmd.id,
        name: cmd.name,
        description: cmd.description,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        members: [],
      },
    ];
  }
  const targets = cmd.kind === "add" ? [...new Set(cmd.targets)] : [cmd.id];
  if (targets.some((id) => !next.some((d) => d.id === id)))
    throw new Error("Bộ từ không tồn tại hoặc bạn không có quyền truy cập.");
  for (const id of targets) {
    const d = next.find((d) => d.id === id)!;
    if (
      (cmd.kind === "update" || cmd.kind === "delete") &&
      d.revision !== cmd.revision
    )
      throw new Error("Bộ đã thay đổi ở tab khác. Hãy tải lại trước khi sửa.");
    if (cmd.kind === "delete") return next.filter((d) => d.id !== id);
    if (cmd.kind === "update") {
      if (d.name === cmd.name && d.description === cmd.description) continue;
      d.name = cmd.name;
      d.description = cmd.description;
    } else {
      const members =
        cmd.kind === "add"
          ? [...new Set([...d.members, ...cmd.ids])]
          : d.members.filter((v) => !cmd.ids.includes(v));
      if (members.length === d.members.length) continue;
      d.members = members;
    }
    d.revision++;
    d.updatedAt = now;
  }
  return next;
}
