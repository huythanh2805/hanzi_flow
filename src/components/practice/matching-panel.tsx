"use client";
import { Check } from "lucide-react";
import type { PracticeQuestion } from "@/lib/domain/practice";

export function MatchingPanel({
  question,
  questions,
  disabled,
  onSelect,
  onAnswer,
}: {
  question: PracticeQuestion;
  questions: PracticeQuestion[];
  disabled: boolean;
  onSelect: (ordinal: number) => void;
  onAnswer: (optionId: string) => void;
}) {
  const board = question.board!;
  const resolvedOptions = new Set(
    questions
      .filter((q) => q.resolved && q.board?.id === board.id)
      .map((q) => q.feedback?.correctOptionId),
  );
  const finished = board.members.every((m) => m.resolved);
  return (
    <div className="practice-matching">
      <h2>Ghép chữ với nghĩa</h2>
      <p className="muted">
        Chọn một từ ở bên trái, rồi chọn nghĩa tương ứng. Mỗi cặp tính là một
        từ.
      </p>
      <div className="practice-matching-columns">
        <div role="group" aria-label="Chữ Hán cần ghép">
          {board.members.map((m) => (
            <button
              key={m.ordinal}
              disabled={disabled || m.resolved}
              aria-pressed={question.ordinal === m.ordinal}
              className={`practice-option ${m.resolved ? "correct" : m.incorrect && question.ordinal === m.ordinal ? "incorrect" : question.ordinal === m.ordinal ? "selected" : ""}`}
              onClick={() => onSelect(m.ordinal)}
            >
              <span>
                <strong lang="zh-CN">{m.word}</strong>
                <small>{m.pinyin}</small>
              </span>
              {m.resolved && <Check size={18} />}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Nghĩa cần ghép">
          {board.options.map((o) => (
            <button
              key={o.id}
              disabled={
                disabled || question.resolved || resolvedOptions.has(o.id)
              }
              className={`practice-option ${resolvedOptions.has(o.id) ? "correct" : question.lastAttempt?.optionId === o.id ? "incorrect" : ""}`}
              onClick={() => onAnswer(o.id)}
            >
              {o.label}
              {resolvedOptions.has(o.id) && <Check size={18} />}
            </button>
          ))}
        </div>
      </div>
      <p role="status" aria-live="polite" className="content-note">
        {finished
          ? "Đã hoàn thành bảng ghép."
          : question.lastAttempt
            ? "Chưa khớp. Bạn có thể thử nghĩa khác hoặc chọn Hỏi lại. Điểm lần đầu được giữ nguyên."
            : "Dùng Tab và Enter để chọn cặp, hoặc chạm vào hai thẻ."}
      </p>
    </div>
  );
}
