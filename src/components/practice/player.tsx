"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  HardDrive,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useLearning } from "../provider";
import { LoadingState, SpeakButton } from "../common";
import { Button } from "../ui/button";
import { commitPractice, readPractice } from "@/lib/practice-client";
import type {
  PracticeBatch,
  PracticeCommand,
  PracticeFeedback,
} from "@/lib/domain/practice";
import { number } from "@/lib/utils";
import { ListeningPrompt } from "./listening-prompt";
import { MatchingPanel } from "./matching-panel";
import { QuickModeToggle, useQuickPractice } from "./quick-mode";

export function PracticeFeedbackView({
  feedback,
}: {
  feedback: PracticeFeedback;
}) {
  return (
    <div className="practice-feedback-copy">
      <div className="practice-feedback-word">
        <strong lang="zh-CN">{feedback.word}</strong>
        <span>{feedback.pinyin}</span>
        <SpeakButton word={feedback.word} />
      </div>
      <p>{feedback.meaning}</p>
      <div className="practice-feedback-links">
        <Link href={`/vocabulary/${feedback.vocabularyId}`}>
          Chi tiết từ <ArrowRight size={13} />
        </Link>
        <Link href={feedback.sourceUrl ?? "/sources"}>Nguồn nội dung</Link>
      </div>
      {feedback.translationMeta && (
        <small className="muted">Bản dịch máy chưa duyệt.</small>
      )}
    </div>
  );
}
export function PracticePlayer({ sessionId }: { sessionId: string }) {
  const { ready } = useLearning();
  return ready ? (
    <Player sessionId={sessionId} />
  ) : (
    <LoadingState label="Đang khôi phục bài luyện…" />
  );
}
function Player({ sessionId }: { sessionId: string }) {
  const quickMode = useQuickPractice();
  const [heard, setHeard] = useState<string | null>(null);
  const { bootstrap } = useLearning(),
    router = useRouter(),
    mode = bootstrap.mode;
  const [data, setData] = useState<PracticeBatch | null>(null),
    [index, setIndex] = useState(0),
    [jump, setJump] = useState("1");
  const [busy, setBusy] = useState(false),
    [hasPending, setHasPending] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<string | null>(null),
    [confirmSubmit, setConfirmSubmit] = useState(false);
  const pending = useRef<PracticeCommand | null>(null),
    lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    readPractice(mode, sessionId, 0)
      .then(async (first) => {
        if (first.session.status === "submitted") {
          router.replace(`/practice/${sessionId}/result`);
          return;
        }
        const cursor = first.session.cursor,
          offset = Math.floor(cursor / 25) * 25;
        const initial = offset
          ? await readPractice(mode, sessionId, offset)
          : first;
        if (active) {
          setData(initial);
          setIndex(cursor);
          setJump(String(cursor + 1));
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Không mở được bài luyện.");
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [mode, sessionId, router]);
  const session = data?.session,
    q = data?.questions.find((item) => item.ordinal === index);
  const hearingKey = `${sessionId}:${index}:${q?.variant ?? "primary"}`;
  const onHeard = useCallback(() => setHeard(hearingKey), [hearingKey]);
  const blocked = busy || !!(error && hasPending),
    chosen = draft ?? q?.selectedOptionId ?? null;
  const refresh = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const fresh = await readPractice(
        mode,
        sessionId,
        Math.floor(index / 25) * 25,
      );
      if (!mounted.current) return;
      setData(fresh);
      pending.current = null;
      setHasPending(false);
      setDraft(null);
      setError("");
      if (fresh.session.status === "submitted")
        router.replace(`/practice/${sessionId}/result`);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Không tải lại được bài.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [index, mode, sessionId, router]);
  const commit = useCallback(
    async (command: PracticeCommand) => {
      if (lock.current) return;
      lock.current = true;
      pending.current = command;
      setHasPending(true);
      setBusy(true);
      setError("");
      try {
        const saved = await commitPractice(mode, sessionId, command);
        if (!mounted.current) return;
        if (saved.status === "submitted") {
          pending.current = null;
          setHasPending(false);
          router.push(`/practice/${sessionId}/result`);
          return;
        }
        setData((old) => (old ? { ...old, session: saved } : old));
        let nextIndex = command.kind === "defer" ? saved.cursor : index;
        let fresh = await readPractice(
          mode,
          sessionId,
          Math.floor(nextIndex / 25) * 25,
        );
        if (!mounted.current) return;
        if (fresh.session.status === "submitted") {
          pending.current = null;
          setHasPending(false);
          router.push(`/practice/${sessionId}/result`);
          return;
        }
        const answered = fresh.questions.find(
          (item) => item.ordinal === command.ordinal,
        );
        if (
          command.kind === "answer" &&
          quickMode &&
          fresh.session.mode === "learn" &&
          answered?.feedback?.isCorrect &&
          (answered.exerciseType !== "matching" ||
            answered.board?.members.every((m) => m.resolved))
        ) {
          if ((fresh.session.pendingCount ?? fresh.session.unanswered) === 0) {
            // Keep the submit UUID for a safe retry if finishing the last answer fails.
            const finish: PracticeCommand = {
              kind: "submit",
              eventId: crypto.randomUUID(),
              revision: fresh.session.revision,
            };
            pending.current = finish;
            setData(fresh);
            setDraft(null);
            await commitPractice(mode, sessionId, finish);
            if (!mounted.current) return;
            pending.current = null;
            setHasPending(false);
            router.push(`/practice/${sessionId}/result`);
            return;
          }
          nextIndex = fresh.session.cursor;
          if (!fresh.questions.some((item) => item.ordinal === nextIndex)) {
            fresh = await readPractice(
              mode,
              sessionId,
              Math.floor(nextIndex / 25) * 25,
            );
            if (!mounted.current) return;
          }
        }
        if (
          command.kind === "answer" &&
          answered?.exerciseType === "matching"
        ) {
          const remaining =
            answered.board?.members.find(
              (m) => !m.resolved && m.ordinal === fresh.session.cursor,
            ) ?? answered.board?.members.find((m) => !m.resolved);
          if (remaining && answered.resolved) nextIndex = remaining.ordinal;
        }
        setData(fresh);
        setIndex(nextIndex);
        setJump(String(nextIndex + 1));
        setConfirmSubmit(false);
        setDraft(null);
        pending.current = null;
        setHasPending(false);
      } catch (e) {
        if (mounted.current)
          setError(
            e instanceof Error &&
              !/Minified React error|Failed to fetch|NetworkError|Load failed/.test(
                e.message,
              )
              ? e.message
              : "Chưa lưu được lựa chọn. Hãy thử lại.",
          );
      } finally {
        lock.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [index, mode, sessionId, router, quickMode],
  );
  const go = useCallback(
    async (next: number) => {
      if (
        !data ||
        lock.current ||
        pending.current ||
        next < 0 ||
        next >= data.session.total
      )
        return;
      if (data.questions.some((item) => item.ordinal === next)) {
        setIndex(next);
        setJump(String(next + 1));
        setDraft(null);
        setConfirmSubmit(false);
        return;
      }
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        const fresh = await readPractice(
          mode,
          sessionId,
          Math.floor(next / 25) * 25,
        );
        if (mounted.current) {
          setData(fresh);
          setIndex(next);
          setJump(String(next + 1));
          setDraft(null);
          setConfirmSubmit(false);
        }
      } catch (e) {
        if (mounted.current)
          setError(e instanceof Error ? e.message : "Chưa tải được câu hỏi.");
      } finally {
        lock.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [data, mode, sessionId],
  );
  const answer = useCallback(
    (optionId: string) => {
      if (
        !session ||
        !q ||
        blocked ||
        (session.mode === "learn" && q.selectedOptionId) ||
        (q.exerciseType === "listening_choice" && heard !== hearingKey)
      )
        return;
      setDraft(optionId);
      void commit({
        kind: "answer",
        eventId: crypto.randomUUID(),
        revision: session.revision,
        ordinal: index,
        optionId,
        variant: q.variant ?? "primary",
      });
    },
    [session, q, blocked, commit, index, heard, hearingKey],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.repeat ||
        event.isComposing ||
        blocked ||
        !q ||
        !session ||
        (event.target instanceof HTMLElement &&
          (event.target.closest("input,select,textarea,button,a") ||
            event.target.isContentEditable))
      )
        return;
      if (q.exerciseType !== "matching" && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        answer(q.options[Number(event.key) - 1].id);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        void go(index - 1);
      }
      if (
        event.key === "ArrowRight" &&
        (session.mode === "exam" || q.selectedOptionId)
      ) {
        event.preventDefault();
        void go(session.mode === "learn" ? session.cursor : index + 1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [answer, blocked, go, index, q, session]);
  function submit() {
    if (!session) return;
    if ((session.pendingCount ?? session.unanswered) > 0) {
      setConfirmSubmit(true);
      return;
    }
    void commit({
      kind: "submit",
      eventId: crypto.randomUUID(),
      revision: session.revision,
    });
  }
  if (!data || !session || !q)
    return error ? (
      <div className="card practice-error" role="alert">
        <h1>Chưa mở được bài luyện.</h1>
        <p>{error}</p>
        <Button onClick={() => void refresh()}>Thử lại</Button>
        <Link href="/practice">Về Luyện tập</Link>
      </div>
    ) : (
      <LoadingState label="Đang tải câu hỏi…" />
    );
  const learning = session.mode === "learn",
    locked = learning && !!q.selectedOptionId;
  const pendingCount = session.pendingCount ?? session.unanswered;
  const askAgainDisabled =
    blocked || (!q.selectedOptionId && pendingCount <= 1);
  const askAgain = () =>
    void commit({
      kind: "defer",
      eventId: crypto.randomUUID(),
      revision: session.revision,
      ordinal: index,
    });
  const reviewControl = (
    <Button
      variant="ghost"
      disabled={learning ? askAgainDisabled : blocked}
      className="practice-mark"
      aria-pressed={learning ? undefined : q.marked}
      title={
        learning
          ? "Chuyển sang câu khác và xếp từ này vào vị trí ngẫu nhiên phía sau"
          : "Đánh dấu câu cần xem lại trước khi nộp"
      }
      onClick={
        learning
          ? askAgain
          : () =>
              void commit({
                kind: "mark",
                eventId: crypto.randomUUID(),
                revision: session.revision,
                ordinal: index,
                marked: !q.marked,
              })
      }
    >
      {learning ? (
        <RotateCcw size={17} />
      ) : (
        <Bookmark size={17} fill={q.marked ? "currentColor" : "none"} />
      )}
      {learning
        ? "Hỏi lại lượt sau"
        : q.marked
          ? "Đã đánh dấu xem lại"
          : "Đánh dấu xem lại"}
    </Button>
  );
  return (
    <div className="page-enter practice-page practice-session">
      <div className="practice-player-heading">
        <Link href="/practice" className="back-link">
          <ArrowLeft size={16} />
          Luyện tập
        </Link>
        <span className="outline-pill">
          {learning ? "Luyện học" : "Thi thử"}
        </span>
      </div>
      <h1>{session.title}</h1>
      <p className="page-description">
        {q.exerciseType === "matching"
          ? "Ghép từng từ với nghĩa tương ứng."
          : q.exerciseType === "listening_choice"
            ? "Nghe âm thanh, chọn chữ Hán đúng."
            : q.direction === "word-meaning"
              ? "Nhìn chữ Hán, chọn nghĩa đúng."
              : "Nhìn nghĩa, chọn chữ Hán đúng."}
      </p>
      <div className="practice-player-meta">
        <span>
          {q.exerciseType === "matching" ? (
            <>Ghép cặp · {number(q.board?.members.length ?? 0)} từ</>
          ) : (
            <>
              Câu <strong>{number(index + 1)}</strong> / {number(session.total)}
            </>
          )}
        </span>
        <span>
          {number(session.answered)} đã trả lời
          {learning && session.correct !== null
            ? ` · ${number(session.correct)} đúng`
            : ""}
          {!!session.repeatAnswered &&
            ` · ${number(session.repeatAnswered)} lượt hỏi lại`}
        </span>
      </div>
      {!!session.deferredCount && learning && (
        <p className="content-note" role="status">
          {number(session.deferredCount)} từ chờ hỏi lại · Vị trí ngẫu nhiên
          trong các câu còn lại.
        </p>
      )}
      <div
        className="study-progress"
        role="progressbar"
        aria-label="Tiến độ bài luyện"
        aria-valuemin={0}
        aria-valuemax={session.total}
        aria-valuenow={session.answered}
      >
        <span
          style={{ width: `${(session.answered / session.total) * 100}%` }}
        />
      </div>
      <section
        className="card practice-question"
        aria-label={`Câu hỏi ${index + 1}`}
        aria-busy={busy}
      >
        {learning && (
          <div
            className="practice-question-controls"
            role="group"
            aria-label="Tùy chọn luyện học"
          >
            <QuickModeToggle disabled={blocked} compact />
            {reviewControl}
          </div>
        )}
        {q.exerciseType === "matching" ? (
          <MatchingPanel
            question={q}
            questions={data.questions}
            disabled={blocked}
            onSelect={(n) => void go(n)}
            onAnswer={answer}
          />
        ) : (
          <>
            <p className="eyebrow">
              {q.deferred && <span>ĐANG HỎI LẠI · </span>}
              {q.exerciseType === "listening_choice"
                ? "NGHE VÀ CHỌN CHỮ HÁN"
                : q.direction === "word-meaning"
                  ? "CHỌN NGHĨA ĐÚNG"
                  : "CHỌN CHỮ HÁN ĐÚNG"}
            </p>
            {q.exerciseType === "listening_choice" ? (
              <ListeningPrompt
                key={hearingKey}
                text={q.audioText!}
                disabled={blocked}
                onHeard={onHeard}
              />
            ) : (
              <>
                <h2
                  className={
                    q.direction === "word-meaning"
                      ? "practice-hanzi"
                      : "practice-meaning"
                  }
                  lang={
                    q.direction === "word-meaning"
                      ? "zh-CN"
                      : session.language === "vi"
                        ? "vi"
                        : "en"
                  }
                >
                  {q.prompt}
                </h2>
                {q.promptPinyin && (
                  <p className="practice-prompt-pinyin">{q.promptPinyin}</p>
                )}
                {q.direction === "word-meaning" && (
                  <SpeakButton word={q.prompt} />
                )}
              </>
            )}
            <div
              className="practice-options"
              role="group"
              aria-label="Các đáp án"
            >
              {q.options.map((option, i) => {
                const correct = q.feedback?.correctOptionId === option.id,
                  wrong = !!q.feedback && chosen === option.id && !correct;
                return (
                  <button
                    key={option.id}
                    className={`practice-option${chosen === option.id ? " selected" : ""}${correct ? " correct" : ""}${wrong ? " incorrect" : ""}`}
                    disabled={
                      blocked ||
                      locked ||
                      (q.exerciseType === "listening_choice" &&
                        heard !== hearingKey)
                    }
                    aria-pressed={chosen === option.id}
                    onClick={() => answer(option.id)}
                  >
                    <span className="practice-option-number">{i + 1}</span>
                    <span
                      lang={
                        q.direction === "meaning-word" ||
                        q.exerciseType === "listening_choice"
                          ? "zh-CN"
                          : undefined
                      }
                    >
                      {option.label}
                    </span>
                    {correct && <Check size={19} />}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {q.feedback && q.exerciseType !== "matching" && (
          <div
            className={`practice-feedback ${q.feedback.isCorrect ? "is-correct" : "is-incorrect"}`}
            aria-live="polite"
          >
            <strong>
              {q.feedback.isCorrect
                ? "Chính xác!"
                : "Chưa đúng. Cùng ghi nhớ lại nhé."}
            </strong>
            <PracticeFeedbackView feedback={q.feedback} />
          </div>
        )}
        {!learning && reviewControl}
      </section>
      {error && (
        <div className="form-error" role="alert">
          <p>
            {error === "STALE_REVISION"
              ? "Bài đã thay đổi ở tab hoặc thiết bị khác. Tải lại trạng thái đã lưu để tiếp tục."
              : error}
          </p>
          <div className="practice-error-actions">
            {hasPending && error !== "STALE_REVISION" && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => pending.current && void commit(pending.current)}
              >
                <RotateCcw size={16} />
                Thử lưu lại
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} />
              Tải trạng thái đã lưu
            </Button>
          </div>
        </div>
      )}
      <div className="practice-navigation">
        <Button
          variant="outline"
          disabled={blocked || index === 0}
          onClick={() => void go(index - 1)}
        >
          <ChevronLeft size={18} />
          Trước
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(jump);
            if (Number.isInteger(value) && value >= 1 && value <= session.total)
              void go(value - 1);
          }}
        >
          <label className="sr-only" htmlFor="practice-jump">
            Đến câu
          </label>
          <input
            id="practice-jump"
            type="number"
            min={1}
            max={session.total}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            disabled={blocked}
          />
          <Button variant="ghost" disabled={blocked} type="submit">
            Đến câu
          </Button>
        </form>
        {(learning ? pendingCount > 0 : index < session.total - 1) ? (
          <Button
            disabled={blocked || (learning && !q.selectedOptionId)}
            onClick={() => void go(learning ? session.cursor : index + 1)}
          >
            Tiếp
            <ChevronRight size={18} />
          </Button>
        ) : (
          <Button disabled={blocked} onClick={submit}>
            Nộp bài
            <Check size={17} />
          </Button>
        )}
      </div>
      <div className="practice-save-state" role="status">
        {mode === "cloud" ? <Cloud size={15} /> : <HardDrive size={15} />}
        <span>
          {busy
            ? "Đang lưu / tải…"
            : error
              ? "Chưa lưu thành công"
              : session.revision
                ? `Đã lưu · ${mode === "cloud" ? "Tài khoản" : "Trình duyệt này"}`
                : "Tự động lưu sau mỗi câu"}
        </span>
        <Button variant="ghost" disabled={blocked} onClick={submit}>
          {learning ? "Kết thúc lượt" : "Nộp bài"}
        </Button>
      </div>
      {confirmSubmit && (
        <section
          className="card practice-submit-confirm"
          aria-label="Xác nhận nộp bài"
        >
          <h2>
            {pendingCount > session.unanswered
              ? `Còn ${number(pendingCount)} lượt hỏi chưa hoàn thành.`
              : `Còn ${number(session.unanswered)} câu chưa trả lời.`}
          </h2>
          <p>
            Các câu bỏ trống sẽ được tính riêng và không được tính đúng. Bạn vẫn
            có thể luyện lại sau khi nộp.
          </p>
          <div>
            <Button variant="outline" onClick={() => setConfirmSubmit(false)}>
              Tiếp tục làm
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void commit({
                  kind: "submit",
                  eventId: crypto.randomUUID(),
                  revision: session.revision,
                })
              }
            >
              Xác nhận nộp
            </Button>
          </div>
        </section>
      )}
      <p className="practice-keyboard-hint">
        {q.exerciseType === "matching"
          ? "Tab và Enter chọn cặp"
          : "Phím 1–4 chọn đáp án"}{" "}
        · ← → chuyển câu · Không thay đổi trạng thái Thành thạo.
      </p>
    </div>
  );
}
