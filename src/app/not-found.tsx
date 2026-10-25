import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <span className="brand-mark">汉</span>
      <p className="eyebrow">404</p>
      <h1>Chưa tìm thấy trang này.</h1>
      <p>Đường dẫn hoặc mã từ vựng không tồn tại.</p>
      <Link className="button button-primary" href="/dashboard">
        Về tổng quan
      </Link>
    </main>
  );
}
