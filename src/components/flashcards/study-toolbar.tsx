import { Bookmark, Shuffle } from "lucide-react";
import { Button } from "../ui/button";
import type { StudyMode } from "./types";

export function StudyToolbar({
  mode,
  autoPlay,
  onAutoPlay,
  onShuffle,
  favorite,
  onBookmark,
  disabled,
}: {
  mode: StudyMode;
  autoPlay: boolean;
  onAutoPlay: (value: boolean) => void;
  onShuffle: () => void;
  favorite: boolean;
  onBookmark: () => void;
  disabled: boolean;
}) {
  return (
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
            onChange={(e) => onAutoPlay(e.target.checked)}
          />
          Tự phát âm
        </label>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Xáo trộn thẻ"
          onClick={onShuffle}
        >
          <Shuffle size={17} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={favorite ? "Bỏ lưu thẻ" : "Lưu thẻ"}
          aria-pressed={favorite}
          onClick={onBookmark}
        >
          <Bookmark size={17} fill={favorite ? "currentColor" : "none"} />
        </Button>
      </div>
    </div>
  );
}
