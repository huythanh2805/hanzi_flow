import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import { siteUrl } from "@/lib/site-url";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (url.searchParams.has("error")) {
    const reason =
      url.searchParams.get("error_code") === "otp_expired"
        ? "confirmation_expired"
        : "callback";
    return NextResponse.redirect(siteUrl(`/login?error=${reason}`));
  }
  if (code && supabaseConfigured()) {
    const db = await createSupabaseServer();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(siteUrl("/dashboard"));
    const reason =
      error.code === "otp_expired" ? "confirmation_expired" : "callback";
    return NextResponse.redirect(siteUrl(`/login?error=${reason}`));
  }
  return NextResponse.redirect(siteUrl("/login?error=callback"));
}
