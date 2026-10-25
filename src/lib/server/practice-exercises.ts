import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  buildExerciseQuestions,
  exerciseSessionState,
  normalizedExerciseTypes,
} from "@/lib/domain/practice-exercises";
import {
  selectPracticeIds,
  type PracticeStart,
  type PracticeLexeme,
  type PracticeSummary,
} from "@/lib/domain/practice";
import type { Vocabulary, ProgressMap } from "@/lib/domain/types";

// This module never crosses the client boundary. Only the authenticated server
// builds private snapshots; browsers cannot invoke the installation RPC.
export async function cloudExerciseRecipe(input: PracticeStart) {
  const db = await createSupabaseServer();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new Error("Phiên đăng nhập đã hết hạn.");
  const { data, error } = await db.rpc("practice_lexicon", {
    p_language: input.language,
  });
  if (error) throw new Error(error.message);
  const lexicon = data as (PracticeLexeme & { topics: string[] })[];
  const progress: ProgressMap = {};
  if (input.source.kind === "personal")
    for (let offset = 0; ; offset += 1000) {
      const r = await db
        .from("user_vocabulary")
        .select("*")
        .eq("user_id", auth.user.id)
        .order("vocabulary_id")
        .range(offset, offset + 999);
      if (r.error) throw new Error(r.error.message);
      r.data.forEach((p) => {
        progress[p.vocabulary_id] = p;
      });
      if (r.data.length < 1000) break;
    }
  let parentIds: string[] | undefined;
  if (input.source.kind === "retry") {
    const r = await db.rpc("practice_result_ids", {
      p_id: input.source.parentId,
      p_filter: "all",
    });
    if (r.error) throw new Error(r.error.message);
    parentIds = r.data;
  }
  const rows = lexicon.map((v) => ({
    id: v.id,
    band: v.band,
    source_order: v.sourceOrder,
    topics: v.topics,
  })) as Vocabulary[];
  const ids = selectPracticeIds(
    rows,
    input.source,
    input.lessonSize,
    progress,
    parentIds,
  );
  return {
    ...buildExerciseQuestions(
      lexicon,
      ids,
      input.direction,
      input.requestId,
      randomUUID,
      input.exerciseTypes,
    ),
    owner: auth.user.id,
  };
}
export async function installCloudExercises(
  input: PracticeStart,
): Promise<PracticeSummary> {
  const recipe = await cloudExerciseRecipe(input);
  const secret =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    throw new Error("Máy chủ chưa có khóa Supabase để chuẩn bị dạng bài mới.");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("practice_install_exercises", {
    p_owner: recipe.owner,
    p_input: {
      ...input,
      exerciseTypes: normalizedExerciseTypes(input.exerciseTypes),
    },
    p_questions: recipe.questions,
    p_queue: exerciseSessionState(recipe.questions).learningQueue,
    p_counts: recipe.counts,
    p_board_count: recipe.boardCount,
  });
  if (error) throw new Error(error.message);
  // Read the public summary with the user's JWT, rather than returning private rows.
  const db = await createSupabaseServer();
  const r = await db.rpc("practice_read", {
    p_id: data,
    p_offset: 0,
    p_limit: 1,
  });
  if (r.error) throw new Error(r.error.message);
  return r.data.session;
}
