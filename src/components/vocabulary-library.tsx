"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Filter,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { useLearning } from "./provider";
import {
  EmptyState,
  LoadingState,
  PageHeading,
  SpeakButton,
  StatusBadge,
} from "./common";
import { Button } from "./ui/button";
import { bands, type Filters, type PageResult } from "@/lib/domain/types";
import { number } from "@/lib/utils";
import { AddToDecksButton } from "./decks/add-dialog";
const initialFilters: Filters = {
  query: "",
  band: "",
  topic: "",
  state: "",
  favorite: false,
  difficult: false,
  sort: "order",
  page: 1,
  pageSize: 30,
};
export function VocabularyLibrary({
  initial,
  band = "",
  topic = "",
  embedded = false,
  picker,
}: {
  initial: PageResult;
  band?: string;
  topic?: string;
  embedded?: boolean;
  picker?: { ids: string[]; onChange: (ids: string[]) => void };
}) {
  const { bootstrap, progress, preferences, ready, pending, mutate, notify } =
    useLearning();
  const [filters, setFilters] = useState<Filters>({
    ...initialFilters,
    band,
    topic,
  });
  const [result, setResult] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [ownSelection, setOwnSelection] = useState<string[]>([]);
  const selected = picker?.ids ?? ownSelection,
    setSelected = picker?.onChange ?? setOwnSelection;
  const lastRequest = useRef(0);
  const change = useCallback(
    (patch: Partial<Filters>) =>
      setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 })),
    [],
  );
  useEffect(() => {
    if (!ready) return;
    const requestId = ++lastRequest.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/vocabulary/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters,
            ...(bootstrap.mode === "trial" ? { trialProgress: progress } : {}),
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Không thể tải dữ liệu.");
        if (lastRequest.current === requestId) setResult(data);
      } catch (e) {
        if (
          e instanceof Error &&
          e.name !== "AbortError" &&
          lastRequest.current === requestId
        )
          setError(e.message);
      } finally {
        if (lastRequest.current === requestId) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, progress, bootstrap.mode, ready, retry]);
  const active =
    filters.query ||
    filters.state ||
    filters.favorite ||
    filters.difficult ||
    filters.band !== band ||
    filters.topic !== topic;
  return (
    <section className={embedded ? "library-embedded" : "page-enter"}>
      {!embedded && (
        <PageHeading
          eyebrow="KHÁM PHÁ & GHI NHỚ"
          title="Thư viện từ vựng"
          description={`${number(bootstrap.total)} mục từ HSK. Một nơi cho mọi điều bạn học.`}
        >
          <Button asChild variant="outline">
            <Link href="/flashcards">
              <Star size={16} />
              Học với flashcards
            </Link>
          </Button>
        </PageHeading>
      )}
      <div className="card library-card">
        <div className="library-toolbar">
          <div className="search-input">
            <Search size={18} />
            <input
              aria-label="Tìm từ vựng"
              placeholder="Tìm chữ Hán, pinyin hoặc nghĩa…"
              value={filters.query}
              onChange={(e) => change({ query: e.target.value })}
              maxLength={100}
            />
            {filters.query && (
              <button
                aria-label="Xóa từ khóa"
                onClick={() => change({ query: "" })}
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div className="filter-select">
            <select
              aria-label="Lọc HSK Band"
              value={filters.band}
              onChange={(e) => change({ band: e.target.value })}
              disabled={!!band}
            >
              <option value="">Tất cả Band</option>
              {bands.map((b) => (
                <option key={b} value={b}>
                  Band {b}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
          <div className="filter-select">
            <select
              aria-label="Lọc chủ đề"
              value={filters.topic}
              onChange={(e) => change({ topic: e.target.value })}
              disabled={!!topic}
            >
              <option value="">Tất cả chủ đề</option>
              {bootstrap.topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
          <div className="filter-select">
            <select
              aria-label="Lọc trạng thái"
              value={filters.state}
              onChange={(e) => change({ state: e.target.value })}
            >
              <option value="">Mọi trạng thái</option>
              <option value="NEW">Chưa học</option>
              <option value="LEARNING">Đang học</option>
              <option value="MASTERED">Thành thạo</option>
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        <div className="library-subtoolbar">
          <div className="filter-chips">
            <button
              className={`filter-chip ${filters.favorite ? "selected" : ""}`}
              aria-pressed={filters.favorite}
              onClick={() => change({ favorite: !filters.favorite })}
            >
              <Bookmark size={14} />
              Đã lưu
            </button>
            <button
              className={`filter-chip ${filters.difficult ? "selected" : ""}`}
              aria-pressed={filters.difficult}
              onClick={() => change({ difficult: !filters.difficult })}
            >
              <Filter size={14} />
              Từ khó
            </button>
            {active && (
              <button
                className="clear-filter"
                onClick={() => setFilters({ ...initialFilters, band, topic })}
              >
                Xóa bộ lọc
                <X size={12} />
              </button>
            )}
          </div>
          <label className="sort-label">
            <SlidersHorizontal size={14} />
            <span className="sr-only">Sắp xếp</span>
            <select
              value={filters.sort}
              aria-label="Sắp xếp từ vựng"
              onChange={(e) =>
                change({ sort: e.target.value as Filters["sort"] })
              }
            >
              <option value="order">Thứ tự nguồn</option>
              <option value="band">Theo HSK Band</option>
              <option value="progress">Tiến độ học</option>
            </select>
          </label>
        </div>
        <div className="deck-library-selection">
          <label className="checkbox-label">
            <input
              type="checkbox"
              aria-label="Chọn tất cả từ trên trang"
              checked={
                result.items.length > 0 &&
                result.items.every((v) => selected.includes(v.id))
              }
              disabled={!ready || loading}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [
                        ...new Set([
                          ...selected,
                          ...result.items.map((v) => v.id),
                        ]),
                      ]
                    : selected.filter(
                        (id) => !result.items.some((v) => v.id === id),
                      ),
                )
              }
            />
            Chọn trang này
          </label>
          <span>{selected.length} từ đã chọn</span>
          <Button
            variant="ghost"
            disabled={!selected.length}
            onClick={() => setSelected([])}
          >
            Bỏ chọn từ
          </Button>
          {!picker && <AddToDecksButton ids={selected} disabled={!ready} />}
        </div>
        {error ? (
          <div className="inline-error" role="alert">
            <p>{error}</p>
            <Button variant="outline" onClick={() => setRetry((r) => r + 1)}>
              Thử lại
            </Button>
          </div>
        ) : (
          <div
            className={`table-container ${loading ? "table-loading" : ""}`}
            aria-busy={loading}
          >
            {loading && <span className="table-loading-line" />}
            <table className="vocabulary-table">
              <thead>
                <tr>
                  <th>
                    <span className="sr-only">Chọn từ</span>
                  </th>
                  <th className="bookmark-column">
                    <Bookmark size={14} />
                    <span className="sr-only">Lưu</span>
                  </th>
                  <th>TỪ VỰNG</th>
                  <th>PINYIN</th>
                  <th>
                    NGHĨA{" "}
                    {preferences.language === "vi" ? "TIẾNG VIỆT" : "TIẾNG ANH"}
                  </th>
                  <th>BAND</th>
                  <th>CHỦ ĐỀ</th>
                  <th>TRẠNG THÁI</th>
                  <th>
                    <span className="sr-only">Đánh dấu đã học</span>
                  </th>
                  {!picker && (
                    <th>
                      <span className="sr-only">Bộ từ</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {result.items.map((v) => {
                  const p = progress[v.id];
                  return (
                    <tr key={v.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${v.word} (${v.id})`}
                          checked={selected.includes(v.id)}
                          disabled={!ready || loading}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...new Set([...selected, v.id])]
                                : selected.filter((id) => id !== v.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className={`bookmark-button ${p?.favorite ? "is-saved" : ""}`}
                          disabled={!ready || pending[v.id]}
                          aria-label={`${p?.favorite ? "Bỏ lưu" : "Lưu"} ${v.word}`}
                          aria-pressed={p?.favorite ?? false}
                          onClick={async () => {
                            if (await mutate(v.id, { favorite: !p?.favorite }))
                              notify(
                                p?.favorite
                                  ? "Đã bỏ lưu từ vựng."
                                  : "Đã lưu từ vựng.",
                              );
                          }}
                        >
                          <Bookmark
                            size={17}
                            fill={p?.favorite ? "currentColor" : "none"}
                          />
                        </button>
                      </td>
                      <td>
                        <div className="word-cell">
                          <Link href={`/vocabulary/${v.id}`} lang="zh-CN">
                            {v.word}
                          </Link>
                          <SpeakButton word={v.word} audioUrl={v.audio_url} />
                        </div>
                      </td>
                      <td className="pinyin-cell">
                        {preferences.showPinyin ? v.pinyin : "—"}
                      </td>
                      <td className="meaning-cell">
                        {v.senses.some((s) => s[preferences.language]) ? (
                          v.senses
                            .map((s) => s[preferences.language])
                            .filter(Boolean)
                            .join("; ")
                        ) : (
                          <span className="missing-content">Chưa có nghĩa</span>
                        )}
                        {v.senses.some(
                          (s) => s.translation_meta?.[preferences.language],
                        ) && (
                          <small className="missing-content">
                            {" "}
                            · Có bản dịch máy chưa duyệt
                          </small>
                        )}
                      </td>
                      <td>
                        <Link href={`/bands/${v.band}`} className="band-badge">
                          {v.band}
                        </Link>
                      </td>
                      <td>
                        {v.topics.length ? (
                          <Link
                            className="topic-table-label"
                            href={`/topics/${v.topics[0]}`}
                          >
                            {
                              bootstrap.topics.find((t) => t.id === v.topics[0])
                                ?.name
                            }
                          </Link>
                        ) : (
                          <span className="missing-content">
                            Chưa phân loại
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge state={p?.state} />
                        {p?.suspended && (
                          <span className="suspended-label">Tạm dừng</span>
                        )}
                      </td>
                      <td>
                        <button
                          className={`studied-button ${p?.state && p.state !== "NEW" ? "is-studied" : ""}`}
                          disabled={
                            !ready ||
                            pending[v.id] ||
                            p?.state === "LEARNING" ||
                            p?.state === "MASTERED"
                          }
                          aria-label={`Đánh dấu đã học ${v.word}`}
                          title="Đánh dấu đã học"
                          onClick={() =>
                            void mutate(v.id, { state: "LEARNING" })
                          }
                        >
                          <Check size={16} />
                        </button>
                      </td>
                      {!picker && (
                        <td>
                          <AddToDecksButton
                            ids={[v.id]}
                            label="Vào bộ"
                            disabled={!ready}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!result.items.length && !loading && (
              <EmptyState
                action="Bỏ bộ lọc"
                onAction={() => setFilters({ ...initialFilters, band, topic })}
              />
            )}
          </div>
        )}
        <div className="table-footer">
          <p>
            <strong>{number(result.total)}</strong> mục từ
            {result.total > 0 && (
              <span>
                {" "}
                · Trang {result.page} /{" "}
                {Math.max(1, Math.ceil(result.total / result.pageSize))}
              </span>
            )}
          </p>
          <div>
            <Button
              variant="outline"
              size="sm"
              aria-label="Trang trước"
              disabled={loading || result.page <= 1}
              onClick={() => change({ page: result.page - 1 })}
            >
              <ArrowLeft size={14} />
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Trang sau"
              disabled={
                loading || result.page * result.pageSize >= result.total
              }
              onClick={() => change({ page: result.page + 1 })}
            >
              Sau
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </div>
      {!embedded && (
        <p className="catalogue-note">
          <span className="status-dot" />
          Nghĩa từ có nguồn từ điển; phần dịch tự động được ghi nhãn chưa duyệt.
          Ví dụ được kiểm tra từ vựng theo Band.{" "}
          <Link href="/sources">
            Xem nguồn dữ liệu <ArrowRight size={12} />
          </Link>
        </p>
      )}
      {!ready && <LoadingState label="Đang khôi phục tiến độ…" />}
    </section>
  );
}
