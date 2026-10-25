import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function StudyProgress({
  href,
  label,
  current,
  total,
}: {
  href: string;
  label: string;
  current: number;
  total: number;
}) {
  return (
    <>
      <div className="study-meta">
        <Link href={href} className="back-link">
          <ArrowLeft size={15} />
          {label}
        </Link>
        <span>
          {current}
          <small> / {total}</small>
        </span>
      </div>
      <div
        className="study-progress"
        role="progressbar"
        aria-label="Tiến độ buổi học"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
      >
        <span style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </>
  );
}
