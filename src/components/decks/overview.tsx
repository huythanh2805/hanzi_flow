"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { FolderHeart, Plus, ArrowRight, Pencil, Trash2 } from "lucide-react";
import { useLearning } from "../provider";
import { PageHeading, LoadingState } from "../common";
import { Button } from "../ui/button";
import { useDeckList, useDeckStudy } from "./hooks";
import { DeckModal } from "./modal";
import { DeckStudyDialog } from "./study-selection";
import { mutateDeck } from "@/lib/deck-client";
import { smartDecks, type Deck } from "@/lib/domain/decks";
import { number } from "@/lib/utils";
export function DeckEditor({
  deck,
  remove = false,
  onClose,
}: {
  deck?: Deck;
  remove?: boolean;
  onClose: () => void;
}) {
  const { bootstrap, notify } = useLearning();
  const [name, setName] = useState(deck?.name ?? ""),
    [description, setDescription] = useState(deck?.description ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<string | null>(null);
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (remove && deck)
        await mutateDeck(bootstrap.mode, {
          kind: "delete",
          id: deck.id,
          revision: deck.revision,
        });
      else if (deck)
        await mutateDeck(bootstrap.mode, {
          kind: "update",
          id: deck.id,
          revision: deck.revision,
          name,
          description,
        });
      else {
        const id = request.current ?? crypto.randomUUID();
        request.current = id;
        await mutateDeck(bootstrap.mode, {
          kind: "create",
          id,
          name,
          description,
        });
      }
      notify(
        remove
          ? "Đã xóa bộ từ. Tiến độ học vẫn được giữ nguyên."
          : deck
            ? "Đã cập nhật bộ từ."
            : "Đã tạo bộ từ.",
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được bộ từ.");
      setBusy(false);
    }
  }
  return (
    <DeckModal
      title={remove ? "Xóa bộ từ" : deck ? "Chỉnh sửa bộ từ" : "Tạo bộ từ mới"}
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {remove ? (
          <p>
            Xóa “{deck?.name}” cùng liên kết thành viên? Từ vựng, các bộ khác và
            tiến độ học được giữ nguyên.
          </p>
        ) : (
          <>
            <label>
              Tên bộ từ
              <input
                autoFocus
                value={name}
                required
                maxLength={80}
                disabled={busy}
                onChange={(e) => {
                  setName(e.target.value);
                  request.current = null;
                }}
                placeholder="Ví dụ: Từ dễ nhầm"
              />
            </label>
            <label>
              Mô tả
              <textarea
                value={description}
                maxLength={500}
                disabled={busy}
                onChange={(e) => {
                  setDescription(e.target.value);
                  request.current = null;
                }}
                rows={3}
                placeholder="Bạn muốn học gì với bộ này?"
              />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
            {error.includes("tab khác") && (
              <Button type="button" variant="ghost" onClick={onClose}>
                Đóng và tải lại bộ từ
              </Button>
            )}
          </p>
        )}
        <footer>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Hủy
          </Button>
          <Button type="submit" disabled={busy || (!remove && !name.trim())}>
            {busy
              ? "Đang lưu…"
              : remove
                ? "Xóa bộ"
                : deck
                  ? "Lưu thay đổi"
                  : "Tạo bộ"}
          </Button>
        </footer>
      </form>
    </DeckModal>
  );
}
export function DecksOverview() {
  const { ready } = useLearning(),
    { decks, loaded, error, refresh } = useDeckList();
  const [query, setQuery] = useState(""),
    [chosen, setChosen] = useState<string[]>([]),
    [editor, setEditor] = useState<{ deck?: Deck; remove?: boolean } | null>(
      null,
    ),
    [studying, setStudying] = useState(false);
  const refs = chosen.filter((id) => decks.some((d) => d.id === id)),
    selection = useDeckStudy(refs);
  if (!ready || !loaded) return <LoadingState label="Đang mở Bộ từ của tôi…" />;
  const custom = decks.filter(
    (d) =>
      !d.smart &&
      d.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const card = (deck: Deck) => (
    <article
      className={`card deck-card ${refs.includes(deck.id) ? "selected" : ""}`}
      key={deck.id}
    >
      <div className="deck-card-top">
        <span className="deck-icon">
          <FolderHeart size={23} />
        </span>
        <label className="checkbox-label">
          <input
            type="checkbox"
            aria-label={`Chọn bộ ${deck.name}`}
            checked={refs.includes(deck.id)}
            onChange={(e) =>
              setChosen((old) =>
                e.target.checked
                  ? [...old, deck.id]
                  : old.filter((id) => id !== deck.id),
              )
            }
          />
          <span className="sr-only">Chọn bộ</span>
        </label>
      </div>
      <Link href={`/decks/${deck.id}`} className="deck-card-link">
        <h2>{deck.name}</h2>
        <p>
          {deck.description || "Bộ từ dành riêng cho hành trình học của bạn."}
        </p>
        <strong>{number(deck.total)} mục từ</strong>
      </Link>
      {!deck.smart && (
        <>
          <div className="mini-progress">
            <span
              style={{
                width: `${deck.total ? (deck.studied / deck.total) * 100 : 0}%`,
              }}
            />
          </div>
          <small>
            {number(deck.studied)} / {number(deck.total)} đã học
          </small>
        </>
      )}
      <div className="deck-card-bottom">
        <Link className="text-link" href={`/decks/${deck.id}`}>
          Mở bộ <ArrowRight size={15} />
        </Link>
        {!deck.smart && (
          <div>
            <button
              aria-label={`Sửa bộ ${deck.name}`}
              onClick={() => setEditor({ deck })}
            >
              <Pencil size={16} />
            </button>
            <button
              aria-label={`Xóa bộ ${deck.name}`}
              onClick={() => setEditor({ deck, remove: true })}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
    </article>
  );
  return (
    <div className="page-enter decks-page">
      <PageHeading
        eyebrow="GOM TỪ · HỌC THEO CÁCH CỦA BẠN"
        title="Bộ từ của tôi"
        description="Một nơi cho những từ bạn muốn ghi nhớ. Chọn nhiều bộ để học cùng nhau."
      >
        <Button onClick={() => setEditor({})}>
          <Plus size={17} />
          Tạo bộ mới
        </Button>
      </PageHeading>
      {error && (
        <div role="alert" className="form-error">
          {error}
          <Button variant="ghost" onClick={refresh}>
            Tải lại
          </Button>
        </div>
      )}
      <section aria-label="Bộ tự cập nhật">
        <h2 className="deck-section-heading">
          Truy cập nhanh <span>Tự cập nhật</span>
        </h2>
        <div className="decks-grid">
          {smartDecks
            .map((id) => decks.find((d) => d.id === id))
            .filter((d): d is Deck => !!d)
            .map(card)}
        </div>
      </section>
      <section aria-label="Bộ tự tạo">
        <div className="deck-section-toolbar">
          <h2>Bộ tự tạo</h2>
          <input
            aria-label="Tìm bộ từ"
            placeholder="Tìm tên bộ từ…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="decks-grid">{custom.map(card)}</div>
        {!custom.length && (
          <div className="card deck-empty">
            <FolderHeart size={34} />
            <h3>
              {query ? "Không tìm thấy bộ phù hợp" : "Tạo bộ đầu tiên của bạn"}
            </h3>
            <p>
              Gom từ nhiều Band và chủ đề vào một bộ riêng, rồi học với
              Flashcards hoặc Luyện tập.
            </p>
            {!query && (
              <Button onClick={() => setEditor({})}>Tạo bộ mới</Button>
            )}
          </div>
        )}
      </section>
      {!!refs.length && (
        <aside className="deck-selection-bar" aria-label="Các bộ đã chọn">
          <div>
            <strong>{refs.length} bộ đã chọn</strong>
            <p role="status">
              {selection.error
                ? selection.error
                : selection.snapshot
                  ? `${number(selection.snapshot.total)} mục từ duy nhất`
                  : "Đang gộp từ…"}
            </p>
          </div>
          <Button variant="ghost" onClick={() => setChosen([])}>
            Bỏ chọn
          </Button>
          <Button
            disabled={!selection.snapshot?.ids.length || !!selection.error}
            onClick={() => setStudying(true)}
          >
            Flashcards / Luyện tập <ArrowRight size={16} />
          </Button>
        </aside>
      )}
      {editor && (
        <DeckEditor
          {...editor}
          onClose={() => {
            setEditor(null);
            refresh();
          }}
        />
      )}
      {studying && (
        <DeckStudyDialog refs={refs} onClose={() => setStudying(false)} />
      )}
    </div>
  );
}
