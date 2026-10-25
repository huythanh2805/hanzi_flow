"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import { trialCatalogue } from "@/lib/server/catalogue";
import { entryId } from "@/lib/domain/validation";
import type { ActionResult } from "@/lib/domain/action-result";
import {
  practiceLexicon,
  selectPracticeIds,
  practiceStartSchema,
  practiceCommandSchema,
  practiceSummary,
  type PracticeStart,
  type PracticeSummary,
  type PracticeBatch,
  type PracticeCommand,
  type PrivatePracticeQuestion,
  type PrivatePracticeSession,
} from "@/lib/domain/practice";
import {
  buildExerciseQuestions,
  normalizedExerciseTypes,
  exerciseSessionState,
} from "@/lib/domain/practice-exercises";
import {
  cloudExerciseRecipe,
  installCloudExercises,
} from "@/lib/server/practice-exercises";
import topics from "../../data/topics.json";

async function client() {
  if (!supabaseConfigured())
    throw new Error("Phiên này chỉ có trên trình duyệt của bạn.");
  const db = await createSupabaseServer();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user)
    throw new Error(
      "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.",
    );
  return db;
}
function message(error: { message: string }) {
  if (error.message.includes("SOURCE_CHANGED"))
    return new Error("Bộ từ đã thay đổi. Hãy chọn lại nhóm trước khi tạo bài.");
  if (error.message.includes("VARIANT_CHANGED"))
    return new Error(
      "Dạng câu hỏi đã thay đổi ở thiết bị khác. Hãy tải trạng thái đã lưu.",
    );
  if (error.message.includes("PAIR_UNAVAILABLE"))
    return new Error(
      "Cặp này đã hoàn thành hoặc được hỏi lại. Hãy tải trạng thái đã lưu.",
    );
  if (error.message.includes("STALE_REVISION"))
    return new Error("STALE_REVISION");
  if (error.message.includes("SESSION_NOT_FOUND"))
    return new Error("Không tìm thấy bài luyện của tài khoản này.");
  return new Error(error.message);
}
async function createCloudPracticeData(
  input: PracticeStart,
): Promise<PracticeSummary> {
  const parsed = practiceStartSchema.parse(input),
    db = await client();
  if (parsed.source.kind === "decks") {
    const prior = await db
      .from("practice_sessions")
      .select("id,source,mode,direction,language,lesson_size,exercise_types")
      .eq("request_id", parsed.requestId)
      .maybeSingle();
    if (prior.error) throw message(prior.error);
    if (prior.data) {
      const old = prior.data;
      if (
        ["kind", "refs", "groups", "fingerprint"].some(
          (key) =>
            JSON.stringify(old.source[key]) !==
            JSON.stringify((parsed.source as Record<string, unknown>)[key]),
        ) ||
        old.mode !== parsed.mode ||
        old.direction !== parsed.direction ||
        old.language !== parsed.language ||
        old.lesson_size !== parsed.lessonSize ||
        JSON.stringify([...old.exercise_types].sort()) !==
          JSON.stringify(normalizedExerciseTypes(parsed.exerciseTypes).sort())
      )
        throw new Error("Yêu cầu đã được dùng cho bài khác.");
      const r = await db.rpc("practice_read", {
        p_id: old.id,
        p_offset: 0,
        p_limit: 1,
      });
      if (r.error) throw message(r.error);
      return r.data.session;
    }
  }
  if (parsed.exerciseTypes?.some((t) => t !== "meaning_choice"))
    return installCloudExercises(parsed);
  const { data, error } = await db.rpc("practice_create", { p_input: parsed });
  if (error) throw message(error);
  return data;
}
async function readCloudPracticeData(
  id: string,
  offset = 0,
): Promise<PracticeBatch> {
  z.uuid().parse(id);
  z.number().int().min(0).max(11091).parse(offset);
  const db = await client(),
    { data, error } = await db.rpc("practice_read", {
      p_id: id,
      p_offset: offset,
      p_limit: 25,
    });
  if (error) throw message(error);
  return data;
}
async function commitCloudPracticeData(
  id: string,
  command: PracticeCommand,
): Promise<PracticeSummary> {
  z.uuid().parse(id);
  const parsed = practiceCommandSchema.parse(command),
    db = await client();
  const { data, error } = await db.rpc("practice_commit", {
    p_id: id,
    p_command: parsed,
  });
  if (error) throw message(error);
  return data;
}
async function listCloudPracticeData(): Promise<PracticeSummary[]> {
  const db = await client(),
    { data, error } = await db.rpc("practice_list");
  if (error) throw message(error);
  return data ?? [];
}
async function cloudPracticeIdsData(
  id: string,
  filter: "all" | "wrong" | "marked",
): Promise<string[]> {
  z.uuid().parse(id);
  z.enum(["all", "wrong", "marked"]).parse(filter);
  const db = await client(),
    { data, error } = await db.rpc("practice_result_ids", {
      p_id: id,
      p_filter: filter,
    });
  if (error) throw message(error);
  return data ?? [];
}

// Trial preparation is temporary and public-catalogue-only. Active sessions live
// in IndexedDB; no trial answers/progress are written to a server or cloud table.
type Prepared = {
  input: string;
  expires: number;
  session: PrivatePracticeSession;
  questions: PrivatePracticeQuestion[];
};
const prepared = new Map<string, Prepared>();
async function prepareTrialPracticeData(
  input: PracticeStart,
  personalIds: string[] = [],
  parentIds?: string[],
): Promise<PracticeSummary> {
  if (supabaseConfigured())
    throw new Error(
      "Không sử dụng dữ liệu bản thử cho tài khoản đã đăng nhập.",
    );
  const parsed = practiceStartSchema.parse(input),
    fingerprint = JSON.stringify(parsed),
    existing = prepared.get(parsed.requestId);
  if (existing && existing.expires > Date.now()) {
    if (existing.input !== fingerprint)
      throw new Error("Yêu cầu đã được dùng cho bài khác.");
    return practiceSummary(existing.session, existing.questions);
  }
  z.array(entryId).max(11092).parse(personalIds);
  if (parentIds) z.array(entryId).max(11092).parse(parentIds);
  const rows = await trialCatalogue();
  const ids = selectPracticeIds(
    rows,
    parsed.source.kind === "personal" || parsed.source.kind === "decks"
      ? { kind: "entries", ids: personalIds }
      : parsed.source,
    parsed.lessonSize,
    {},
    parentIds,
  );
  const built = buildExerciseQuestions(
    practiceLexicon(rows, parsed.language),
    ids,
    parsed.direction,
    parsed.requestId,
    randomUUID,
    parsed.exerciseTypes,
  );
  const { questions } = built;
  const source = parsed.source;
  const collectionName =
    source.kind === "groups"
      ? source.collectionType === "band"
        ? `Band ${source.collectionId}`
        : (topics.find((t) => t.id === source.collectionId)?.name ?? "Chủ đề")
      : "";
  const title =
    source.kind === "decks"
      ? `${source.refs.length} bộ từ kết hợp`
      : source.kind === "band"
        ? `Toàn bộ Band ${source.band}`
        : source.kind === "groups"
          ? `${new Set(source.groups).size} nhóm · ${collectionName}`
          : source.kind === "personal"
            ? {
                learned: "Từ đã học",
                favorite: "Từ đã lưu",
                difficult: "Từ khó",
              }[source.filter]
            : source.kind === "retry"
              ? "Luyện lại từ đã chọn"
              : "Nhóm vừa học";
  const session: PrivatePracticeSession = {
    id: parsed.requestId,
    title,
    source,
    mode: source.kind === "retry" ? "learn" : parsed.mode,
    direction: parsed.direction,
    language: parsed.language,
    lessonSize: parsed.lessonSize,
    total: questions.length,
    status: "active",
    revision: 0,
    createdAt: new Date().toISOString(),
    submittedAt: null,
    parentId: source.kind === "retry" ? source.parentId : null,
    answers: {},
    correctCount: 0,
    exerciseTypes: normalizedExerciseTypes(parsed.exerciseTypes),
    exerciseCounts: built.counts,
    boardCount: built.boardCount,
    ...exerciseSessionState(questions),
  };
  for (const [key, value] of prepared)
    if (value.expires < Date.now()) prepared.delete(key);
  while (prepared.size >= 8) prepared.delete(prepared.keys().next().value!);
  prepared.set(parsed.requestId, {
    input: fingerprint,
    session,
    questions,
    expires: Date.now() + 20 * 60 * 1000,
  });
  return practiceSummary(session, questions);
}
async function downloadTrialPracticeData(
  id: string,
  offset: number,
): Promise<PrivatePracticeQuestion[]> {
  if (supabaseConfigured())
    throw new Error("Không tải bản thử trong phiên tài khoản.");
  z.uuid().parse(id);
  z.number().int().min(0).max(11091).parse(offset);
  const value = prepared.get(id);
  if (!value || value.expires < Date.now())
    throw new Error("Đợt chuẩn bị đã hết hạn. Hãy bấm bắt đầu để tạo lại bài.");
  return value.questions.slice(offset, offset + 50);
}

// Expected failures are data: production React intentionally redacts thrown
// Server Action errors. Keep revision/preflight/retry messages across this boundary.
async function respond<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof z.ZodError
          ? "Thông tin bài luyện không hợp lệ. Hãy kiểm tra lựa chọn."
          : error instanceof Error
            ? error.message.replace(/^SOURCE_CHANGED:\s*/, "")
            : "Không thực hiện được yêu cầu. Hãy thử lại.",
    };
  }
}
export async function createCloudPractice(input: PracticeStart) {
  return respond(() => createCloudPracticeData(input));
}
export async function readCloudPractice(id: string, offset = 0) {
  return respond(() => readCloudPracticeData(id, offset));
}
export async function commitCloudPractice(
  id: string,
  command: PracticeCommand,
) {
  return respond(() => commitCloudPracticeData(id, command));
}
export async function listCloudPractice() {
  return respond(() => listCloudPracticeData());
}
export async function cloudPracticeIds(
  id: string,
  filter: "all" | "wrong" | "marked",
) {
  return respond(() => cloudPracticeIdsData(id, filter));
}
export async function prepareTrialPractice(
  input: PracticeStart,
  personalIds: string[] = [],
  parentIds?: string[],
) {
  return respond(() => prepareTrialPracticeData(input, personalIds, parentIds));
}
export async function downloadTrialPractice(id: string, offset: number) {
  return respond(() => downloadTrialPracticeData(id, offset));
}

export async function previewPractice(
  input: PracticeStart,
  personalIds: string[] = [],
  parentIds?: string[],
) {
  return respond(async () => {
    const parsed = practiceStartSchema.parse(input);
    if (!supabaseConfigured())
      return prepareTrialPracticeData(parsed, personalIds, parentIds);
    const recipe = await cloudExerciseRecipe(parsed);
    return {
      total: recipe.questions.length,
      exerciseCounts: recipe.counts,
      boardCount: recipe.boardCount,
    };
  });
}
