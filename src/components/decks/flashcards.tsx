"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLearning } from "../provider";
import { Flashcards } from "../flashcards";
import { LoadingState } from "../common";
import { Button } from "../ui/button";
import {
  resolveDecks,
  vocabularyBatch,
  practiceSelectionKey,
} from "@/lib/deck-client";
import type { Vocabulary } from "@/lib/domain/types";
export function DeckFlashcards({
  refs,
  groups,
  size,
  fingerprint,
}: {
  refs: string[];
  groups?: number[];
  size?: number;
  fingerprint?: string;
}) {
  const { bootstrap, progress, preferences, ready } = useLearning(),
    router = useRouter();
  const [data, setData] = useState<{
      key: string;
      cards: Vocabulary[];
      title: string;
    } | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [loaded, setLoaded] = useState(0);
  const key = JSON.stringify({ refs, groups, size, fingerprint, retry });
  useEffect(() => {
    if (!ready || data?.key === key) return;
    let active = true;
    const controller = new AbortController();
    const input = JSON.parse(key) as {
      refs: string[];
      groups?: number[];
      size?: number;
      fingerprint?: string;
    };
    void resolveDecks(
      bootstrap.mode,
      progress,
      input.refs,
      input.groups,
      input.size ?? preferences.lessonSize,
      input.fingerprint,
    )
      .then(async (snapshot) => {
        const cards: Vocabulary[] = [];
        for (let start = 0; start < snapshot.ids.length; start += 400) {
          const batches = await Promise.all(
            Array.from(
              {
                length: Math.min(
                  4,
                  Math.ceil((snapshot.ids.length - start) / 100),
                ),
              },
              (_, i) =>
                vocabularyBatch(
                  snapshot.ids.slice(start + i * 100, start + (i + 1) * 100),
                  controller.signal,
                ),
            ),
          );
          cards.push(...batches.flat());
          if (active) setLoaded(cards.length);
        }
        if (active) {
          setData({ key, cards, title: snapshot.title });
          setError("");
        }
      })
      .catch((e) => {
        if (active && !(e instanceof Error && e.name === "AbortError"))
          setError(
            e instanceof Error ? e.message : "Không mở được Flashcards.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, ready, bootstrap.mode, progress, preferences.lessonSize, data?.key]);
  if (error)
    return (
      <div className="card deck-empty" role="alert">
        <h1>Chưa mở được tập từ</h1>
        <p>{error}</p>
        <Button
          onClick={() => {
            setError("");
            setRetry((n) => n + 1);
          }}
        >
          Thử lại
        </Button>
        <Link href="/decks">Chọn lại bộ từ</Link>
      </div>
    );
  if (data?.key !== key)
    return (
      <LoadingState label={`Đang chuẩn bị Flashcards… ${loaded} từ đã tải`} />
    );
  return (
    <Flashcards
      key={key}
      initial={data.cards}
      frozenSource={{
        title: data.title,
        onPractice: (ids) => {
          try {
            const id = crypto.randomUUID();
            sessionStorage.setItem(
              practiceSelectionKey(
                bootstrap.mode,
                bootstrap.user?.id ?? "",
                id,
              ),
              JSON.stringify(ids),
            );
            router.push(`/practice?selection=${id}`);
          } catch {
            setError(
              "Không lưu được tập từ trên trình duyệt. Kiểm tra quyền lưu trữ rồi thử lại.",
            );
          }
        },
      }}
    />
  );
}
