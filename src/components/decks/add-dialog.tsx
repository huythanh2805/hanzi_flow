"use client";
import { useRef, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { useLearning } from "../provider";
import { Button } from "../ui/button";
import { mutateDeck } from "@/lib/deck-client";
import { useDeckList } from "./hooks";
import { DeckModal } from "./modal";
export function AddToDecksButton({
  ids,
  label = "Thêm vào bộ",
  disabled = false,
}: {
  ids: string[];
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled || !ids.length}
        onClick={() => setOpen(true)}
      >
        <FolderPlus size={17} />
        {label}
      </Button>
      {open && <AddToDecksDialog ids={ids} onClose={() => setOpen(false)} />}
    </>
  );
}
function AddToDecksDialog({
  ids,
  onClose,
}: {
  ids: string[];
  onClose: () => void;
}) {
  const { bootstrap, notify } = useLearning(),
    { decks, loaded, error: listError, refresh } = useDeckList();
  const [selected, setSelected] = useState<string[]>([]),
    [name, setName] = useState(""),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<string | null>(null);
  const targets = selected.filter((id) =>
    decks.some((d) => d.id === id && !d.smart),
  );
  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    const id = request.current ?? crypto.randomUUID();
    request.current = id;
    try {
      await mutateDeck(bootstrap.mode, {
        kind: "create",
        id,
        name,
        description: "",
      });
      setSelected((old) => [...old, id]);
      setName("");
      setCreating(false);
      request.current = null;
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được bộ từ.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await mutateDeck(bootstrap.mode, {
        kind: "add",
        targets,
        ids: [...new Set(ids)],
      });
      notify(
        `Đã lưu ${new Set(ids).size} mục từ vào ${targets.length} bộ. Mục đã có được giữ nguyên.`,
      );
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không thêm được từ. Hãy thử lại.",
      );
      setBusy(false);
    }
  }
  return (
    <DeckModal title="Thêm từ vào bộ" onClose={onClose} busy={busy}>
      <p className="muted">
        {new Set(ids).size} mục từ · Chọn một hoặc nhiều bộ tự tạo.
      </p>
      {listError && (
        <p role="alert" className="form-error">
          {listError}
          <Button variant="ghost" onClick={refresh}>
            Tải lại
          </Button>
        </p>
      )}
      {!loaded && <p role="status">Đang tải bộ từ…</p>}
      <div className="deck-targets">
        {decks
          .filter((d) => !d.smart)
          .map((d) => (
            <label key={d.id}>
              <input
                type="checkbox"
                disabled={busy}
                checked={selected.includes(d.id)}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked
                      ? [...old, d.id]
                      : old.filter((id) => id !== d.id),
                  )
                }
              />
              <span>
                <strong>{d.name}</strong>
                <small>{d.total} mục từ</small>
              </span>
            </label>
          ))}
      </div>
      {loaded && !decks.some((d) => !d.smart) && (
        <p>Bạn chưa có bộ tự tạo. Tạo bộ đầu tiên để lưu các từ này.</p>
      )}
      {creating ? (
        <div className="deck-inline-create">
          <label>
            Tên bộ mới
            <input
              autoFocus
              value={name}
              maxLength={80}
              disabled={busy}
              onChange={(e) => {
                setName(e.target.value);
                request.current = null;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void create();
                }
              }}
            />
          </label>
          <Button disabled={busy || !name.trim()} onClick={() => void create()}>
            Tạo bộ
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => setCreating(true)}
        >
          <Plus size={16} />
          Tạo bộ mới
        </Button>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <footer>
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Hủy
        </Button>
        <Button disabled={busy || !targets.length} onClick={() => void save()}>
          {busy ? "Đang lưu…" : "Lưu vào bộ đã chọn"}
        </Button>
      </footer>
    </DeckModal>
  );
}
