import { Keyboard } from "lucide-react";

export function ShortcutHints() {
  return (
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
  );
}
