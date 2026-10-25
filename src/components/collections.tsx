"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Coffee,
  GraduationCap,
  Heart,
  HeartHandshake,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Leaf,
  MessageCircle,
  MessagesSquare,
  Plane,
  Search,
  ShoppingBag,
  Smile,
  TrainFront,
  Users,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useLearning } from "./provider";
import { EmptyState, PageHeading, ProgressRing, TextLink } from "./common";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { bands, type PageResult, type Topic } from "@/lib/domain/types";
import { aggregateProgress } from "@/lib/domain/catalogue";
import { number } from "@/lib/utils";
import { VocabularyLibrary } from "./vocabulary-library";
const icons: Record<string, LucideIcon> = {
  MessagesSquare,
  House,
  HeartHandshake,
  Users,
  BriefcaseBusiness,
  GraduationCap,
  Laptop,
  Plane,
  Utensils,
  ShoppingBag,
  Wallet,
  HeartPulse,
  Heart,
  Smile,
  Coffee,
  Landmark,
  MessageCircle,
  CalendarDays,
  TrainFront,
  Building2,
};
export function TopicIcon({
  topic,
  size = 24,
}: {
  topic: Topic;
  size?: number;
}) {
  const Icon = icons[topic.icon] ?? Leaf;
  return (
    <span className={`topic-icon color-${topic.color}`}>
      <Icon size={size} />
    </span>
  );
}
export function Bands() {
  const { bootstrap, progress } = useLearning();
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="HỌC THEO LỘ TRÌNH"
        title="Vững bước cùng HSK"
        description="Từ những từ đầu tiên đến cách diễn đạt chuyên sâu. Bắt đầu ở nơi phù hợp với bạn."
      />
      <div className="collection-info">
        <Leaf size={18} />
        <span>
          Chuẩn năng lực <strong>GF 0025-2021</strong> ·{" "}
          {number(bootstrap.total)} mục từ · Tiến độ dùng chung với chủ đề
        </span>
        <TextLink href="/sources">Tìm hiểu</TextLink>
      </div>
      <div className="bands-grid">
        {bands.map((band, index) => {
          const ids = Object.keys(progress).filter((id) =>
            id.startsWith(`hsk30-b${band === "7-9" ? "79" : band}-`),
          );
          const stats = aggregateProgress(ids, progress);
          const total = bootstrap.counts[band] ?? 0;
          const percent = total ? Math.round((stats.studied / total) * 100) : 0;
          return (
            <Link
              key={band}
              href={`/bands/${band}`}
              className="card full-band-card"
            >
              <div className="full-band-top">
                <span className={`band-symbol band-symbol-${(index % 3) + 1}`}>
                  {["一", "二", "三", "四", "五", "六", "九"][index]}
                </span>
                <ArrowRight size={18} />
              </div>
              <span className="small-label">
                {index < 3 ? "SƠ CẤP" : index < 6 ? "TRUNG CẤP" : "CAO CẤP"}
              </span>
              <h2>Band {band}</h2>
              <p>{number(total)} mục từ</p>
              <ProgressRing percent={percent} size={92} />
              <div className="band-card-bottom">
                <span>{stats.studied} đã học</span>
                <span>{stats.mastered} thành thạo</span>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="content-note">
        Đây là các Band của chuẩn năng lực 2021. Phân cấp từ vựng khác với đề
        cương thi HSK công bố năm 2025.
      </p>
    </div>
  );
}
export function Topics() {
  const { bootstrap, progress } = useLearning();
  const [query, setQuery] = useState("");
  const [onlyContent, setOnlyContent] = useState(false);
  const topics = bootstrap.topics.filter(
    (t) =>
      t.name.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")) &&
      (!onlyContent || (bootstrap.topicCounts[t.id] ?? 0) > 0),
  );
  return (
    <div className="page-enter">
      <PageHeading
        eyebrow="HỌC TỪ CUỘC SỐNG"
        title="Điều gì khiến bạn tò mò?"
        description="Chọn một chủ đề gần gũi. Biến từ mới thành một phần trong ngày của bạn."
      />
      <div className="topics-toolbar">
        <div className="search-input">
          <Search size={18} />
          <input
            placeholder="Tìm chủ đề bạn yêu thích…"
            aria-label="Tìm chủ đề"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={onlyContent}
            onChange={(e) => setOnlyContent(e.target.checked)}
          />
          Có từ vựng đã phân loại
        </label>
      </div>
      <div className="topics-grid">
        {topics.map((t) => {
          const ids = bootstrap.topicEntryIds[t.id] ?? [];
          const stats = aggregateProgress(ids, progress);
          return (
            <Link
              key={t.id}
              href={`/topics/${t.id}`}
              className="card topic-card"
            >
              <div className="topic-card-top">
                <TopicIcon topic={t} />
                <ArrowRight size={17} />
              </div>
              <h2>{t.name}</h2>
              <p>{t.description}</p>
              <div className="topic-card-footer">
                <span>
                  {ids.length
                    ? `${number(ids.length)} mục từ`
                    : "Đang bổ sung nội dung"}
                </span>
                {ids.length > 0 && <span>{stats.percent}%</span>}
              </div>
              {ids.length > 0 && (
                <div className="mini-progress">
                  <span style={{ width: `${stats.percent}%` }} />
                </div>
              )}
            </Link>
          );
        })}
      </div>
      {!topics.length && (
        <EmptyState
          title="Chưa tìm thấy chủ đề"
          description="Thử một từ khóa khác hoặc xem tất cả chủ đề."
        />
      )}
      <div className="collection-info">
        <BookOpen size={18} />
        <span>
          Từ được phân loại theo chữ Hán và nghĩa từ điển. Một từ có thể thuộc
          nhiều chủ đề và luôn dùng chung tiến độ học.
        </span>
        <TextLink href="/sources">Quy trình dữ liệu</TextLink>
      </div>
    </div>
  );
}
export function CollectionDetail({
  band,
  topic,
  initial,
}: {
  band?: string;
  topic?: Topic;
  initial: PageResult;
}) {
  const { bootstrap, progress, preferences } = useLearning();
  const [tab, setTab] = useState<"words" | "lessons">("words");
  const [lessonPage, setLessonPage] = useState(1);
  const total = band
    ? (bootstrap.counts[band] ?? 0)
    : (bootstrap.topicCounts[topic!.id] ?? 0);
  const ids = band
    ? Array.from(
        { length: total },
        (_, i) =>
          `hsk30-b${band === "7-9" ? "79" : band}-${String(i + 1).padStart(4, "0")}`,
      )
    : (bootstrap.topicEntryIds[topic!.id] ?? []);
  const stats = aggregateProgress(ids, progress);
  const lessonCount = Math.ceil(total / preferences.lessonSize);
  const query = band ? `band=${band}` : `topic=${topic!.id}`;
  return (
    <div className="page-enter">
      <Link href={band ? "/bands" : "/topics"} className="back-link">
        <ArrowLeft size={15} />
        {band ? "Tất cả HSK Bands" : "Tất cả chủ đề"}
      </Link>
      <PageHeading
        eyebrow={band ? "LỘ TRÌNH HSK · CHUẨN 2021" : "CHỦ ĐỀ HỌC TẬP"}
        title={band ? `HSK Band ${band}` : topic!.name}
        description={
          band
            ? "Xây dựng vốn từ bền vững, theo thứ tự của bộ nguồn."
            : topic!.description
        }
      >
        <Button asChild disabled={!total}>
          <Link href={total ? `/flashcards?${query}` : "#collection-words"}>
            <BookOpen size={17} />
            Học flashcards
            <ArrowRight size={16} />
          </Link>
        </Button>
      </PageHeading>
      <div className="collection-stats">
        <Card>
          <span>Tổng mục từ</span>
          <strong>{number(total)}</strong>
        </Card>
        <Card>
          <span>Đã học</span>
          <strong>{number(stats.studied)}</strong>
        </Card>
        <Card>
          <span>Thành thạo</span>
          <strong>{number(stats.mastered)}</strong>
        </Card>
        <Card>
          <span>Tiến độ học</span>
          <strong>
            {stats.percent}
            <small>%</small>
          </strong>
        </Card>
      </div>
      <div className="collection-progress-strip">
        <div className="mini-progress">
          <span style={{ width: `${stats.percent}%` }} />
        </div>
        <span>Tiến độ này được dùng chung ở mọi lộ trình.</span>
      </div>
      <div className="section-tabs" role="tablist" aria-label="Nội dung bộ từ">
        <button
          role="tab"
          id="words-tab"
          aria-controls="collection-words"
          aria-selected={tab === "words"}
          onClick={() => setTab("words")}
        >
          Danh sách từ vựng<span>{number(total)}</span>
        </button>
        <button
          role="tab"
          id="lessons-tab"
          aria-controls="collection-lessons"
          aria-selected={tab === "lessons"}
          onClick={() => setTab("lessons")}
        >
          Nhóm học<span>{lessonCount}</span>
        </button>
      </div>
      {tab === "words" ? (
        <div role="tabpanel" id="collection-words" aria-labelledby="words-tab">
          <VocabularyLibrary
            initial={initial}
            band={band}
            topic={topic?.id}
            embedded
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="collection-lessons"
          aria-labelledby="lessons-tab"
        >
          <div className="section-title">
            <p>
              Mỗi nhóm {preferences.lessonSize} từ ·{" "}
              <Link className="text-link" href="/settings">
                Đổi số từ
              </Link>
            </p>
            <p className="muted">
              Hoàn thành nhóm học không đồng nghĩa với thành thạo.
            </p>
          </div>
          {lessonCount ? (
            <>
              <div className="lessons-grid">
                {Array.from(
                  { length: Math.min(12, lessonCount - (lessonPage - 1) * 12) },
                  (_, i) => {
                    const index = (lessonPage - 1) * 12 + i;
                    const lessonIds = ids.slice(
                      index * preferences.lessonSize,
                      (index + 1) * preferences.lessonSize,
                    );
                    const done = aggregateProgress(lessonIds, progress);
                    return (
                      <Link
                        key={index}
                        href={`/flashcards?${query}&lesson=${index + 1}`}
                        className="card lesson-card"
                      >
                        <span
                          className={`lesson-number ${done.studied === lessonIds.length ? "complete" : ""}`}
                        >
                          {done.studied === lessonIds.length ? (
                            <Check size={18} />
                          ) : (
                            String(index + 1).padStart(2, "0")
                          )}
                        </span>
                        <div>
                          <h3>Nhóm từ {index + 1}</h3>
                          <p>
                            {lessonIds.length} từ · {done.studied} đã học
                          </p>
                        </div>
                        <ChevronRight size={17} />
                      </Link>
                    );
                  },
                )}
              </div>
              <div className="lesson-pagination">
                <Button
                  variant="outline"
                  disabled={lessonPage <= 1}
                  onClick={() => setLessonPage((p) => p - 1)}
                >
                  Trước
                </Button>
                <span>
                  {lessonPage} / {Math.ceil(lessonCount / 12)}
                </span>
                <Button
                  variant="outline"
                  disabled={lessonPage * 12 >= lessonCount}
                  onClick={() => setLessonPage((p) => p + 1)}
                >
                  Sau
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              title="Chủ đề đang chờ bổ sung"
              description="Chưa có mục từ được phân loại vào chủ đề này. Bạn có thể học theo HSK Band trong lúc chờ nội dung."
            />
          )}
        </div>
      )}
      {topic && (
        <p className="content-note">
          Phân bố HSK:{" "}
          {bands
            .map((b) => {
              const count = ids.filter((id) =>
                id.startsWith(`hsk30-b${b === "7-9" ? "79" : b}-`),
              ).length;
              return count ? `Band ${b}: ${count}` : null;
            })
            .filter(Boolean)
            .join(" · ") || "Chưa có dữ liệu phân loại"}
          .
        </p>
      )}
    </div>
  );
}
