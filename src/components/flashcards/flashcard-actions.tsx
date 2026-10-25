import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";

export function FlashcardActions({
  revealed,
  disabled,
  busy,
  onReveal,
  onLearn,
  onRetry,
}: {
  revealed: boolean;
  disabled: boolean;
  busy: boolean;
  onReveal: () => void;
  onLearn: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="study-actions">
      {revealed ? (
        <>
          <Button variant="outline" disabled={disabled} onClick={onRetry}>
            Cần học lại
          </Button>
          <Button disabled={disabled} onClick={onLearn}>
            <Check size={17} />
            {busy ? "Đang lưu…" : "Đã học · Tiếp tục"}
            <ArrowRight size={17} />
          </Button>
        </>
      ) : (
        <Button className="reveal-button" onClick={onReveal}>
          <RotateCcw size={16} />
          Xem đáp án<span className="keycap">Space</span>
        </Button>
      )}
    </div>
  );
}
