"use client";
import { useCallback, useEffect, useState } from "react";
import { Volume2, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import { useLearning } from "../provider";

export function mandarinVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((v) => /^(zh[-_]CN|cmn)([-_]|$)/i.test(v.lang)) ??
    voices.find((v) => /^zh[-_](TW|SG)([-_]|$)/i.test(v.lang))
  );
}
export function useMandarinVoice() {
  const [state, setState] = useState<"loading" | "ready" | "missing">(
    "loading",
  );
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () =>
      setState(
        "speechSynthesis" in window &&
          mandarinVoice(window.speechSynthesis.getVoices())
          ? "ready"
          : "missing",
      );
    const initial = setTimeout(() => {
      if (!("speechSynthesis" in window)) return check();
      if (mandarinVoice(window.speechSynthesis.getVoices())) check();
      else timer = setTimeout(check, 2000);
    }, 0);
    if ("speechSynthesis" in window)
      window.speechSynthesis.addEventListener("voiceschanged", check);
    return () => {
      clearTimeout(initial);
      clearTimeout(timer);
      if ("speechSynthesis" in window)
        window.speechSynthesis.removeEventListener("voiceschanged", check);
    };
  }, []);
  return state;
}
export function ListeningPrompt({
  text,
  disabled,
  onHeard,
}: {
  text: string;
  disabled: boolean;
  onHeard: () => void;
}) {
  const { preferences } = useLearning();
  const voiceState = useMandarinVoice();
  const [playing, setPlaying] = useState(false),
    [error, setError] = useState("");
  const play = useCallback(() => {
    if (!("speechSynthesis" in window)) {
      setError("Trình duyệt chưa hỗ trợ phát âm Mandarin.");
      return;
    }
    const synth = window.speechSynthesis,
      voice = mandarinVoice(synth.getVoices());
    if (!voice) {
      setError(
        "Chưa có giọng Mandarin. Cài giọng tiếng Trung trên thiết bị rồi tải lại, hoặc dùng Hỏi lại để luyện từ này bằng chữ và nghĩa.",
      );
      return;
    }
    try {
      synth.cancel();
      setError("");
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = preferences.speechRate;
      utterance.onstart = () => {
        setPlaying(true);
        onHeard();
      };
      utterance.onend = () => setPlaying(false);
      utterance.onerror = (event) => {
        setPlaying(false);
        if (!["canceled", "interrupted"].includes(event.error))
          setError(
            "Không phát được âm thanh. Hãy thử phát lại; chưa có câu trả lời nào được chấm.",
          );
      };
      synth.speak(utterance);
    } catch {
      setPlaying(false);
      setError(
        "Không mở được giọng Mandarin. Hãy thử phát lại hoặc chọn Hỏi lại.",
      );
    }
  }, [text, preferences.speechRate, onHeard]);
  useEffect(() => {
    const timer =
      preferences.autoPlay && voiceState === "ready"
        ? setTimeout(play, 150)
        : undefined;
    return () => {
      clearTimeout(timer);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [play, preferences.autoPlay, voiceState]);
  return (
    <div className="practice-listening-prompt">
      <h2>Nghe và chọn chữ Hán</h2>
      <Button
        variant="outline"
        disabled={disabled || voiceState === "loading"}
        onClick={play}
        aria-label="Phát âm câu hỏi"
      >
        <Volume2 size={30} />
        {playing ? "Đang phát…" : "Nghe âm thanh"}
      </Button>
      <p className="muted">
        <RotateCcw size={14} /> Có thể nghe lại trước khi chọn đáp án.
      </p>
      {voiceState === "missing" && !error && (
        <p role="status">
          Chưa tìm thấy giọng Mandarin. Bấm nghe để thử lại hoặc chọn Hỏi lại.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
