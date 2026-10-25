"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { authenticate, resendEmailConfirmation } from "@/app/actions";
import { siteUrl } from "@/lib/site-url";
import { Button } from "./ui/button";
import { createSupabaseBrowser } from "@/lib/supabase/client";
export function AuthForm({
  configured,
  initialSignup = false,
  callbackError = false,
}: {
  configured: boolean;
  initialSignup?: boolean;
  callbackError?: boolean;
}) {
  const [signup, setSignup] = useState(initialSignup);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    callbackError
      ? "Liên kết không còn hiệu lực hoặc đã được dùng. Nếu đã xác nhận email, hãy đăng nhập bằng mật khẩu. Nếu chưa, nhập email rồi bấm gửi lại xác nhận."
      : "",
  );
  const [message, setMessage] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  useEffect(() => {
    // Supabase may return error details in a URL fragment; avoid retaining them in history.
    if (window.location.hash.startsWith("#error="))
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
  }, []);
  useEffect(() => {
    if (!resendCooldown) return;
    const timer = setTimeout(
      () => setResendCooldown((value) => value - 1),
      1000,
    );
    return () => clearTimeout(timer);
  }, [resendCooldown]);
  async function resend() {
    if (!emailInput.current?.reportValidity()) {
      emailInput.current?.focus();
      return;
    }
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await resendEmailConfirmation(email);
      if (result.error) setError(result.error);
      if (result.message) {
        setMessage(result.message);
        setResendCooldown(60);
      }
    } catch {
      setError("Không kết nối được máy chủ. Hãy thử gửi lại sau.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await authenticate({ email, password, signup });
      if (result.error) setError(result.error);
      if (result.message) setMessage(result.message);
    } catch {
      setError(
        "Không kết nối được máy chủ đăng nhập. Hãy kiểm tra mạng và thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setError("");
    setBusy(true);
    try {
      const db = createSupabaseBrowser();
      const { error } = await db.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: siteUrl("/auth/callback").toString() },
      });
      if (error)
        setError(
          "Không đăng nhập được bằng Google. Kiểm tra cấu hình OAuth của dự án.",
        );
    } catch {
      setError("Không kết nối được Google. Hãy thử lại sau.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-form">
      <p className="eyebrow">CHÀO MỪNG ĐẾN HANZIFLOW</p>
      <h1>
        {signup ? "Bắt đầu hành trình mới." : "Rất vui được gặp lại bạn."}
      </h1>
      <p>
        {signup
          ? "Tạo tài khoản để giữ lại từng bước tiến của mình."
          : "Một chút tiếng Trung, một ngày thêm ý nghĩa."}
      </p>
      <div className="auth-tabs">
        <button
          type="button"
          aria-pressed={!signup}
          className={!signup ? "selected" : ""}
          onClick={() => {
            setSignup(false);
            setError("");
            setMessage("");
          }}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          aria-pressed={signup}
          className={signup ? "selected" : ""}
          onClick={() => {
            setSignup(true);
            setError("");
            setMessage("");
          }}
        >
          Tạo tài khoản
        </button>
      </div>
      {!configured && (
        <div className="auth-notice">
          Supabase chưa được cấu hình. Bạn có thể{" "}
          <Link href="/dashboard">khám phá bản thử</Link> hoặc{" "}
          <Link href="/setup">xem hướng dẫn thiết lập</Link>.
        </div>
      )}
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <div className="auth-input">
          <Mail size={17} />
          <input
            id="email"
            ref={emailInput}
            type="email"
            autoComplete="email"
            placeholder="ban@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
          />
        </div>
        <label htmlFor="password">Mật khẩu</label>
        <div className="auth-input">
          <LockKeyhole size={17} />
          <input
            id="password"
            type={visible ? "text" : "password"}
            autoComplete={signup ? "new-password" : "current-password"}
            placeholder="Ít nhất 8 ký tự"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
          />
          <button
            aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            type="button"
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
        <Button
          type="submit"
          className="auth-submit"
          disabled={!configured || busy}
        >
          {busy ? "Đang xử lý…" : signup ? "Tạo tài khoản" : "Đăng nhập"}
          <ArrowRight size={17} />
        </Button>
      </form>
      {configured && (
        <div className="auth-resend">
          <p>Chưa nhận được email hoặc liên kết đã hết hạn?</p>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || resendCooldown > 0}
            onClick={() => void resend()}
          >
            {resendCooldown > 0
              ? `Gửi lại sau ${resendCooldown}s`
              : "Gửi lại email xác nhận"}
          </Button>
        </div>
      )}
      {configured && process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" && (
        <Button
          variant="outline"
          className="google-signin"
          disabled={busy}
          onClick={() => void google()}
        >
          Tiếp tục với Google
        </Button>
      )}
      <p className="auth-footnote">
        Học vững vàng. Dữ liệu của bạn được giữ riêng tư.
      </p>
    </div>
  );
}
