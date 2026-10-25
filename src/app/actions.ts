"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import {
  credentialsSchema,
  entryId,
  preferencesSchema,
  progressPatchSchema,
} from "@/lib/domain/validation";
import type { Preferences, Progress, ProgressPatch } from "@/lib/domain/types";
import { siteUrl } from "@/lib/site-url";
import { z } from "zod";
import type { ActionResult } from "@/lib/domain/action-result";

async function requireUser() {
  if (!supabaseConfigured()) throw new Error("Supabase chưa được cấu hình.");
  const db = await createSupabaseServer();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user)
    throw new Error("Vui lòng đăng nhập để lưu tiến độ.");
  return { db, user: data.user };
}
export async function updateVocabulary(
  id: string,
  patch: ProgressPatch,
): Promise<Progress> {
  const parsedId = entryId.parse(id);
  const parsedPatch = progressPatchSchema.parse(patch);
  const { db } = await requireUser();
  const { data, error } = await db.rpc("patch_vocabulary", {
    p_id: parsedId,
    p_patch: parsedPatch,
  });
  if (error) throw new Error(`Không lưu được tiến độ: ${error.message}`);
  revalidatePath("/", "layout");
  return data as Progress;
}
export async function savePreferences(input: Preferences) {
  const preferences = preferencesSchema.parse(input);
  const { db, user } = await requireUser();
  const { error } = await db.from("profiles").upsert({
    user_id: user.id,
    preferences,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Không lưu được cài đặt: ${error.message}`);
  revalidatePath("/", "layout");
  return preferences;
}
export async function markPracticeWordsDifficult(
  id: string,
  ids: string[],
): Promise<ActionResult<Progress[]>> {
  try {
    z.uuid().parse(id);
    z.array(entryId).min(1).max(11092).parse(ids);
    const { db } = await requireUser();
    const { data, error } = await db.rpc("practice_mark_difficult", {
      p_id: id,
      p_ids: ids,
    });
    if (error) throw new Error(error.message);
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof z.ZodError
          ? "Danh sách từ không hợp lệ."
          : error instanceof Error
            ? error.message
            : "Không lưu được từ khó. Hãy thử lại.",
    };
  }
}
export async function authenticate(input: {
  email: string;
  password: string;
  signup: boolean;
}): Promise<{ error?: string; message?: string }> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!supabaseConfigured())
    return { error: "Chưa cấu hình Supabase. Bạn có thể dùng bản thử cục bộ." };
  const db = await createSupabaseServer();
  if (input.signup) {
    const { data, error } = await db.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: siteUrl("/auth/callback").toString(),
      },
    });
    if (error) return { error: error.message };
    if (!data.session)
      return {
        message: "Hãy kiểm tra email để xác nhận tài khoản, sau đó đăng nhập.",
      };
  } else {
    const { error } = await db.auth.signInWithPassword(parsed.data);
    if (error?.code === "email_not_confirmed")
      return {
        error:
          "Email chưa được xác nhận. Hãy dùng liên kết mới nhất hoặc gửi lại email xác nhận bên dưới.",
      };
    if (error)
      return {
        error:
          "Không đăng nhập được. Kiểm tra email, mật khẩu và xác nhận email của bạn.",
      };
  }
  redirect("/dashboard");
}
export async function resendEmailConfirmation(
  email: string,
): Promise<{ error?: string; message?: string }> {
  const parsed = z.email().safeParse(email);
  if (!parsed.success)
    return { error: "Nhập địa chỉ email hợp lệ để gửi lại xác nhận." };
  if (!supabaseConfigured()) return { error: "Supabase chưa được cấu hình." };
  const db = await createSupabaseServer();
  const { error } = await db.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: siteUrl("/auth/callback").toString() },
  });
  if (error)
    return {
      error:
        error.status === 429
          ? "Bạn đang yêu cầu quá nhanh. Chờ một phút rồi thử lại."
          : "Chưa gửi được yêu cầu. Hãy thử lại sau; nếu email đã xác nhận, bạn có thể đăng nhập ngay.",
    };
  return {
    message:
      "Đã tiếp nhận yêu cầu gửi lại email. Nếu tài khoản chưa xác nhận, hãy kiểm tra hộp thư và thư mục Spam. Dùng liên kết mới nhất trong trình duyệt này.",
  };
}
export async function logout() {
  const { db } = await requireUser();
  const { error } = await db.auth.signOut();
  if (error) throw new Error(error.message);
  redirect("/");
}
