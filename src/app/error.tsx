"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <span className="brand-mark">汉</span>
      <h1>Chưa thể mở không gian học.</h1>
      <p>
        Kiểm tra kết nối và cấu hình cơ sở dữ liệu. Nếu vừa kết nối Supabase,
        hãy chạy migration và import trước.
      </p>
      <button className="button button-primary" onClick={reset}>
        Thử lại
      </button>
      <Link href="/setup">Hướng dẫn thiết lập</Link>
    </main>
  );
}
