import {
  exerciseSessionState,
  normalizedExerciseTypes,
} from "./domain/practice-exercises";
import {
  createCloudPractice,
  readCloudPractice,
  commitCloudPractice,
  listCloudPractice,
  cloudPracticeIds,
  prepareTrialPractice,
  downloadTrialPractice,
} from "@/app/practice-actions";
import {
  applyPracticeCommand,
  practiceSummary,
  practiceVariant,
  publicPracticeQuestion,
  practiceStartSchema,
  practiceCommandSchema,
  type PracticeStart,
  type PracticeCommand,
  type PracticeBatch,
  type PracticeSummary,
  type PrivatePracticeSession,
  type PrivatePracticeQuestion,
} from "./domain/practice";
import type { ProgressMap } from "./domain/types";
import { resolveDecks } from "./deck-client";
import { actionValue } from "./domain/action-result";

type Mode = "cloud" | "trial";
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Trình duyệt chưa cho phép lưu bài luyện."));
      return;
    }
    const request = indexedDB.open("hanziflow.practice.v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      connection = undefined;
      reject(
        new Error(
          "Không mở được bộ nhớ bài luyện. Kiểm tra quyền lưu trữ của trình duyệt.",
        ),
      );
    };
  }));
}
function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("records", mode),
      store = tx.objectStore("records");
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onerror = () =>
      reject(tx.error ?? new Error("Không lưu được bài luyện."));
    tx.onabort = () =>
      reject(tx.error ?? new Error("Không lưu được bài luyện."));
    work(store)
      .then((v) => {
        value = v;
      })
      .catch((error) => {
        reject(error);
        tx.abort();
      });
  });
}
const sessionKey = (id: string) => `session:${id}`;
const questionKey = (id: string, ordinal: number) =>
  `question:${id}:${String(ordinal).padStart(5, "0")}`;
const questionRange = (id: string) =>
  IDBKeyRange.bound(`question:${id}:`, `question:${id}:~`);
async function localSession(id: string) {
  const s = await transaction("readonly", (store) =>
    result<PrivatePracticeSession | undefined>(store.get(sessionKey(id))),
  );
  if (!s)
    throw new Error(
      "Bài luyện này không có trong trình duyệt. Bài bản thử chỉ được lưu trên thiết bị đã tạo.",
    );
  return s;
}
async function localQuestions(id: string) {
  return transaction("readonly", (store) =>
    result<PrivatePracticeQuestion[]>(store.getAll(questionRange(id))),
  );
}
export async function startPractice(
  mode: Mode,
  input: PracticeStart,
  progress: ProgressMap,
  onProgress?: (done: number, total: number) => void,
): Promise<PracticeSummary> {
  const parsed = practiceStartSchema.parse(input);
  if (mode === "cloud") return actionValue(await createCloudPractice(parsed));
  if (parsed.source.kind === "retry") {
    const parent = await localSession(parsed.source.parentId);
    if (parent.status !== "submitted")
      throw new Error("Hãy hoàn thành bài gốc trước khi luyện lại.");
  }
  const existing = await transaction("readonly", (store) =>
    result<PrivatePracticeSession | undefined>(
      store.get(sessionKey(parsed.requestId)),
    ),
  );
  if (existing) {
    if (
      JSON.stringify(existing.source) !== JSON.stringify(parsed.source) ||
      existing.mode !== parsed.mode ||
      existing.direction !== parsed.direction ||
      existing.language !== parsed.language ||
      existing.lessonSize !== parsed.lessonSize ||
      JSON.stringify(normalizedExerciseTypes(existing.exerciseTypes)) !==
        JSON.stringify(normalizedExerciseTypes(parsed.exerciseTypes))
    )
      throw new Error("Yêu cầu đã được dùng cho bài khác.");
    return practiceSummary(existing);
  }
  const parentIds =
    parsed.source.kind === "retry"
      ? (await localQuestions(parsed.source.parentId)).map(
          (q) => q.vocabularyId,
        )
      : undefined;
  // Only trial personal selections need local flags. Send matching IDs rather
  // than the full progress map, which can exceed the Server Action body limit.
  const personalFilter =
    parsed.source.kind === "personal" ? parsed.source.filter : null;
  const deckSnapshot =
    parsed.source.kind === "decks"
      ? await resolveDecks(
          mode,
          progress,
          parsed.source.refs,
          parsed.source.groups,
          parsed.lessonSize,
          parsed.source.fingerprint,
        )
      : undefined;
  const personalIds = deckSnapshot
    ? deckSnapshot.ids
    : personalFilter
      ? Object.values(progress)
          .filter((p) =>
            personalFilter === "learned"
              ? p.state !== "NEW"
              : p[personalFilter],
          )
          .map((p) => p.vocabulary_id)
      : [];

  const summary = actionValue(
    await prepareTrialPractice(parsed, personalIds, parentIds),
  );
  if (deckSnapshot) summary.title = deckSnapshot.title;
  try {
    for (let offset = 0; offset < summary.total; offset += 50) {
      const questions = actionValue(
        await downloadTrialPractice(summary.id, offset),
      );
      if (questions.length !== Math.min(50, summary.total - offset))
        throw new Error("Đợt tải câu hỏi chưa đầy đủ. Hãy thử lại.");
      await transaction("readwrite", async (store) => {
        for (const q of questions)
          store.put(q, questionKey(summary.id, q.ordinal));
      });
      onProgress?.(Math.min(offset + 50, summary.total), summary.total);
    }
    const frozen = await localQuestions(summary.id);
    await transaction("readwrite", async (store) => {
      store.put(
        {
          ...exerciseSessionState(frozen),
          ...summary,
          answers: {},
          correctCount: 0,
        } satisfies PrivatePracticeSession,
        sessionKey(summary.id),
      );
    });
    return summary;
  } catch (error) {
    await transaction("readwrite", async (store) => {
      const keys = await result(store.getAllKeys(questionRange(summary.id)));
      keys.forEach((key) => store.delete(key));
    });
    throw error;
  }
}
export async function readPractice(
  mode: Mode,
  id: string,
  offset = 0,
): Promise<PracticeBatch> {
  if (mode === "cloud") return actionValue(await readCloudPractice(id, offset));
  const session = await localSession(id);
  const questions = await transaction("readonly", async (store) => {
    const page = await Promise.all(
      Array.from({ length: Math.min(25, session.total - offset) }, (_, i) =>
        result<PrivatePracticeQuestion>(store.get(questionKey(id, offset + i))),
      ),
    );
    if (session.status === "submitted") return page;
    const extra = [
      ...new Set(page.flatMap((q) => q.boardOrdinals ?? [])),
    ].filter((n) => !page.some((q) => q.ordinal === n));
    return [
      ...page,
      ...(await Promise.all(
        extra.map((n) =>
          result<PrivatePracticeQuestion>(store.get(questionKey(id, n))),
        ),
      )),
    ];
  });
  return {
    session: practiceSummary(session),
    questions: questions.map((q) =>
      publicPracticeQuestion(q, session, questions),
    ),
  };
}
export async function commitPractice(
  mode: Mode,
  id: string,
  command: PracticeCommand,
): Promise<PracticeSummary> {
  const parsed = practiceCommandSchema.parse(command);
  if (mode === "cloud")
    return actionValue(await commitCloudPractice(id, parsed));
  return transaction("readwrite", async (store) => {
    const session = await result<PrivatePracticeSession | undefined>(
      store.get(sessionKey(id)),
    );
    if (!session) throw new Error("Không tìm thấy bài luyện.");
    const key = `event:${id}:${parsed.eventId}`,
      payload = JSON.stringify(parsed);
    const event = await result<
      { payload: string; summary: PracticeSummary } | undefined
    >(store.get(key));
    if (event) {
      if (event.payload !== payload)
        throw new Error("Yêu cầu đã được dùng cho lựa chọn khác.");
      return event.summary;
    }
    const q =
      parsed.ordinal === undefined
        ? undefined
        : await result<PrivatePracticeQuestion>(
            store.get(questionKey(id, parsed.ordinal)),
          );
    const all = q
      ? await Promise.all(
          (q.boardOrdinals ?? [q.ordinal]).map((n) =>
            result<PrivatePracticeQuestion>(store.get(questionKey(id, n))),
          ),
        )
      : [];
    if (
      q?.exerciseType === "matching" &&
      (session.answers[q.ordinal]?.activeVariant ?? "primary") === "primary" &&
      parsed.kind === "answer" &&
      all.some(
        (v) =>
          v.boardId === q.boardId &&
          v.correctOptionId === parsed.optionId &&
          (session.answers[v.ordinal]?.matchingResolved ||
            session.answers[v.ordinal]?.boardRemoved),
      )
    )
      throw new Error("Cặp này đã hoàn thành hoặc được hỏi lại.");
    const next = applyPracticeCommand(session, q, parsed),
      summary = practiceSummary(next);
    store.put(next, sessionKey(id));
    store.put({ payload, summary }, key);
    return summary;
  });
}
export async function listPractice(mode: Mode): Promise<PracticeSummary[]> {
  if (mode === "cloud") return actionValue(await listCloudPractice());
  const sessions = await transaction("readonly", (store) =>
    result<PrivatePracticeSession[]>(
      store.getAll(IDBKeyRange.bound("session:", "session:~")),
    ),
  );
  return sessions
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((s) => practiceSummary(s));
}
export async function practiceResultIds(
  mode: Mode,
  id: string,
  filter: "all" | "wrong" | "marked",
): Promise<string[]> {
  if (mode === "cloud") return actionValue(await cloudPracticeIds(id, filter));
  const session = await localSession(id);
  if (session.status !== "submitted")
    throw new Error("Hãy nộp bài để xem kết quả.");
  return (await localQuestions(id))
    .filter(
      (q) =>
        filter === "all" ||
        (filter === "marked"
          ? session.answers[q.ordinal]?.marked
          : session.answers[q.ordinal]?.optionId !==
            practiceVariant(q, session.answers[q.ordinal]?.firstVariant)
              .correctOptionId),
    )
    .map((q) => q.vocabularyId);
}
