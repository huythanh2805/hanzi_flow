"use client";
import {
  Volume2,
  VolumeX,
  ArrowUpRight,
  BookOpen,
  SearchX,
  Loader2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLearning } from "./provider";
import { Button } from "./ui/button";
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function SpeakButton({
  word,
  large = false,
  audioUrl,
}: {
  word: string;
  large?: boolean;
  audioUrl?: string;
}) {
  const { preferences, notify } = useLearning();
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );
  function speak() {
    if (audioUrl) {
      audio.current?.pause();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      const clip = new Audio(audioUrl);
      audio.current = clip;
      clip.playbackRate = preferences.speechRate;
      clip.onended = () => setPlaying(false);
      void clip
        .play()
        .then(() => setPlaying(true))
        .catch(() => {
          setPlaying(false);
          notify("Không phát được tệp âm thanh tham chiếu.", true);
        });
      return;
    }
    if (!("speechSynthesis" in window)) {
      notify(
        "Trình duyệt này chưa hỗ trợ phát âm. Hãy thử Chrome hoặc Edge.",
        true,
      );
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "zh-CN";
    utterance.rate = preferences.speechRate;
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.toLowerCase().startsWith("zh"));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setPlaying(true);
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => {
      setPlaying(false);
      notify(
        "Không phát được âm thanh. Kiểm tra giọng tiếng Trung trên thiết bị.",
        true,
      );
    };
    window.speechSynthesis.speak(utterance);
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`speak-button ${large ? "speak-large" : ""} ${playing ? "speaking" : ""}`}
      aria-label={`Phát âm ${word}`}
      onClick={speak}
    >
      {playing ? (
        <VolumeX size={large ? 23 : 17} />
      ) : (
        <Volume2 size={large ? 23 : 17} />
      )}
    </Button>
  );
}
export function StatusBadge({ state = "NEW" }: { state?: string }) {
  return (
    <span className={`status-badge state-${state.toLowerCase()}`}>
      {state === "MASTERED"
        ? "Thành thạo"
        : state === "LEARNING"
          ? "Đang học"
          : "Chưa học"}
    </span>
  );
}
export function ProgressRing({
  percent = 0,
  size = 104,
  children,
}: {
  percent?: number;
  size?: number;
  children?: React.ReactNode;
}) {
  const safe = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="progress-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${safe}% hoàn thành`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="43" className="ring-track" />
        <circle
          cx="50"
          cy="50"
          r="43"
          className="ring-fill"
          strokeDasharray={`${safe * 2.702} 270.2`}
        />
      </svg>
      <div>
        {children ?? (
          <strong>
            {safe}
            <small>%</small>
          </strong>
        )}
      </div>
    </div>
  );
}
export function EmptyState({
  title = "Chưa có từ vựng phù hợp",
  description = "Thử thay đổi từ khóa hoặc bỏ bớt bộ lọc.",
  action,
  onAction,
}: {
  title?: string;
  description?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span>
        <SearchX size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && onAction && (
        <Button variant="outline" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
export function LoadingState({
  label = "Đang tải từ vựng…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="text-link">
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
export function PlannedFeature({
  title,
  description,
  phase = 2,
}: {
  title: string;
  description: string;
  phase?: number;
}) {
  return (
    <section className="planned-feature" id={title}>
      <BookOpen size={22} />
      <div>
        <span className="small-label">PHASE {phase}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}
