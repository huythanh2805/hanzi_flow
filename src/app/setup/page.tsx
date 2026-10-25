import Link from "next/link";
import { PublicDocument } from "@/components/public-document";
import { supabaseConfigured } from "@/lib/supabase/config";
export const metadata = { title: "Thiết lập tài khoản" };
export const dynamic = "force-dynamic";
export default function SetupPage() {
  return (
    <PublicDocument>
      <p className="eyebrow">KẾT NỐI TIẾN ĐỘ CỦA BẠN</p>
      <h1>Sẵn sàng học trên mọi thiết bị.</h1>
      <p>
        {supabaseConfigured()
          ? "Ứng dụng đã có cấu hình kết nối Supabase. Hãy đảm bảo đã tạo bảng và nhập dữ liệu trước khi đăng nhập."
          : "Bản thử chỉ lưu tiến độ trên trình duyệt. Cấu hình Supabase để đăng nhập và lưu theo tài khoản."}
      </p>
      <section className="card">
        <h2>1. Cấu hình môi trường</h2>
        <p>
          Tạo <code>.env.local</code> từ <code>.env.example</code> trong thư mục
          dự án. URL và publishable key lấy trong Settings → API Keys của
          Supabase.
        </p>
        <pre>
          {
            "NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...\nSUPABASE_SECRET_KEY=sb_secret_...\nNEXT_PUBLIC_SITE_URL=http://localhost:3000"
          }
        </pre>
        <p>
          Secret key chỉ dùng cho lệnh import chạy trên máy chủ. Không đưa nó
          vào biến NEXT_PUBLIC hoặc mã giao diện.
        </p>
      </section>
      <section className="card">
        <h2>2. Tạo bảng & nhập dữ liệu</h2>
        <p>
          Chạy các file trong <code>supabase/migrations</code> theo thứ tự tên
          trong Supabase SQL Editor, hoặc dùng Supabase CLI để áp dụng
          migration. Sau đó chạy:
        </p>
        <pre>
          {"npm run data:prepare\nnpm run data:enrichment\nnpm run data:import"}
        </pre>
        <p>
          Import giữ 11.092 mã nguồn và không cập nhật bảng tiến độ cá nhân. Có
          thể chạy lại khi cần.
        </p>
      </section>
      <section className="card">
        <h2>3. Bật đăng nhập</h2>
        <p>
          Trong Supabase Authentication, bật Email/password. Đặt Site URL và
          thêm redirect URL <code>http://localhost:3000/auth/callback</code>;
          khi đưa lên Vercel, thêm URL callback của tên miền thật. Bật xác nhận
          email nếu cần.
        </p>
        <p>
          Đăng nhập Google là tùy chọn: chỉ đặt{" "}
          <code>NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true</code> sau khi cấu hình
          Google OAuth và callback trong Supabase.
        </p>
        <p>
          Khởi động lại máy chủ sau khi thay đổi file môi trường, rồi{" "}
          <Link href="/login">tạo tài khoản hoặc đăng nhập</Link>.
        </p>
      </section>
      <section className="card">
        <h2>Triển khai Vercel</h2>
        <p>
          Import repository vào Vercel với preset Next.js. Cấu hình hai biến
          NEXT_PUBLIC_SUPABASE, SITE_URL và redirect URL. Secret key import
          không cần đưa lên Vercel nếu không chạy tác vụ quản trị ở đó. Tiến độ
          bản thử độc lập với tiến độ tài khoản.
        </p>
      </section>
    </PublicDocument>
  );
}
