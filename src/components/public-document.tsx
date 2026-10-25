import Link from "next/link";
import { Brand } from "./brand";
import { ArrowLeft } from "lucide-react";
export function PublicDocument({ children }: { children: React.ReactNode }) {
  return (
    <main className="public-document">
      <header className="public-document-header">
        <Link href="/" aria-label="HanziFlow">
          <Brand />
        </Link>
        <Link href="/dashboard" className="text-link">
          <ArrowLeft size={14} />
          Không gian học
        </Link>
      </header>
      <article className="prose-page">{children}</article>
    </main>
  );
}
