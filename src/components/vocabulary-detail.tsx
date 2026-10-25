"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  CircleHelp,
  Flag,
  Layers3,
  Pause,
  Play,
  ShieldCheck,
} from "lucide-react";
import { useLearning } from "./provider";
import { SpeakButton, StatusBadge } from "./common";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import type { Vocabulary } from "@/lib/domain/types";
export function VocabularyDetail({
  vocabulary: v,
}: {
  vocabulary: Vocabulary;
}) {
  const { bootstrap, progress, pending, ready, preferences, mutate, notify } =
    useLearning();
  const [tab, setTab] = useState("meaning");
  const p = progress[v.id];
  const disabled = !ready || pending[v.id];
  return (
    <div className="page-enter detail-page">
      <Link href="/vocabulary" className="back-link">
        <ArrowLeft size={15} />
        Thư viện từ vựng
      </Link>
      <div className="detail-layout">
        <div>
          <div className="detail-word-header">
            <div className="detail-glyph" lang="zh-CN">
              {v.word}
            </div>
            <SpeakButton word={v.word} audioUrl={v.audio_url} large />
          </div>
          <p className="detail-pinyin">{v.pinyin}</p>
          <div className="detail-badges">
            <Link href={`/bands/${v.band}`} className="pill">
              HSK Band {v.band}
            </Link>
            {v.topics.map((id) => (
              <Link className="outline-pill" key={id} href={`/topics/${id}`}>
                {bootstrap.topics.find((t) => t.id === id)?.name ?? id}
              </Link>
            ))}
            <StatusBadge state={p?.state} />
          </div>
          <div
            className="section-tabs"
            role="tablist"
            aria-label="Thông tin từ vựng"
          >
            {[
              { id: "meaning", name: "Ý nghĩa" },
              { id: "examples", name: "Ví dụ" },
              { id: "history", name: "Tiến độ" },
              { id: "source", name: "Nguồn" },
            ].map((t) => (
              <button
                role="tab"
                id={`${t.id}-tab`}
                aria-controls={`${t.id}-panel`}
                aria-selected={tab === t.id}
                key={t.id}
                onClick={() => setTab(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <Card
            className="detail-content"
            role="tabpanel"
            id={`${tab}-panel`}
            aria-labelledby={`${tab}-tab`}
          >
            {tab === "meaning" && (
              <>
                {v.senses.length ? (
                  v.senses.map((s) => (
                    <div className="sense" key={s.id}>
                      {s.part_of_speech && (
                        <p className="small-label">{s.part_of_speech}</p>
                      )}
                      {s.vi && (
                        <p className="sense-vi">
                          <span className="definition-dot" />
                          {s.vi}
                          {s.translation_meta?.vi && (
                            <small className="muted">
                              {" "}
                              · Dịch máy, chưa duyệt
                            </small>
                          )}
                        </p>
                      )}
                      {s.en && (
                        <p className="sense-en">
                          {s.en}
                          {s.translation_meta?.en && (
                            <small> · Machine translation, unreviewed</small>
                          )}
                        </p>
                      )}
                      <p className="sense-source">
                        {s.attribution?.length ? (
                          <ContentAttribution items={s.attribution} />
                        ) : s.source_id === "owner-design-reference-v1" ? (
                          "Nguồn: nội dung thiết kế do bạn cung cấp."
                        ) : (
                          `Nguồn bổ sung: ${s.source_id}`
                        )}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="missing-definition">
                    <CircleHelp size={27} />
                    <h2>Nghĩa đang chờ bổ sung</h2>
                    <p>
                      Bộ nguồn HSK chỉ có chữ Hán và pinyin. Nghĩa sẽ xuất hiện
                      khi có nội dung với nguồn xác định.
                    </p>
                    <Link href="/sources" className="text-link">
                      Tìm hiểu quy trình bổ sung
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                )}
                <div className="detail-printed">
                  <span>Mục từ trong bản gốc</span>
                  <p lang="zh-CN">
                    {v.official_entry}
                    <small>{v.official_pinyin}</small>
                  </p>
                </div>
              </>
            )}
            {tab === "examples" && (
              <>
                {v.examples.length ? (
                  v.examples.map((e) => (
                    <div key={e.id} className="example">
                      <p lang="zh-CN">
                        {e.chinese}
                        <SpeakButton word={e.chinese} />
                      </p>
                      {e.pinyin && <p>{e.pinyin}</p>}
                      {e.vi && (
                        <p lang="vi">
                          VI: {e.vi}
                          {e.translation_meta?.vi && (
                            <small> · Dịch máy, chưa duyệt</small>
                          )}
                        </p>
                      )}
                      {e.en && (
                        <p lang="en">
                          EN: {e.en}
                          {e.translation_meta?.en && (
                            <small> · Machine translation, unreviewed</small>
                          )}
                        </p>
                      )}
                      {e.level_check && (
                        <details className="content-note">
                          <summary>Từ vựng trong câu: Band ≤ {v.band}</summary>
                          <p>
                            {e.level_check.tokens
                              .map((t) => `${t.text} (${t.band})`)
                              .join(" · ")}
                          </p>
                          <small>
                            Đã đối chiếu từ vựng theo GF 0025-2021. Ngữ pháp và
                            cách dùng trong câu chưa được giáo viên duyệt.
                          </small>
                        </details>
                      )}
                      {e.original_chinese && (
                        <p className="sense-source" lang="zh-Hant">
                          Bản gốc: {e.original_chinese} · Đã chuyển chữ bằng
                          OpenCC.
                        </p>
                      )}
                      {e.attribution && (
                        <div className="sense-source">
                          <ContentAttribution items={e.attribution} />
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="missing-definition">
                    <BookExampleIcon />
                    <h2>Chưa có ví dụ xác minh</h2>
                    <p>
                      Không có câu mẫu trong bộ dữ liệu nguồn. Nội dung sẽ được
                      bổ sung qua quy trình biên tập.
                    </p>
                  </div>
                )}
              </>
            )}
            {tab === "history" && (
              <>
                <h2>Tiến độ của bạn</h2>
                <dl className="detail-data">
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>
                      <StatusBadge state={p?.state} />
                    </dd>
                  </div>
                  <div>
                    <dt>Lần đầu đánh dấu đã học</dt>
                    <dd>
                      {p?.studied_at
                        ? new Intl.DateTimeFormat("vi-VN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: preferences.timeZone,
                          }).format(new Date(p.studied_at))
                        : "Chưa học"}
                    </dd>
                  </div>
                  <div>
                    <dt>Từ khó</dt>
                    <dd>{p?.difficult ? "Có" : "Không"}</dd>
                  </div>
                  <div>
                    <dt>Lịch ôn FSRS</dt>
                    <dd>Triển khai trong Phase 2</dd>
                  </div>
                </dl>
                <div className="content-note">
                  Đánh dấu đã học đưa từ vào trạng thái “Đang học”. Thành thạo
                  sẽ được xác định từ kết quả ôn tập.
                </div>
              </>
            )}
            {tab === "source" && (
              <>
                <h2>Nguồn dữ liệu</h2>
                <dl className="detail-data">
                  <div>
                    <dt>Mã nguồn ổn định</dt>
                    <dd>
                      <code>{v.id}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Bộ nguồn</dt>
                    <dd>HSK University · CC BY 4.0</dd>
                  </div>
                  <div>
                    <dt>Chuẩn</dt>
                    <dd>GF 0025-2021</dd>
                  </div>
                  <div>
                    <dt>Thứ tự trong Band</dt>
                    <dd>{v.source_order}</dd>
                  </div>
                </dl>
                <p className="content-note">
                  Những mục từ có cùng chữ Hán nhưng khác mã nguồn được giữ
                  riêng để bảo toàn cách đọc và nghĩa theo chuẩn.
                </p>
                <Link className="text-link" href="/sources">
                  Attribution & giấy phép
                  <ArrowRight size={15} />
                </Link>
              </>
            )}
          </Card>
        </div>
        <aside className="detail-aside">
          <Card>
            <h2>Học theo cách của bạn</h2>
            <Button asChild>
              <Link href={`/flashcards?entry=${v.id}`}>
                <Layers3 size={17} />
                Học flashcard
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button
              variant="outline"
              disabled={
                disabled || p?.state === "LEARNING" || p?.state === "MASTERED"
              }
              onClick={async () => {
                if (await mutate(v.id, { state: "LEARNING" }))
                  notify("Đã lưu tiến độ học ở mọi lộ trình.");
              }}
            >
              <Check size={17} />
              {p?.state && p.state !== "NEW"
                ? "Đã đánh dấu học"
                : "Đánh dấu đã học"}
            </Button>
            <Button
              variant="outline"
              disabled={disabled}
              aria-pressed={p?.favorite ?? false}
              onClick={() => void mutate(v.id, { favorite: !p?.favorite })}
            >
              <Bookmark
                size={17}
                fill={p?.favorite ? "currentColor" : "none"}
              />
              {p?.favorite ? "Đã lưu từ vựng" : "Lưu từ vựng"}
            </Button>
            <Button
              variant="outline"
              disabled={disabled}
              aria-pressed={p?.difficult ?? false}
              onClick={() => void mutate(v.id, { difficult: !p?.difficult })}
            >
              <Flag size={17} />
              {p?.difficult ? "Đã đánh dấu từ khó" : "Đánh dấu từ khó"}
            </Button>
            <Button
              variant="ghost"
              disabled={disabled}
              aria-pressed={p?.suspended ?? false}
              onClick={() => void mutate(v.id, { suspended: !p?.suspended })}
            >
              {p?.suspended ? <Play size={16} /> : <Pause size={16} />}{" "}
              {p?.suspended ? "Tiếp tục học từ này" : "Tạm dừng từ này"}
            </Button>
          </Card>
          <div className="shared-progress-note">
            <ShieldCheck size={21} />
            <strong>Một từ, một tiến độ</strong>
            <p>
              Dù học theo HSK hay chủ đề, mọi thay đổi đều được ghi nhận ở cùng
              một nơi.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
function ContentAttribution({
  items,
}: {
  items: NonNullable<Vocabulary["senses"][number]["attribution"]>;
}) {
  return (
    <>
      {items.map((item, i) => (
        <span key={`${item.url}-${i}`}>
          {i > 0 && " · "}
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            {item.label}
          </a>{" "}
          ({item.license})
        </span>
      ))}
    </>
  );
}
function BookExampleIcon() {
  return (
    <span className="example-glyph" aria-hidden="true">
      文
    </span>
  );
}
