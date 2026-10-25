"use client";
import { exerciseLabels } from "@/lib/domain/practice-exercises";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  RotateCcw,
} from "lucide-react";
import { useLearning } from "../provider";
import { LoadingState, PageHeading } from "../common";
import { Button } from "../ui/button";
import { PracticeFeedbackView } from "./player";
import {
  practiceResultIds,
  readPractice,
  startPractice,
} from "@/lib/practice-client";
import type { PracticeBatch } from "@/lib/domain/practice";
import { number } from "@/lib/utils";
import { AddToDecksButton } from "../decks/add-dialog";
export function PracticeResult({ sessionId }: { sessionId: string }) {
  const { ready } = useLearning();
  return ready ? (
    <Result sessionId={sessionId} />
  ) : (
    <LoadingState label="Đang mở kết quả…" />
  );
}
function Result({ sessionId }: { sessionId: string }) {
  const { bootstrap, progress, markPracticeDifficult } = useLearning(),
    router = useRouter(),
    mode = bootstrap.mode;
  const [data, setData] = useState<PracticeBatch | null>(null),
    [ids, setIds] = useState<{
      all: string[];
      wrong: string[];
      marked: string[];
    }>({ all: [], wrong: [], marked: [] });
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progressText, setProgressText] = useState("");
  const request = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    readPractice(mode, sessionId, 0)
      .then(async (batch) => {
        if (batch.session.status !== "submitted") {
          router.replace(`/practice/${sessionId}`);
          return;
        }
        const [all, wrong, marked] = await Promise.all([
          practiceResultIds(mode, sessionId, "all"),
          practiceResultIds(mode, sessionId, "wrong"),
          practiceResultIds(mode, sessionId, "marked"),
        ]);
        if (active) {
          setData(batch);
          setIds({ all, wrong, marked });
          setSelected(new Set(wrong));
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Không tải được kết quả.");
      });
    return () => {
      active = false;
    };
  }, [mode, sessionId, router]);
  async function changePage(next: number) {
    if (busy) return;
    setBusy(true);
    try {
      const batch = await readPractice(mode, sessionId, next * 25);
      setData(batch);
      setPage(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được trang.");
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    if (!data || !selected.size || busy) return;
    setBusy(true);
    setError("");
    const requestId = request.current ?? crypto.randomUUID();
    request.current = requestId;
    try {
      const session = await startPractice(
        mode,
        {
          requestId,
          source: { kind: "retry", parentId: sessionId, ids: [...selected] },
          mode: "learn",
          direction: data.session.direction,
          language: data.session.language,
          lessonSize: data.session.lessonSize as 10 | 15 | 20 | 25 | 30,
        },
        progress,
        (done, total) =>
          setProgressText(
            `Đang chuẩn bị ${number(done)} / ${number(total)} câu`,
          ),
      );
      router.push(`/practice/${session.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không tạo được lượt luyện lại.",
      );
      setBusy(false);
    }
  }
  function select(values: string[]) {
    setSelected(new Set(values));
    request.current = null;
  }
  if (!data)
    return error ? (
      <div className="card practice-error" role="alert">
        <h1>Chưa tải được kết quả.</h1>
        <p>{error}</p>
        <Link href="/practice">Về Luyện tập</Link>
      </div>
    ) : (
      <LoadingState label="Đang tổng hợp kết quả…" />
    );
  const s = data.session,
    percent = Math.round(((s.correct ?? 0) / s.total) * 100);
  return (
    <div className="page-enter practice-page practice-result">
      <Link href="/practice" className="back-link">
        <ArrowLeft size={16} />
        Luyện tập
      </Link>
      <PageHeading
        eyebrow={s.parentId ? "KẾT QUẢ LƯỢT BỔ SUNG" : "KẾT QUẢ LƯỢT ĐẦU"}
        title={`${percent}% câu trả lời đúng.`}
        description={s.title}
      />
      {s.typeStats && (
        <div className="practice-exercise-preview">
          <small>Theo dạng bài · đúng / đã trả lời</small>
          <p>
            {Object.entries(s.typeStats)
              .filter(([, v]) => v.answered > 0)
              .map(
                ([type, v]) =>
                  `${exerciseLabels[type as keyof typeof exerciseLabels]}: ${v.correct}/${v.answered}`,
              )
              .join(" · ")}
          </p>
        </div>
      )}
      <div className="practice-result-stats">
        {[
          ["Tổng số câu", s.total],
          ["Đúng", s.correct ?? 0],
          ["Sai", s.wrong ?? 0],
          ["Bỏ trống", s.unanswered],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <span>{label}</span>
            <strong>{number(Number(value))}</strong>
          </div>
        ))}
      </div>
      <p className="content-note">
        {s.mode === "exam"
          ? "Điểm được tính theo lựa chọn khi nộp bài."
          : "Điểm được tính theo lần trả lời đầu tiên của mỗi từ."}{" "}
        Luyện lại tạo lượt riêng và không thay đổi điểm bài này. Hoàn thành bài
        không đồng nghĩa với Thành thạo.
      </p>
      {!!s.repeatAnswered && (
        <p className="content-note">
          Hỏi lại trong buổi: {number(s.repeatAnswered)} lượt ·{" "}
          {number(s.repeatCorrect ?? 0)} đúng. Điểm lượt đầu ở trên giữ nguyên.
        </p>
      )}
      {s.parentId && (
        <Link href={`/practice/${s.parentId}/result`} className="text-link">
          Xem bài gốc <ArrowRight size={14} />
        </Link>
      )}
      <section className="card practice-result-list">
        <div className="practice-section-title">
          <RotateCcw size={21} />
          <div>
            <h2>Chọn từ để luyện lại</h2>
            <p>
              Đang chọn {number(selected.size)} / {number(s.total)} mục từ.
            </p>
          </div>
        </div>
        <div className="practice-result-filters">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => select(ids.wrong)}
          >
            Từ sai / bỏ trống ({number(ids.wrong.length)})
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => select(ids.marked)}
          >
            Đã đánh dấu ({number(ids.marked.length)})
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => select(ids.all)}
          >
            Chọn tất cả
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => select([])}>
            Bỏ chọn
          </Button>
        </div>
        {data.questions.map(
          (q) =>
            q.feedback && (
              <details className="practice-result-word" key={q.ordinal}>
                <summary>
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${q.feedback!.word} (${q.ordinal + 1})`}
                    disabled={busy}
                    checked={selected.has(q.feedback!.vocabularyId)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const id = q.feedback!.vocabularyId;
                      setSelected((old) => {
                        const next = new Set(old);
                        if (e.target.checked) next.add(id);
                        else next.delete(id);
                        return next;
                      });
                      request.current = null;
                    }}
                  />
                  <span className="practice-result-word-label">
                    <strong lang="zh-CN">{q.feedback!.word}</strong>
                    <span>{q.feedback!.pinyin}</span>
                  </span>
                  <span
                    className={`practice-result-status ${q.selectedOptionId ? (q.feedback.isCorrect ? "correct" : "incorrect") : ""}`}
                  >
                    {!q.selectedOptionId
                      ? "Bỏ trống"
                      : q.feedback.isCorrect
                        ? "Đúng"
                        : "Sai"}
                  </span>
                </summary>
                <PracticeFeedbackView feedback={q.feedback} />
              </details>
            ),
        )}
        <div className="lesson-pagination">
          <Button
            variant="outline"
            disabled={busy || page === 0}
            onClick={() => void changePage(page - 1)}
          >
            Trước
          </Button>
          <span>
            {page + 1} / {Math.ceil(s.total / 25)}
          </span>
          <Button
            variant="outline"
            disabled={busy || (page + 1) * 25 >= s.total}
            onClick={() => void changePage(page + 1)}
          >
            Sau
          </Button>
        </div>
        <div className="practice-result-actions">
          <AddToDecksButton ids={[...selected]} disabled={busy}/>
          <Button
            disabled={busy || !selected.size}
            onClick={() => void retry()}
          >
            <RotateCcw size={17} />
            Luyện lại {number(selected.size)} từ
          </Button>
          <Button
            variant="outline"
            disabled={busy || !selected.size}
            onClick={async () => {
              setBusy(true);
              await markPracticeDifficult(sessionId, [...selected]);
              setBusy(false);
            }}
          >
            <Bookmark size={17} />
            Lưu vào Từ khó
          </Button>
        </div>
        {busy && (
          <p role="status" className="content-note">
            {progressText || "Đang lưu…"}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <Button asChild variant="ghost">
        <Link href="/practice">
          <Check size={17} />
          Chọn bài luyện khác
        </Link>
      </Button>
    </div>
  );
}
