import { SlidersHorizontal } from "lucide-react";
import { PageHeading } from "../common";
import { Button } from "../ui/button";

export function FlashcardsHeader({
  optionsOpen,
  onToggleOptions,
}: {
  optionsOpen: boolean;
  onToggleOptions: () => void;
}) {
  return (
    <PageHeading
      eyebrow="NHÌN THẤY · NHỚ LÂU"
      title="Một tấm thẻ. Một từ mới."
      description="Dành một khoảnh khắc để nhớ, trước khi lật thẻ."
    >
      <Button
        variant="outline"
        aria-expanded={optionsOpen}
        aria-controls="study-options"
        onClick={onToggleOptions}
      >
        <SlidersHorizontal size={16} />
        Tùy chỉnh buổi học
      </Button>
    </PageHeading>
  );
}
