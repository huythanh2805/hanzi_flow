import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { Landscape } from "@/components/landscape";
import { AuthForm } from "@/components/auth-form";
import { supabaseConfigured } from "@/lib/supabase/config";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <div className="auth-art">
        <Link href="/" aria-label="HanziFlow">
          <Brand />
        </Link>
        <Landscape />
        <div>
          <h2>
            Chậm một chút.
            <br />
            Nhớ lâu hơn.
          </h2>
          <p>
            Học tiếng Trung không chỉ là ghi nhớ.
            <br />
            Đó là mở thêm một cách nhìn thế giới.
          </p>
        </div>
      </div>
      <div className="auth-form-side">
        <Link className="back-link" href="/">
          <ArrowLeft size={15} />
          Trang chủ
        </Link>
        <AuthForm
          configured={supabaseConfigured()}
          initialSignup={params.mode === "signup"}
          callbackError={!!params.error}
        />
      </div>
    </main>
  );
}
