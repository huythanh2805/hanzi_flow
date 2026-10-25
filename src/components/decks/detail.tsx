"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Plus, Trash2 } from "lucide-react";
import { useLearning } from "../provider";
import { LoadingState, PageHeading, SpeakButton, StatusBadge } from "../common";
import { Button } from "../ui/button";
import { VocabularyLibrary } from "../vocabulary-library";
import { deckWords, mutateDeck } from "@/lib/deck-client";
import { bands } from "@/lib/domain/types";
import { useDeckList, useDeckStudy } from "./hooks";
import { DeckEditor } from "./overview";
import { DeckModal } from "./modal";
import { DeckGroupSelection, deckStudyUrl } from "./study-selection";
import type { DeckWordPage } from "@/app/deck-actions";
import { number } from "@/lib/utils";
function DeckWordPicker({ id, onClose }: { id: string; onClose: () => void }) {
  const { bootstrap, notify } = useLearning(),
    [ids, setIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <DeckModal
      wide
      title="Chọn từ trong thư viện"
      onClose={onClose}
      busy={busy}
    >
      <VocabularyLibrary
        embedded
        initial={{ items: [], total: 0, page: 1, pageSize: 30 }}
        picker={{ ids, onChange: setIds }}
      />
      <footer>
        <span>{ids.length} mục từ đã chọn</span>
        <Button
          disabled={!ids.length || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await mutateDeck(bootstrap.mode, {
                kind: "add",
                targets: [id],
                ids,
              });
              notify("Đã thêm từ vào bộ. Các mục đã có được giữ nguyên.");
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Không thêm được từ.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Đang lưu…" : "Thêm các từ đã chọn"}
        </Button>
      </footer>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </DeckModal>
  );
}
export function DeckDetail({ id }: { id: string }) {
  const router = useRouter();
  const { bootstrap, progress, preferences, mutate, ready, notify } =
      useLearning(),
    list = useDeckList(),
    study = useDeckStudy([id]);
  const deck = list.decks.find((d) => d.id === id);
  const [tab, setTab] = useState("words"),
    [editor, setEditor] = useState(false),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [filters, setFilters] = useState({
      query: "",
      band: "",
      state: "",
      page: 1,
    }),
    [result, setResult] = useState<DeckWordPage | null>(null),
    [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<{
    fingerprint: string;
    ids: string[];
  }>({ fingerprint: "", ids: [] });
  const fingerprint = study.snapshot?.fingerprint ?? "",
    selected = selection.fingerprint === fingerprint ? selection.ids : [];
  useEffect(() => {
    if (!ready || !fingerprint) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void deckWords(bootstrap.mode, progress, [id], filters)
        .then((rows) => {
          if (active) {
            setResult(rows);
            setError("");
          }
        })
        .catch((e) => {
          if (active)
            setError(e instanceof Error ? e.message : "Không tải được từ.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    bootstrap.mode,
    progress,
    ready,
    id,
    filters,
    fingerprint,
    retry,
    deck?.studied,
  ]);
  const change = (patch: Partial<typeof filters>) =>
    setFilters((old) => ({ ...old, ...patch, page: patch.page ?? 1 }));
  if (!ready || !list.loaded) return <LoadingState label="Đang mở bộ từ…" />;
  if (!deck)
    return (
      <div className="card deck-empty">
        <h1>Không mở được bộ từ</h1>
        <p>
          {list.error ||
            study.error ||
            "Bộ đã bị xóa hoặc bạn không có quyền truy cập."}
        </p>
        <Link href="/decks">Về Bộ từ của tôi</Link>
        <Button onClick={list.refresh}>Tải lại</Button>
      </div>
    );
  const toggle = (entry: string, checked: boolean) =>
    setSelection({
      fingerprint,
      ids: checked
        ? [...new Set([...selected, entry])]
        : selected.filter((v) => v !== entry),
    });
  const goUrl = (path: "practice" | "flashcards") =>
    deckStudyUrl(path, [id], fingerprint, study.groups, preferences.lessonSize);
  return (
    <div className="page-enter decks-page">
      <Link className="back-link" href="/decks">
        <ArrowLeft size={16} />
        Bộ từ của tôi
      </Link>
      <PageHeading
        eyebrow={deck.smart ? "BỘ TỰ CẬP NHẬT" : "BỘ TỪ CÁ NHÂN"}
        title={deck.name}
        description={deck.description || "Gom những từ bạn muốn ghi nhớ."}
      >
        {!deck.smart && (
          <>
            <Button variant="outline" onClick={() => setEditor(true)}>
              Sửa bộ
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus size={16} />
              Thêm từ
            </Button>
          </>
        )}
      </PageHeading>
      <div className="deck-detail-stats">
        <strong>{number(deck.total)} mục từ</strong>
        <span>{number(deck.studied)} đã học</span>
        <span>Tiến độ dùng chung ở mọi bộ</span>
      </div>
      <div
        className="section-tabs"
        role="tablist"
        aria-label="Nội dung bộ từ"
        onKeyDown={(e) => {
          if (
            e.altKey ||
            e.ctrlKey ||
            e.metaKey ||
            !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
          )
            return;
          e.preventDefault();
          const next =
            e.key === "Home"
              ? "words"
              : e.key === "End"
                ? "groups"
                : tab === "words"
                  ? "groups"
                  : "words";
          setTab(next);
          e.currentTarget
            .querySelector<HTMLButtonElement>(`#deck-${next}-tab`)
            ?.focus();
        }}
      >
        <button
          role="tab"
          id="deck-words-tab"
          aria-controls="deck-words-panel"
          tabIndex={tab === "words" ? 0 : -1}
          aria-selected={tab === "words"}
          onClick={() => setTab("words")}
        >
          Danh sách từ
        </button>
        <button
          role="tab"
          id="deck-groups-tab"
          aria-controls="deck-groups-panel"
          tabIndex={tab === "groups" ? 0 : -1}
          aria-selected={tab === "groups"}
          onClick={() => setTab("groups")}
        >
          Nhóm học
        </button>
      </div>
      {tab === "groups" ? (
        <section
          className="card deck-detail-groups"
          role="tabpanel"
          id="deck-groups-panel"
          aria-labelledby="deck-groups-tab"
        >
          <DeckGroupSelection study={study} />
        </section>
      ) : (
        <section
          className="card deck-word-list"
          aria-busy={loading}
          role="tabpanel"
          id="deck-words-panel"
          aria-labelledby="deck-words-tab"
        >
          <div className="deck-word-filters">
            <input
              aria-label="Tìm từ trong bộ"
              placeholder="Tìm chữ, pinyin hoặc nghĩa…"
              maxLength={100}
              value={filters.query}
              onChange={(e) => change({ query: e.target.value })}
            />
            <select
              aria-label="Lọc Band trong bộ"
              value={filters.band}
              onChange={(e) => change({ band: e.target.value })}
            >
              <option value="">Tất cả Band</option>
              {bands.map((b) => (
                <option value={b} key={b}>
                  Band {b}
                </option>
              ))}
            </select>
            <select
              aria-label="Lọc trạng thái trong bộ"
              value={filters.state}
              onChange={(e) => change({ state: e.target.value })}
            >
              <option value="">Mọi trạng thái</option>
              <option value="NEW">Chưa học</option>
              <option value="LEARNING">Đang học</option>
              <option value="MASTERED">Thành thạo</option>
            </select>
          </div>
          {!deck.smart && (
            <div className="deck-bulk-actions">
              <Button
                variant="ghost"
                onClick={() =>
                  setSelection({
                    fingerprint,
                    ids: [
                      ...new Set([
                        ...selected,
                        ...(result?.items.map((v) => v.id) ?? []),
                      ]),
                    ],
                  })
                }
              >
                Chọn trang này
              </Button>
              <Button
                variant="ghost"
                onClick={() => setSelection({ fingerprint, ids: [] })}
              >
                Bỏ chọn
              </Button>
              <Button
                variant="outline"
                disabled={busy || !selected.length}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await mutateDeck(bootstrap.mode, {
                      kind: "remove",
                      id,
                      ids: selected,
                    });
                    notify("Đã bỏ từ khỏi bộ. Tiến độ học giữ nguyên.");
                    setSelection({ fingerprint, ids: [] });
                    study.refresh();
                    list.refresh();
                    setRetry((n) => n + 1);
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Không bỏ được từ.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 size={16} />
                Bỏ {selected.length} từ khỏi bộ
              </Button>
            </div>
          )}
          {result?.items.map((v) => {
            const p = result.progress[v.id] ?? progress[v.id];
            return (
              <div className="deck-word-row" key={v.id}>
                {!deck.smart && (
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${v.word} (${v.id})`}
                    checked={selected.includes(v.id)}
                    disabled={busy}
                    onChange={(e) => toggle(v.id, e.target.checked)}
                  />
                )}
                <div className="deck-word-label">
                  <Link lang="zh-CN" href={`/vocabulary/${v.id}`}>
                    {v.word}
                  </Link>
                  <small>
                    {v.pinyin} · Band {v.band}
                  </small>
                </div>
                <p>
                  {v.senses
                    .map((s) => s[preferences.language])
                    .filter(Boolean)
                    .join("; ") || "Chưa có nghĩa"}
                </p>
                <StatusBadge state={p?.state} />
                <SpeakButton word={v.word} audioUrl={v.audio_url} />
                {deck.smart && id !== "learned" && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await mutate(
                        v.id,
                        id === "saved"
                          ? { favorite: false }
                          : { difficult: false },
                      );
                      setBusy(false);
                    }}
                  >
                    Bỏ {id === "saved" ? "lưu" : "đánh dấu khó"}
                  </Button>
                )}
              </div>
            );
          })}
          {!result?.items.length && !loading && (
            <p className="deck-empty">
              {deck.total
                ? "Không có từ phù hợp bộ lọc."
                : "Bộ chưa có từ. Thêm từ trong thư viện để bắt đầu."}
            </p>
          )}
          <div className="lesson-pagination">
            <Button
              variant="outline"
              disabled={loading || filters.page === 1}
              onClick={() => change({ page: filters.page - 1 })}
            >
              Trước
            </Button>
            <span>
              {filters.page} /{" "}
              {Math.max(1, Math.ceil((result?.total ?? 0) / 30))}
            </span>
            <Button
              variant="outline"
              disabled={loading || filters.page * 30 >= (result?.total ?? 0)}
              onClick={() => change({ page: filters.page + 1 })}
            >
              Sau
            </Button>
          </div>
        </section>
      )}
      {(error || study.error) && (
        <p role="alert" className="form-error">
          {error || study.error}
          <Button
            variant="ghost"
            onClick={() => {
              study.refresh();
              list.refresh();
              setRetry((n) => n + 1);
            }}
          >
            Tải lại
          </Button>
        </p>
      )}
      <div className="deck-detail-actions">
        <Button
          variant="outline"
          disabled={!study.ids.length || !!study.error}
          onClick={() => router.push(goUrl("flashcards"))}
        >
          <BookOpen size={17} />
          Học Flashcards
        </Button>
        <Button
          disabled={!study.ids.length || !!study.error}
          onClick={() => router.push(goUrl("practice"))}
        >
          Luyện {number(study.ids.length)} từ
        </Button>
      </div>
      {editor && (
        <DeckEditor
          deck={deck}
          onClose={() => {
            setEditor(false);
            list.refresh();
          }}
        />
      )}
      {adding && (
        <DeckWordPicker
          id={id}
          onClose={() => {
            setAdding(false);
            study.refresh();
            list.refresh();
            setRetry((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
