import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Layers3,
  RotateCcw,
} from "lucide-react";
import { Button } from "../ui/button";
import { SpeakButton } from "../common";
import type {
  LearningState,
  Preferences,
  Vocabulary,
} from "@/lib/domain/types";
import type { StudyMode } from "./types";

export function FlashcardPanel({
  vocabulary: v,
  mode,
  revealed,
  language,
  state,
  onFlip,
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
}: {
  vocabulary: Vocabulary;
  mode: StudyMode;
  revealed: boolean;
  language: Preferences["language"];
  state?: LearningState;
  onFlip: () => void;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled: boolean;
  nextDisabled: boolean;
}) {
  return (
    <div className="flashcard-row">
      <Button
        variant="outline"
        size="icon"
        className="card-arrow"
        aria-label="Thẻ trước"
        disabled={previousDisabled}
        onClick={onPrevious}
      >
        <ChevronLeft size={22} />
      </Button>
      <div className={`card flashcard ${revealed ? "is-revealed" : ""}`}>
        <span className="flashcard-reflection" aria-hidden="true" />
        <button
          type="button"
          className="flashcard-flip-target"
          aria-label={
            revealed ? "Quay lại mặt trước của thẻ" : "Lật thẻ xem đáp án"
          }
          aria-pressed={revealed}
          onClick={onFlip}
        />
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
              mode === "hanzi"
                ? "flashcard-pinyin"
                : `flashcard-hanzi${[...v.word].length > 3 ? " is-long-word" : ""}`
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
                  className={mode === "hanzi" ? "answer-hanzi" : "answer-text"}
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
                {mode === "pinyin" && v.senses.some((s) => s[language]) && (
                  <span>
                    {v.senses
                      .map((s) => s[language])
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
                      mode === "vi" || mode === "en" ? mode : language
                    ],
                ) && (
                  <small className="muted">
                    Có bản dịch máy chưa duyệt · Xem nguồn trong chi tiết từ
                  </small>
                )}
              </>
            ) : (
              <button className="reveal-link" onClick={onFlip}>
                Lật thẻ để xem đáp án
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flashcard-bottom">
          <span>
            {state === "LEARNING" ? "Đang học" : "Khám phá một từ mới"}
          </span>
          <span>{v.id}</span>
        </div>
      </div>
      <Button
        variant="outline"
        size="icon"
        className="card-arrow"
        aria-label="Thẻ tiếp theo"
        disabled={nextDisabled}
        onClick={onNext}
      >
        <ChevronRight size={22} />
      </Button>
    </div>
  );
}
