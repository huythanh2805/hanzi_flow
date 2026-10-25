import {
  cloudDeckList,
  cloudDeckMutate,
  cloudDeckResolve,
  cloudDeckWords,
  trialDeckIndex,
  type DeckWordFilters,
  type DeckWordPage,
} from "@/app/deck-actions";
import { actionValue } from "./domain/action-result";
import {
  applyDeckCommand,
  deckSummaries,
  localDeckSnapshot,
  selectDeckGroups,
  type Deck,
  type DeckCommand,
  type DeckIndex,
  type DeckSnapshot,
  type LocalDeck,
} from "./domain/decks";
import type { ProgressMap } from "./domain/types";
type Mode = "cloud" | "trial";
export const deckChangeEvent = "hanziflow:decks-changed";
let connection: Promise<IDBDatabase> | undefined,
  indexPromise: Promise<DeckIndex[]> | undefined;
function db() {
  return (connection ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("hanziflow.decks.v1", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("decks", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      connection = undefined;
      reject(new Error("Không mở được bộ nhớ bộ từ của trình duyệt."));
    };
  }));
}
function read<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (s: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("decks", mode);
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error ?? new Error("Không lưu được bộ từ."));
    tx.onabort = () => reject(tx.error ?? new Error("Không lưu được bộ từ."));
    work(tx.objectStore("decks"))
      .then((v) => {
        value = v;
      })
      .catch((e) => {
        reject(e);
        tx.abort();
      });
  });
}
function localDecks() {
  return transaction("readonly", (s) => read<LocalDeck[]>(s.getAll()));
}
function catalogueIndex() {
  return (indexPromise ??= trialDeckIndex()
    .then(actionValue)
    .catch((e) => {
      indexPromise = undefined;
      throw e;
    }));
}
export function announceDeckChange() {
  window.dispatchEvent(new Event(deckChangeEvent));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(deckChangeEvent);
    channel.postMessage("changed");
    channel.close();
  }
}
export async function listDecks(
  mode: Mode,
  progress: ProgressMap,
): Promise<Deck[]> {
  return mode === "cloud"
    ? actionValue(await cloudDeckList())
    : deckSummaries(await localDecks(), progress);
}
export async function mutateDeck(mode: Mode, command: DeckCommand) {
  if (mode === "cloud") actionValue(await cloudDeckMutate(command));
  else {
    const index = await catalogueIndex(),
      validIds = new Set(index.map((v) => v.id));
    await transaction("readwrite", async (store) => {
      const old = await read<LocalDeck[]>(store.getAll()),
        next = applyDeckCommand(old, command, validIds);
      for (const d of old)
        if (!next.some((n) => n.id === d.id)) store.delete(d.id);
      for (const d of next) store.put(d);
    });
  }
  announceDeckChange();
}
export async function resolveDecks(
  mode: Mode,
  progress: ProgressMap,
  refs: string[],
  groups?: number[],
  size = 20,
  expected?: string,
): Promise<DeckSnapshot> {
  if (mode === "cloud")
    return actionValue(await cloudDeckResolve(refs, groups, size, expected));
  const snapshot = localDeckSnapshot(
    await catalogueIndex(),
    await localDecks(),
    progress,
    refs,
  );
  if (expected && expected !== snapshot.fingerprint)
    throw new Error("Bộ từ đã thay đổi. Hãy chọn lại nhóm.");
  return selectDeckGroups(snapshot, groups, size);
}
export const practiceSelectionKey = (
  mode: string,
  userId: string,
  id: string,
) => `hanziflow.practice-selection:${mode}:${userId}:${id}`;
export async function vocabularyBatch(ids: string[], signal?: AbortSignal) {
  if (!ids.length) return [] as import("./domain/types").Vocabulary[];
  const r = await fetch("/api/decks/vocabulary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids),
    signal,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Cannot load vocabulary");
  return data as import("./domain/types").Vocabulary[];
}
export async function deckWords(
  mode: Mode,
  progress: ProgressMap,
  refs: string[],
  filters: DeckWordFilters,
): Promise<DeckWordPage> {
  if (mode === "cloud") return actionValue(await cloudDeckWords(refs, filters));
  const snapshot = await resolveDecks(mode, progress, refs),
    index = await catalogueIndex();
  const bandById = new Map(index.map((v) => [v.id, v.band]));
  let ids = snapshot.ids.filter(
    (id) =>
      (!filters.band || bandById.get(id) === filters.band) &&
      (!filters.state || (progress[id]?.state ?? "NEW") === filters.state),
  );
  if (filters.query) {
    // The trial catalogue already lives on the app server; search through its public endpoint.
    const found = new Set<string>();
    for (let page = 1; ; page++) {
      const response = await fetch("/api/vocabulary/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            query: filters.query,
            band: filters.band,
            topic: "",
            state: "",
            favorite: false,
            difficult: false,
            sort: "order",
            page,
            pageSize: 100,
          },
        }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Không tìm được từ.");
      value.items.forEach((v: { id: string }) => found.add(v.id));
      if (page * 100 >= value.total) break;
    }
    ids = ids.filter((id) => found.has(id));
  }
  return {
    items: await vocabularyBatch(
      ids.slice((filters.page - 1) * 30, filters.page * 30),
    ),
    total: ids.length,
    page: filters.page,
    pageSize: 30,
    progress,
    fingerprint: snapshot.fingerprint,
  };
}
