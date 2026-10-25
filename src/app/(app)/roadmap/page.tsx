import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
export const metadata = { title: "Lộ trình phát triển" };
export default function RoadmapPage() {
  return (
    <div className="prose-page page-enter">
      <Link className="back-link" href="/dashboard">
        <ArrowLeft size={15} />
        Về tổng quan
      </Link>
      <p className="eyebrow">PHÁT TRIỂN TỪNG BƯỚC</p>
      <h1>Đi xa, từ một nền tảng vững.</h1>
      <p>
        HanziFlow hiện tập trung vào thư viện, học theo Band/chủ đề và
        flashcards và luyện chữ–nghĩa. Các phần dưới đây mô tả hướng phát triển
        tiếp theo.
      </p>
      <section className="card" id="review">
        <span className="small-label">PHASE 2</span>
        <h2>Ôn tập đúng lúc</h2>
        <p>
          Lịch ôn FSRS, hàng đợi hằng ngày, lịch sử ôn và tiếp tục phiên đang
          học.
        </p>
      </section>
      <section className="card" id="practice">
        <span className="small-label">PHASE 2</span>
        <h2>Vận dụng điều đã học</h2>
        <p>
          Luyện chữ–nghĩa đã có thể sử dụng theo nhóm, toàn Band hoặc bộ từ cá
          nhân. Luyện nghe và gõ từ sẽ được bổ sung sau.
        </p>
        <Link className="text-link" href="/practice">
          Mở Luyện tập →
        </Link>
      </section>
      <section className="card" id="decks">
        <span className="small-label">PHASE 3</span>
        <h2>Bộ từ của riêng bạn</h2>
        <p>
          Tạo và sắp xếp bộ từ cá nhân, học với nhiều dạng bài tập và ghi âm
          phát âm.
        </p>
      </section>
      <section className="card" id="analytics">
        <span className="small-label">PHASE 3</span>
        <h2>Nhìn thấy hành trình</h2>
        <p>
          Thống kê từ dữ liệu học thực tế, chuỗi ngày học, biểu đồ hoạt động và
          dự báo ôn tập.
        </p>
      </section>
      <Link className="text-link" href="/vocabulary">
        <BookOpen size={17} />
        Khám phá thư viện hiện tại
      </Link>
    </div>
  );
}
