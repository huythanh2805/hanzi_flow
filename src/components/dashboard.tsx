"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCheck,
  ChevronRight,
  Flower2,
  Headphones,
  Leaf,
  Plus,
  Target,
} from "lucide-react";
import { useLearning } from "./provider";
import { PageHeading, ProgressRing, SpeakButton, TextLink } from "./common";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { number } from "@/lib/utils";
import { studiedToday } from "@/lib/domain/progress";
import { bands } from "@/lib/domain/types";
export function Dashboard() {
  const { bootstrap, progress, preferences, ready } = useLearning();
  const records = Object.values(progress);
  const studied = records.filter((v) => v.state !== "NEW").length;
  const mastered = records.filter((v) => v.state === "MASTERED").length;
  const favorites = records.filter((v) => v.favorite).length;
  const today = studiedToday(progress, preferences.timeZone);
  const percent = Math.min(
    100,
    Math.round((today / preferences.dailyGoal) * 100),
  );
  const featured = bootstrap.featured[0];
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="MỘT CHÚT MỖI NGÀY"
        title={`Chào ${bootstrap.user?.name ?? "bạn"}, cùng học nhé.`}
        description="Mỗi từ mới là một bước gần hơn với thế giới rộng lớn."
      >
        <span className="greeting-stamp">
          <Leaf size={16} /> Học đều, nhớ lâu
        </span>
      </PageHeading>
      <div className="dashboard-top">
        <Card className="daily-plan">
          <div className="section-top">
            <div>
              <p className="small-label">DÀNH CHO BẠN</p>
              <h2>Kế hoạch hôm nay</h2>
            </div>
            <Link
              href="/settings"
              className="subtle-link"
              aria-label="Điều chỉnh mục tiêu học"
            >
              <Target size={17} />
            </Link>
          </div>
          <div className="plan-content">
            <ProgressRing percent={ready ? percent : 0} size={128}>
              <strong>
                {ready ? percent : 0}
                <small>%</small>
              </strong>
              <span>mục tiêu ngày</span>
            </ProgressRing>
            <div className="plan-tasks">
              <div>
                <span
                  className={`task-icon ${today >= preferences.dailyGoal ? "complete" : ""}`}
                >
                  {today >= preferences.dailyGoal ? (
                    <Check size={13} />
                  ) : (
                    <BookOpen size={13} />
                  )}
                </span>
                <span>Học {preferences.dailyGoal} từ mới</span>
                <strong>
                  {ready ? Math.min(today, preferences.dailyGoal) : 0}
                  <small> / {preferences.dailyGoal}</small>
                </strong>
              </div>
              <div>
                <span className="task-icon task-muted">
                  <CheckCheck size={13} />
                </span>
                <span>Ôn tập ngắt quãng</span>
                <span className="phase-label">Phase 2</span>
              </div>
              <div>
                <span className="task-icon task-muted">
                  <Headphones size={13} />
                </span>
                <span>Luyện nghe mỗi ngày</span>
                <span className="phase-label">Phase 2</span>
              </div>
            </div>
          </div>
          <Button asChild className="continue-button">
            <Link href={`/flashcards?band=${preferences.preferredBand}`}>
              {today > 0 ? "Tiếp tục học" : "Bắt đầu buổi học"}
              <ArrowRight size={17} />
            </Link>
          </Button>
          <p className="card-footnote">Từng bước nhỏ tạo nên thay đổi lớn.</p>
        </Card>
        <Card className="journey-card">
          <div className="journey-copy">
            <span className="pill">
              <Flower2 size={13} /> Hành trình của riêng bạn
            </span>
            <h2>
              Ngôn ngữ mới.
              <br />
              Chân trời mới.
            </h2>
            <p>
              Không cần học thật nhanh.
              <br />
              Chỉ cần tiếp tục mỗi ngày.
            </p>
            <Link href="/bands">
              Khám phá lộ trình <ArrowUpRight size={16} />
            </Link>
          </div>
          <span className="journey-character" aria-hidden="true">
            学
          </span>
        </Card>
      </div>
      <div className="stat-grid">
        {[
          {
            label: "Từ vựng đã học",
            value: studied,
            icon: BookOpen,
            note: "Mục từ có tiến độ",
          },
          {
            label: "Đã thành thạo",
            value: mastered,
            icon: CheckCheck,
            note: "Theo tiêu chí ôn tập",
          },
          {
            label: "Từ đã lưu",
            value: favorites,
            icon: Bookmark,
            note: "Bộ sưu tập của bạn",
          },
          {
            label: "Từ mới hôm nay",
            value: today,
            icon: Target,
            note: `Mục tiêu ${preferences.dailyGoal} từ / ngày`,
          },
        ].map((s) => (
          <Card className="stat-card" key={s.label}>
            <div>
              <span>{s.label}</span>
              <s.icon size={17} />
            </div>
            <strong>{ready ? number(s.value) : "—"}</strong>
            <p>{s.note}</p>
          </Card>
        ))}
      </div>
      <div className="section-title">
        <div>
          <h2>Lộ trình HSK của bạn</h2>
          <p>Vững nền tảng. Tự tin tiến xa.</p>
        </div>
        <TextLink href="/bands">Tất cả các Band</TextLink>
      </div>
      <div className="dashboard-bands">
        {bands.slice(0, 3).map((band, index) => {
          const done = records.filter(
            (p) =>
              p.state !== "NEW" &&
              p.vocabulary_id.startsWith(`hsk30-b${band}-`),
          ).length;
          const total = bootstrap.counts[band] ?? 0;
          return (
            <Link
              href={`/bands/${band}`}
              className="card dashboard-band"
              key={band}
            >
              <div className="band-card-top">
                <span className={`band-symbol band-symbol-${index + 1}`}>
                  {["一", "二", "三"][index]}
                </span>
                <span className="band-level">
                  {["KHỞI ĐẦU", "NỀN TẢNG", "MỞ RỘNG"][index]}
                </span>
                <ChevronRight size={17} />
              </div>
              <h3>HSK Band {band}</h3>
              <p>
                {number(total)} mục từ <span>·</span> Chuẩn 2021
              </p>
              <div className="mini-progress">
                <span
                  style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                />
              </div>
              <div className="band-progress-label">
                <span>{number(done)} từ đã học</span>
                <strong>{total ? Math.round((done / total) * 100) : 0}%</strong>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="dashboard-bottom">
        <Card className="word-discovery">
          <div className="section-top">
            <div>
              <span className="small-label">MỘT TỪ, MỘT KHÁM PHÁ</span>
              <h2>Chạm vào ngôn ngữ</h2>
            </div>
            <span className="outline-pill">Band {featured?.band ?? "1"}</span>
          </div>
          {featured ? (
            <>
              <div className="discovery-word">
                <span lang="zh-CN">{featured.word}</span>
                <div>
                  <strong>{featured.pinyin}</strong>
                  <p>
                    {featured.senses[0]?.[preferences.language] ??
                      "Chưa có nghĩa ở ngôn ngữ này"}
                  </p>
                </div>
                <SpeakButton
                  word={featured.word}
                  audioUrl={featured.audio_url}
                  large
                />
              </div>
              <div className="discovery-bottom">
                <span>
                  {featured.senses[0]?.source_id === "owner-design-reference-v1"
                    ? "Nghĩa từ nội dung thiết kế bạn cung cấp"
                    : "Nghĩa có nguồn xác định"}
                </span>
                <TextLink href={`/vocabulary/${featured.id}`}>
                  Khám phá từ
                </TextLink>
              </div>
            </>
          ) : (
            <p className="content-note">
              Nhập dữ liệu từ vựng để bắt đầu khám phá.
            </p>
          )}
        </Card>
        <Card className="start-topics">
          <div className="section-top">
            <div>
              <span className="small-label">HỌC ĐIỀU GẦN GŨI</span>
              <h2>Bắt đầu từ cuộc sống</h2>
            </div>
            <Link href="/topics" aria-label="Xem tất cả chủ đề">
              <Plus size={18} />
            </Link>
          </div>
          {bootstrap.topics
            .filter((t) => (bootstrap.topicCounts[t.id] ?? 0) > 0)
            .slice(0, 3)
            .map((topic) => (
              <Link
                href={`/topics/${topic.id}`}
                className="topic-row"
                key={topic.id}
              >
                <span className={`topic-dot color-${topic.color}`}>
                  <Leaf size={16} />
                </span>
                <div>
                  <strong>{topic.name}</strong>
                  <span>
                    {bootstrap.topicCounts[topic.id]} mục từ đã phân loại
                  </span>
                </div>
                <ChevronRight size={17} />
              </Link>
            ))}
          <p className="card-footnote">Tiến độ dùng chung với lộ trình HSK.</p>
        </Card>
      </div>
    </div>
  );
}
