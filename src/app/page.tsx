import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Leaf,
  Layers3,
  Shapes,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { SceneArtwork } from "@/components/app-ambience";
import { Button } from "@/components/ui/button";
export default function WelcomePage() {
  return (
    <div className="welcome-page">
      <header className="welcome-header">
        <Link href="/" aria-label="HanziFlow">
          <Brand />
        </Link>
        <div>
          <Link href="/sources" className="welcome-about">
            Về bộ từ vựng
            <ArrowUpRight size={13} />
          </Link>
          <Button asChild variant="outline">
            <Link href="/login">
              Đăng nhập
              <ArrowRight size={15} />
            </Link>
          </Button>
        </div>
      </header>
      <main className="welcome-main">
        <div className="welcome-copy">
          <span className="welcome-eyebrow">
            <span className="status-dot" /> HỌC TỪNG CHÚT. TIẾN XA HƠN.
          </span>
          <h1>
            Mỗi từ mới,
            <br />
            một <em>chân trời.</em>
          </h1>
          <p>
            Khám phá tiếng Trung theo cách của bạn.
            <br />
            Học có lộ trình. Ghi nhớ bền vững.
            <br />
            Tự tin sử dụng trong cuộc sống.
          </p>
          <div className="welcome-actions">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Bắt đầu học ngay
                <ArrowRight size={18} />
              </Link>
            </Button>
            <Link href="/bands">
              Khám phá lộ trình <ArrowUpRight size={16} />
            </Link>
          </div>
          <p className="welcome-benefit">
            <Check size={14} /> HSK & chủ đề <span>·</span>
            <Check size={14} />
            Tiến độ của riêng bạn
          </p>
        </div>
        <div className="welcome-art">
          <SceneArtwork className="welcome-landscape" />
          <div className="welcome-art-caption">
            <span lang="zh-CN">学无止境</span>
            <p>Việc học không có điểm dừng.</p>
          </div>
          <span className="welcome-art-seal">
            学<br />习
          </span>
          <span className="welcome-float-card">
            <span className="float-symbol" lang="zh-CN">
              你好
            </span>
            <span>
              <strong>Một lời chào.</strong>
              <small>Một khởi đầu mới.</small>
            </span>
            <Leaf size={20} />
          </span>
        </div>
      </main>
      <div className="welcome-features">
        <div>
          <span>
            <Layers3 size={20} />
          </span>
          <p>
            <strong>Một lộ trình rõ ràng</strong>
            <small>7 nhóm Band · Chuẩn năng lực 2021</small>
          </p>
        </div>
        <div>
          <span>
            <Shapes size={20} />
          </span>
          <p>
            <strong>Gần gũi với cuộc sống</strong>
            <small>Khám phá từ vựng theo chủ đề</small>
          </p>
        </div>
        <div>
          <span>
            <BookOpen size={20} />
          </span>
          <p>
            <strong>Học để nhớ lâu hơn</strong>
            <small>Flashcards và tiến độ dùng chung</small>
          </p>
        </div>
      </div>
      <footer className="welcome-footer">
        <span>HanziFlow · Nuôi một thói quen, mở một thế giới.</span>
        <Link href="/sources">
          Nguồn & giấy phép <ArrowUpRight size={12} />
        </Link>
      </footer>
    </div>
  );
}
