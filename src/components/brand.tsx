import { cn } from "@/lib/utils";
export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("brand", className)}>
      <span className="brand-mark" aria-hidden="true">
        汉
      </span>
      {!compact && (
        <span>
          Hanzi<span className="brand-flow">Flow</span>
        </span>
      )}
    </span>
  );
}
