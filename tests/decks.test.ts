import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  applyDeckCommand,
  localDeckSnapshot,
  selectDeckGroups,
  deckSummaries,
  deckSourceSchema,
  type DeckIndex,
  type LocalDeck,
} from "@/lib/domain/decks";
import type { ProgressMap } from "@/lib/domain/types";
const index: DeckIndex[] = Array.from({ length: 1100 }, (_, i) => ({
  id: `hsk30-b${i < 500 ? "1" : "2"}-${String(i < 500 ? i + 1 : i - 499).padStart(4, "0")}`,
  band: i < 500 ? "1" : "2",
  source_order: i < 500 ? i + 1 : i - 499,
}));
const valid = new Set(index.map((v) => v.id));
function makeDecks() {
  let decks: LocalDeck[] = [];
  for (const name of ["Travel", "Work"])
    decks = applyDeckCommand(
      decks,
      { kind: "create", id: randomUUID(), name, description: "" },
      valid,
    );
  return decks;
}
describe("personal deck selection", () => {
  it("unions custom and smart sources, preserves canonical IDs and ignores selection order", () => {
    let decks = makeDecks();
    const [a, b] = decks.map((d) => d.id);
    decks = applyDeckCommand(
      decks,
      { kind: "add", targets: [a], ids: [index[0].id, index[501].id] },
      valid,
    );
    decks = applyDeckCommand(
      decks,
      { kind: "add", targets: [b], ids: [index[0].id, index[502].id] },
      valid,
    );
    const progress: ProgressMap = {
      [index[1].id]: {
        vocabulary_id: index[1].id,
        state: "LEARNING",
        favorite: true,
        difficult: true,
        suspended: false,
        studied_at: null,
        updated_at: "",
      },
    };
    const snap = localDeckSnapshot(index, decks, progress, [
      a,
      b,
      "saved",
      "difficult",
      "learned",
    ]);
    expect(snap.ids).toEqual([
      index[0].id,
      index[1].id,
      index[501].id,
      index[502].id,
    ]);
    expect(
      localDeckSnapshot(index, decks, progress, [
        "saved",
        b,
        a,
        "learned",
        "difficult",
      ]).fingerprint,
    ).toBe(snap.fingerprint);
    expect(
      deckSummaries(decks, progress).find((d) => d.id === "saved"),
    ).toMatchObject({ total: 1, studied: 1, smart: true });
  });
  it("keeps all 1,100 members beyond REST limits and groups the final union", () => {
    let decks = makeDecks();
    decks = applyDeckCommand(
      decks,
      {
        kind: "add",
        targets: decks.map((d) => d.id),
        ids: index.map((v) => v.id),
      },
      valid,
    );
    const snap = localDeckSnapshot(
      index,
      decks,
      {},
      decks.map((d) => d.id),
    );
    expect(snap.total).toBe(1100);
    expect(selectDeckGroups(snap, [1, 13], 20).ids).toEqual(
      [...index.slice(0, 20), ...index.slice(240, 260)].map((v) => v.id),
    );
    expect(() => selectDeckGroups(snap, [], 20)).toThrow();
    expect(() => selectDeckGroups(snap, [56], 20)).toThrow();
  });
  it("does not merge distinct IDs that can represent the same spelling", () => {
    let decks = makeDecks();
    decks = applyDeckCommand(
      decks,
      { kind: "add", targets: [decks[0].id], ids: [index[0].id, index[1].id] },
      valid,
    );
    expect(localDeckSnapshot(index, decks, {}, [decks[0].id]).ids).toHaveLength(
      2,
    );
  });
  it("fails the complete union if one deck no longer exists", () => {
    const decks = makeDecks();
    expect(() =>
      localDeckSnapshot(index, decks, {}, [decks[0].id, randomUUID()]),
    ).toThrow();
  });
});
describe("personal deck mutations", () => {
  it("adds atomically, skips duplicates and changes the fingerprint only after a real mutation", () => {
    let decks = makeDecks();
    const before = structuredClone(decks),
      target = decks[0].id;
    expect(() =>
      applyDeckCommand(
        decks,
        { kind: "add", targets: [target, randomUUID()], ids: [index[0].id] },
        valid,
      ),
    ).toThrow();
    expect(decks).toEqual(before);
    expect(() =>
      applyDeckCommand(
        decks,
        { kind: "add", targets: [target], ids: ["hsk30-b1-9999"] },
        valid,
      ),
    ).toThrow();
    decks = applyDeckCommand(
      decks,
      { kind: "add", targets: [target], ids: [index[0].id, index[0].id] },
      valid,
    );
    const fp = localDeckSnapshot(index, decks, {}, [target]).fingerprint;
    const duplicate = applyDeckCommand(
      decks,
      { kind: "add", targets: [target], ids: [index[0].id] },
      valid,
    );
    expect(localDeckSnapshot(index, duplicate, {}, [target]).fingerprint).toBe(
      fp,
    );
    expect(duplicate[0].members).toHaveLength(1);
    const edited = applyDeckCommand(
      decks,
      { kind: "add", targets: [target], ids: [index[1].id] },
      valid,
    );
    expect(localDeckSnapshot(index, edited, {}, [target]).fingerprint).not.toBe(
      fp,
    );
  });
  it("removes/deletes only membership and retains other decks and progress", () => {
    let decks = makeDecks();
    const [a, b] = decks.map((d) => d.id);
    decks = applyDeckCommand(
      decks,
      { kind: "add", targets: [a, b], ids: [index[0].id] },
      valid,
    );
    const snapshot = localDeckSnapshot(index, decks, {}, [a, b]);
    decks = applyDeckCommand(
      decks,
      { kind: "remove", id: a, ids: [index[0].id] },
      valid,
    );
    expect(decks[1].members).toEqual([index[0].id]);
    decks = applyDeckCommand(
      decks,
      { kind: "delete", id: a, revision: decks[0].revision },
      valid,
    );
    expect(decks).toHaveLength(1);
    expect(snapshot.ids).toEqual([index[0].id]);
    expect(
      deckSourceSchema.safeParse({
        kind: "decks",
        refs: ["saved", b],
        groups: [1],
      }).success,
    ).toBe(true);
  });
  it("protects metadata from stale updates and supports retrying creation", () => {
    const id = randomUUID(),
      cmd = { kind: "create" as const, id, name: "Trips", description: "" };
    let decks = applyDeckCommand([], cmd, valid);
    expect(applyDeckCommand(decks, cmd, valid)).toHaveLength(1);
    decks = applyDeckCommand(
      decks,
      { kind: "update", id, revision: 0, name: "Trips 2", description: "New" },
      valid,
    );
    expect(() =>
      applyDeckCommand(
        decks,
        { kind: "update", id, revision: 0, name: "Stale", description: "" },
        valid,
      ),
    ).toThrow();
    expect(() =>
      applyDeckCommand(decks, { kind: "delete", id, revision: 0 }, valid),
    ).toThrow();
  });
});
