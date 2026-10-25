"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Keyboard,
  Layers3,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
} from "lucide-react";
import { useLearning } from "./provider";
import { EmptyState, LoadingState, PageHeading, SpeakButton } from "./common";
import { Button } from "./ui/button";
import { bands, type Filters, type Vocabulary } from "@/lib/domain/types";
type Mode = "pinyin" | "hanzi" | "vi" | "en";
export function Flashcards({
  initial,
  initialBand = "",
  initialTopic = "",
  lesson = 1,
  singleEntry = false,
}: {
  initial: Vocabulary[];
  initialBand?: string;
  initialTopic?: string;
  lesson?: number;
  singleEntry?: boolean;
}) {
  const { bootstrap, progress, preferences, pending, ready, mutate, notify } =
    useLearning();
  const [cards, setCards] = useState(initial);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<Mode>("pinyin");
  const [selectedBand, setSelectedBand] = useState(initialBand);
  const [selectedTopic, setSelectedTopic] = useState(initialTopic);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [difficultOnly, setDifficultOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sessionStudied, setSessionStudied] = useState<string[]>([]);
  const [retryIds, setRetryIds] = useState<string[]>([]);
  const [options, setOptions] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [groupState, setGroupState] = useState<{
    key: string;
    error: string;
  } | null>(null);
  const [retryGroup, setRetryGroup] = useState(0);
  const groupKey = `${initialBand}:${initialTopic}:${lesson}:${preferences.lessonSize}:${retryGroup}`;
  const groupLoading =
    bootstrap.mode === "trial" &&
    !singleEntry &&
    (!ready || groupState?.key !== groupKey);
  const groupError = groupState?.key === groupKey ? groupState.error : "";
  const [activeLesson, setActiveLesson] = useState(lesson);
  const mounted = useRef(true);
  const eligible = cards.filter(
    (v) =>
      !progress[v.id]?.suspended &&
      (mode === "vi" || mode === "en" ? v.senses.some((s) => !!s[mode]) : true),
  );
  const v = eligible[index];
  const p = v ? progress[v.id] : undefined;
  useEffect(() => {
    if (!ready || bootstrap.mode !== "trial" || singleEntry) return;
    const controller = new AbortController();
    const filters: Filters = {
      query: "",
      band: initialBand,
      topic: initialTopic,
      state: "",
      favorite: false,
      difficult: false,
      sort: "order",
      page: lesson,
      pageSize: preferences.lessonSize,
    };
    void fetch("/api/vocabulary/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Không tải được nhóm học.");
        setCards(result.items);
        setActiveLesson(result.page);
        setIndex(0);
        setRevealed(false);
        setGroupState({ key: groupKey, error: "" });
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError")
          setGroupState({ key: groupKey, error: error.message });
      });
    return () => controller.abort();
  }, [
    ready,
    bootstrap.mode,
    singleEntry,
    initialBand,
    initialTopic,
    lesson,
    preferences.lessonSize,
    groupKey,
  ]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);
  useEffect(() => {
    if (
      !autoPlay ||
      !v ||
      revealed ||
      mode === "hanzi" ||
      !("speechSynthesis" in window)
    )
      return;
    const utterance = new SpeechSynthesisUtterance(v.word);
    utterance.lang = "zh-CN";
    utterance.rate = preferences.speechRate;
    utterance.onerror = () =>
      notify("Thiết bị chưa hỗ trợ tự động phát giọng tiếng Trung.", true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [autoPlay, v, mode, revealed, preferences.speechRate, notify]);
  const move = useCallback(
    (direction: number) => {
      setIndex((i) =>
        Math.max(0, Math.min(eligible.length - 1, i + direction)),
      );
      setRevealed(false);
    },
    [eligible.length],
  );
  const learn = useCallback(
    async (difficult = false) => {
      if (!v) return;
      const saved = await mutate(v.id, {
        state: "LEARNING",
        ...(difficult ? { difficult: true } : {}),
      });
      if (!saved || !mounted.current) return;
      setSessionStudied((ids) => [...new Set([...ids, v.id])]);
      if (difficult) setRetryIds((ids) => [...new Set([...ids, v.id])]);
      if (index + 1 >= eligible.length) setFinished(true);
      else move(1);
    },
    [v, mutate, index, eligible.length, move],
  );
  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      if (
        (e.target instanceof HTMLElement &&
          (e.target.matches("input,select,textarea,button,a") ||
            e.target.isContentEditable)) ||
        finished ||
        !ready ||
        groupLoading
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setRevealed((r) => !r);
      }
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "Enter" && revealed) {
        e.preventDefault();
        void learn();
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [finished, revealed, move, learn, ready, groupLoading]);
  async function load() {
    setLoading(true);
    try {
      const filters: Filters = {
        query: "",
        band: selectedBand,
        topic: selectedTopic,
        state: "",
        favorite: favoritesOnly,
        difficult: difficultOnly,
        sort: "order",
        page: 1,
        pageSize: preferences.lessonSize,
      };
      const response = await fetch("/api/vocabulary/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters,
          ...(bootstrap.mode === "trial" ? { trialProgress: progress } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCards(result.items);
      setIndex(0);
      setRevealed(false);
      setFinished(false);
      setSessionStudied([]);
      setRetryIds([]);
      setOptions(false);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Không tải được thẻ học.",
        true,
      );
    } finally {
      setLoading(false);
    }
  }
  function shuffle() {
    const next = [...cards];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setCards(next);
    setIndex(0);
    setRevealed(false);
  }
  return (
    <div className="page-enter flashcards-page">
      <PageHeading
        eyebrow="NHÌN THẤY · NHỚ LÂU"
        title="Một tấm thẻ. Một từ mới."
        description="Dành một khoảnh khắc để nhớ, trước khi lật thẻ."
      >
        <Button
          variant="outline"
          aria-expanded={options}
          onClick={() => setOptions((o) => !o)}
        >
          <SlidersHorizontal size={16} />
          Tùy chỉnh buổi học
        </Button>
      </PageHeading>
      {options && (
        <div className="card flashcard-options">
          <label>
            HSK Band
            <select
              value={selectedBand}
              onChange={(e) => setSelectedBand(e.target.value)}
            >
              <option value="">Tất cả Band</option>
              {bands.map((b) => (
                <option key={b} value={b}>
                  Band {b}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chủ đề
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
            >
              <option value="">Tất cả chủ đề</option>
              {bootstrap.topics.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chế độ
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setIndex(0);
                setRevealed(false);
                setFinished(false);
              }}
            >
              <option value="pinyin">Chữ Hán → Pinyin</option>
              <option value="hanzi">Pinyin → Chữ Hán</option>
              <option value="vi">Chữ Hán → Tiếng Việt</option>
              <option value="en">Chữ Hán → Tiếng Anh</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
            />
            Chỉ từ đã lưu
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={difficultOnly}
              onChange={(e) => setDifficultOnly(e.target.checked)}
            />
            Chỉ từ khó
          </label>
          <Button disabled={loading} onClick={() => void load()}>
            {loading ? "Đang tải…" : "Áp dụng & bắt đầu"}
            <ArrowRight size={16} />
          </Button>
          <p className="content-note">
            Chế độ nghĩa chỉ sử dụng các thẻ có nghĩa trong nhóm từ đang chọn.
            Mỗi buổi lấy tối đa {preferences.lessonSize} từ.
          </p>
        </div>
      )}
      {groupLoading ? (
        <LoadingState label="Đang chuẩn bị nhóm từ của bạn…" />
      ) : groupError ? (
        <div className="card">
          <EmptyState
            title="Chưa tải được nhóm học"
            description={groupError}
            action="Thử lại"
            onAction={() => setRetryGroup((n) => n + 1)}
          />
        </div>
      ) : finished ? (
        <div className="card session-summary">
          <span className="summary-icon">
            <CircleCheck size={38} />
          </span>
          <p className="eyebrow">THÊM MỘT BƯỚC TIẾN</p>
          <h2>Bạn đã hoàn thành buổi học.</h2>
          <p>
            {sessionStudied.length} mục từ được ghi nhận vào tiến độ chung.
            <br />
            {bootstrap.mode === "cloud"
              ? "Tiến độ đã lưu vào tài khoản."
              : "Tiến độ đã lưu trên trình duyệt này."}
          </p>
          <div className="summary-actions">
            <Button
              onClick={() => {
                setIndex(0);
                setFinished(false);
                setRevealed(false);
              }}
            >
              Học lại nhóm từ
              <RotateCcw size={16} />
            </Button>
            {retryIds.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setCards(cards.filter((c) => retryIds.includes(c.id)));
                  setIndex(0);
                  setFinished(false);
                  setRevealed(false);
                  setRetryIds([]);
                }}
              >
                Học lại {retryIds.length} từ khó
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/dashboard">
                Về tổng quan
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
          <p className="content-note">
            Đây là buổi học cơ bản. Chấm điểm và lịch ôn FSRS được triển khai
            trong Phase 2.
          </p>
        </div>
      ) : v ? (
        <div className="study-workspace">
          <div className="study-meta">
            <Link
              href={
                initialTopic
                  ? `/topics/${initialTopic}`
                  : initialBand
                    ? `/bands/${initialBand}`
                    : "/vocabulary"
              }
              className="back-link"
            >
              <ArrowLeft size={15} />
              {initialTopic
                ? bootstrap.topics.find((t) => t.id === initialTopic)?.name
                : initialBand
                  ? `Band ${initialBand} · Nhóm ${activeLesson}`
                  : "Buổi học của bạn"}
            </Link>
            <span>
              {index + 1}
              <small> / {eligible.length}</small>
            </span>
          </div>
          <div className="study-progress">
            <span
              style={{ width: `${((index + 1) / eligible.length) * 100}%` }}
            />
          </div>
          <div className="study-tools">
            <span className="outline-pill">
              {mode === "pinyin"
                ? "Chữ Hán → Pinyin"
                : mode === "hanzi"
                  ? "Pinyin → Chữ Hán"
                  : `Chữ Hán → ${mode === "vi" ? "Tiếng Việt" : "Tiếng Anh"}`}
            </span>
            <div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={autoPlay}
                  onChange={(e) => setAutoPlay(e.target.checked)}
                />
                Tự phát âm
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Xáo trộn thẻ"
                onClick={shuffle}
              >
                <Shuffle size={17} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!ready || pending[v.id]}
                aria-label={p?.favorite ? "Bỏ lưu thẻ" : "Lưu thẻ"}
                aria-pressed={p?.favorite ?? false}
                onClick={() => void mutate(v.id, { favorite: !p?.favorite })}
              >
                <Bookmark
                  size={17}
                  fill={p?.favorite ? "currentColor" : "none"}
                />
              </Button>
            </div>
          </div>
          <div className="flashcard-row">
            <Button
              variant="outline"
              size="icon"
              className="card-arrow"
              aria-label="Thẻ trước"
              disabled={index === 0}
              onClick={() => move(-1)}
            >
              <ChevronLeft size={22} />
            </Button>
            <div className={`card flashcard ${revealed ? "is-revealed" : ""}`}>
              <div className="flashcard-corner">
                <Layers3 size={16} />
                <span>HSK Band {v.band}</span>
              </div>
              <div className="flashcard-main">
                <p className="flashcard-prompt">
                  {mode === "hanzi"
                    ? "Bạn nhớ chữ Hán này không?"
                    : "Bạn nhớ cách đọc / ý nghĩa không?"}
                </p>
                <h2
                  className={
                    mode === "hanzi" ? "flashcard-pinyin" : "flashcard-hanzi"
                  }
                  lang={mode === "hanzi" ? undefined : "zh-CN"}
                >
                  {mode === "hanzi" ? v.pinyin : v.word}
                </h2>
                {(mode !== "hanzi" || revealed) && (
                  <SpeakButton word={v.word} audioUrl={v.audio_url} large />
                )}
                <div className="flashcard-answer" aria-live="polite">
                  {revealed ? (
                    <>
                      <p
                        className={
                          mode === "hanzi" ? "answer-hanzi" : "answer-text"
                        }
                        lang={mode === "hanzi" ? "zh-CN" : undefined}
                      >
                        {mode === "pinyin"
                          ? v.pinyin
                          : mode === "hanzi"
                            ? v.word
                            : v.senses
                                .map((s) => s[mode])
                                .filter(Boolean)
                                .join("; ")}
                      </p>
                      {mode === "pinyin" &&
                        v.senses.some((s) => s[preferences.language]) && (
                          <span>
                            {v.senses
                              .map((s) => s[preferences.language])
                              .filter(Boolean)
                              .join("; ")}
                          </span>
                        )}
                      <Link
                        href={`/vocabulary/${v.id}`}
                        className="flashcard-detail-link"
                      >
                        Chi tiết từ
                        <ArrowRight size={12} />
                      </Link>
                      {v.senses.some(
                        (s) =>
                          s.translation_meta?.[
                            mode === "vi" || mode === "en"
                              ? mode
                              : preferences.language
                          ],
                      ) && (
                        <small className="muted">
                          Có bản dịch máy chưa duyệt · Xem nguồn trong chi tiết
                          từ
                        </small>
                      )}
                    </>
                  ) : (
                    <button
                      className="reveal-link"
                      onClick={() => setRevealed(true)}
                    >
                      Lật thẻ để xem đáp án
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flashcard-bottom">
                <span>
                  {p?.state === "LEARNING" ? "Đang học" : "Khám phá một từ mới"}
                </span>
                <span>{v.id}</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="card-arrow"
              aria-label="Thẻ tiếp theo"
              disabled={index + 1 >= eligible.length}
              onClick={() => move(1)}
            >
              <ChevronRight size={22} />
            </Button>
          </div>
          <div className="study-actions">
            {revealed ? (
              <>
                <Button
                  variant="outline"
                  disabled={!ready || pending[v.id]}
                  onClick={() => void learn(true)}
                >
                  Cần học lại
                </Button>
                <Button
                  disabled={!ready || pending[v.id]}
                  onClick={() => void learn()}
                >
                  <Check size={17} />
                  {pending[v.id] ? "Đang lưu…" : "Đã học · Tiếp tục"}
                  <ArrowRight size={17} />
                </Button>
              </>
            ) : (
              <Button
                className="reveal-button"
                onClick={() => setRevealed(true)}
              >
                <RotateCcw size={16} />
                Xem đáp án<span className="keycap">Space</span>
              </Button>
            )}
          </div>
          <p className="keyboard-hint">
            <Keyboard size={15} />
            <span>
              <kbd>Space</kbd> lật thẻ
            </span>
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd> chuyển thẻ
            </span>
            <span>
              <kbd>Enter</kbd> đánh dấu đã học
            </span>
          </p>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            title="Chưa có thẻ phù hợp"
            description={
              cards.length
                ? "Nhóm này không có nghĩa ở chế độ đã chọn, hoặc các từ đang tạm dừng. Hãy chọn chế độ Chữ Hán → Pinyin hay đổi bộ lọc."
                : "Chọn một Band hoặc chủ đề có dữ liệu để bắt đầu."
            }
            action="Điều chỉnh buổi học"
            onAction={() => setOptions(true)}
          />
        </div>
      )}
    </div>
  );
}
