"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers3,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useLearning } from "../provider";
import { PageHeading, LoadingState, EmptyState } from "../common";
import { Button } from "../ui/button";
import { bands } from "@/lib/domain/types";
import { aggregateProgress } from "@/lib/domain/catalogue";
import { entryId } from "@/lib/domain/validation";
import { startPractice, listPractice } from "@/lib/practice-client";
import type {
  PracticeSource,
  PracticeStart,
  PracticeSummary,
} from "@/lib/domain/practice";
import { number } from "@/lib/utils";
import { QuickModeToggle } from "./quick-mode";
import { useMandarinVoice } from "./listening-prompt";
import { previewPractice } from "@/app/practice-actions";
import { actionValue } from "@/lib/domain/action-result";
import { exerciseTypes, type ExerciseType } from "@/lib/domain/practice";
import { exerciseLabels } from "@/lib/domain/practice-exercises";

export type PracticeSetupSeed = {
  band?: string;
  topic?: string;
  group?: number;
  entries?: string[];
};
export function PracticeSetup({ seed = {} }: { seed?: PracticeSetupSeed }) {
  const { ready, preferences } = useLearning();
  return ready ? (
    <SetupForm key={preferences.lessonSize} seed={seed} />
  ) : (
    <LoadingState label="Đang mở Luyện tập…" />
  );
}
function SetupForm({ seed }: { seed: PracticeSetupSeed }) {
  const voice = useMandarinVoice();
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [types, setTypes] = useState<ExerciseType[]>([...exerciseTypes]);
  const [preview, setPreview] = useState<{
    key: string;
    requestId: string;
    total: number;
    exerciseCounts?: Record<ExerciseType, number>;
    boardCount?: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const { bootstrap, preferences, progress } = useLearning(),
    router = useRouter();
  const initialBand = bands.includes(seed.band as (typeof bands)[number])
    ? seed.band!
    : preferences.preferredBand || "1";
  const [sourceMode, setSourceMode] = useState<
    "groups" | "band" | "personal" | "entries"
  >(seed.entries?.length ? "entries" : "groups");
  const [collectionType, setCollectionType] = useState<"band" | "topic">(
    seed.topic ? "topic" : "band",
  );
  const [collectionId, setCollectionId] = useState(seed.topic ?? initialBand);
  const [band, setBand] = useState(initialBand),
    [personal, setPersonal] = useState<"learned" | "favorite" | "difficult">(
      "learned",
    );
  const [selected, setSelected] = useState<number[]>(
      seed.group ? [seed.group] : [],
    ),
    [page, setPage] = useState(1);
  const [mode, setMode] = useState<PracticeStart["mode"]>("learn"),
    [direction, setDirection] = useState<PracticeStart["direction"]>("mixed");
  const [language, setLanguage] = useState(preferences.language),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [download, setDownload] = useState(""),
    [recent, setRecent] = useState<PracticeSummary[]>([]),
    [recentError, setRecentError] = useState("");
  const request = useRef<string | null>(null);
  const explicit = useMemo(
    () =>
      [...new Set(seed.entries ?? [])].filter(
        (id) => entryId.safeParse(id).success,
      ),
    [seed.entries],
  );
  const collectionIds = useMemo(
    () =>
      collectionType === "band"
        ? Array.from(
            { length: bootstrap.counts[collectionId] ?? 0 },
            (_, i) =>
              `hsk30-b${collectionId === "7-9" ? "79" : collectionId}-${String(i + 1).padStart(4, "0")}`,
          )
        : (bootstrap.topicEntryIds[collectionId] ?? []),
    [bootstrap.counts, bootstrap.topicEntryIds, collectionType, collectionId],
  );
  const groupCount = Math.ceil(collectionIds.length / preferences.lessonSize),
    pageCount = Math.max(1, Math.ceil(groupCount / 12));
  const selectedIds = useMemo(
    () =>
      collectionIds.filter((_, index) =>
        selected.includes(Math.floor(index / preferences.lessonSize) + 1),
      ),
    [collectionIds, selected, preferences.lessonSize],
  );
  const personalCount = Object.values(progress).filter((p) =>
    personal === "learned" ? p.state !== "NEW" : p[personal],
  ).length;
  const count =
    sourceMode === "groups"
      ? selectedIds.length
      : sourceMode === "band"
        ? (bootstrap.counts[band] ?? 0)
        : sourceMode === "personal"
          ? personalCount
          : explicit.length;
  useEffect(() => {
    let active = true;
    listPractice(bootstrap.mode)
      .then((rows) => {
        if (active) setRecent(rows);
      })
      .catch((e) => {
        if (active)
          setRecentError(
            e instanceof Error ? e.message : "Không tải được bài gần đây.",
          );
      });
    return () => {
      active = false;
    };
  }, [bootstrap.mode]);
  function resetGroups() {
    setSelected([]);
    setPage(1);
    request.current = null;
  }
  function chooseSource(value: "groups" | "band" | "personal") {
    setSourceMode(value);
    setMode(value === "band" ? "exam" : "learn");
    setError("");
    request.current = null;
  }
  const source: PracticeSource =
    sourceMode === "groups"
      ? {
          kind: "groups",
          collectionType,
          collectionId,
          groups: [...selected].sort((a, b) => a - b),
        }
      : sourceMode === "band"
        ? { kind: "band", band: band as (typeof bands)[number] }
        : sourceMode === "personal"
          ? { kind: "personal", filter: personal }
          : { kind: "entries", ids: explicit };
  const chosenTypes =
    mode === "exam" ? (["meaning_choice"] as ExerciseType[]) : types;
  const configuration = JSON.stringify({
    source,
    mode,
    direction,
    language,
    lessonSize: preferences.lessonSize,
    exerciseTypes: chosenTypes,
  });
  const personalIds = Object.values(progress)
    .filter((p) => (personal === "learned" ? p.state !== "NEW" : p[personal]))
    .map((p) => p.vocabulary_id);
  const personalKey =
    sourceMode === "personal" ? JSON.stringify(personalIds) : "[]";
  const previewKey = configuration + personalKey;
  useEffect(() => {
    if (!count || !JSON.parse(configuration).exerciseTypes.length) return;
    let active = true;
    const timer = setTimeout(() => {
      const requestId = crypto.randomUUID();
      previewPractice(
        { ...JSON.parse(configuration), requestId },
        JSON.parse(personalKey),
      )
        .then(actionValue)
        .then((result) => {
          if (active) {
            setPreview({
              key: previewKey,
              requestId,
              total: result.total,
              exerciseCounts: result.exerciseCounts,
              boardCount: result.boardCount,
            });
            setPreviewError(null);
          }
        })
        .catch((e) => {
          if (active)
            setPreviewError({
              key: previewKey,
              message:
                e instanceof Error ? e.message : "Không kiểm tra được bộ từ.",
            });
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [configuration, personalKey, previewKey, count, previewAttempt]);
  const previewReady =
    preview?.key === previewKey && previewError?.key !== previewKey;
  const voiceMissing =
    chosenTypes.includes("listening_choice") && voice !== "ready";
  async function begin() {
    if (!count || busy || !previewReady || voiceMissing || !chosenTypes.length)
      return;
    const requestId = request.current ?? preview.requestId;
    request.current = requestId;
    setBusy(true);
    setError("");
    setDownload("");
    try {
      const session = await startPractice(
        bootstrap.mode,
        {
          requestId,
          source,
          mode,
          direction,
          language,
          lessonSize: preferences.lessonSize,
          exerciseTypes: chosenTypes,
        },
        progress,
        (done, total) =>
          setDownload(`Đã chuẩn bị ${number(done)} / ${number(total)} câu`),
      );
      router.push(`/practice/${session.id}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Không tạo được bài luyện. Hãy thử lại.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="page-enter practice-page">
      <PageHeading
        eyebrow="NHỚ CHỮ · HIỂU NGHĨA"
        title="Đưa vốn từ vào luyện tập."
        description="Chọn bộ từ của bạn. Mỗi mục từ một câu trong lượt đầu, hỏi lại khi bạn muốn."
      />
      {recent.some((s) => s.status === "active") && (
        <section className="practice-resume" aria-label="Bài đang làm">
          <h2>Tiếp tục bài đang làm</h2>
          {recent
            .filter((s) => s.status === "active")
            .slice(0, 3)
            .map((s) => (
              <Link
                className="card practice-recent-row"
                href={`/practice/${s.id}`}
                key={s.id}
              >
                <div>
                  <strong>{s.title}</strong>
                  <span>
                    {s.mode === "exam" ? "Thi thử" : "Luyện học"} ·{" "}
                    {number(s.answered)} / {number(s.total)} câu đã trả lời
                  </span>
                </div>
                <ArrowRight size={18} />
              </Link>
            ))}
        </section>
      )}
      <section className="card practice-setup" aria-label="Thiết lập bài luyện">
        <div className="practice-section-title">
          <Layers3 size={20} />
          <div>
            <h2>Chọn từ để luyện</h2>
            <p>Tiến độ học và kết quả luyện tập được theo dõi riêng.</p>
          </div>
        </div>
        <div
          className="practice-source-tabs"
          role="group"
          aria-label="Nguồn từ vựng"
        >
          {(
            [
              ["groups", "Theo nhóm"],
              ["band", "Toàn Band"],
              ["personal", "Từ của bạn"],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={sourceMode === value}
              key={value}
              disabled={busy}
              onClick={() => chooseSource(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <fieldset disabled={busy} className="practice-source-fields">
          <legend className="sr-only">Nguồn từ vựng</legend>
          {sourceMode === "groups" && (
            <>
              <div className="practice-field-grid">
                <label>
                  Loại bộ từ
                  <select
                    value={collectionType}
                    onChange={(e) => {
                      const value = e.target.value as "band" | "topic";
                      setCollectionType(value);
                      setCollectionId(
                        value === "band"
                          ? initialBand
                          : (bootstrap.topics[0]?.id ?? ""),
                      );
                      resetGroups();
                    }}
                  >
                    <option value="band">HSK Band</option>
                    <option value="topic">Chủ đề</option>
                  </select>
                </label>
                <label>
                  {collectionType === "band" ? "Band" : "Chủ đề"}
                  <select
                    value={collectionId}
                    onChange={(e) => {
                      setCollectionId(e.target.value);
                      resetGroups();
                    }}
                  >
                    {collectionType === "band"
                      ? bands.map((b) => (
                          <option value={b} key={b}>
                            Band {b} · {number(bootstrap.counts[b] ?? 0)} từ
                          </option>
                        ))
                      : bootstrap.topics.map((t) => (
                          <option value={t.id} key={t.id}>
                            {t.name} ·{" "}
                            {number(bootstrap.topicCounts[t.id] ?? 0)} từ
                          </option>
                        ))}
                  </select>
                </label>
              </div>
              <div className="practice-group-heading">
                <p>
                  Mỗi nhóm {preferences.lessonSize} từ ·{" "}
                  <Link href="/settings" className="text-link">
                    Đổi số từ
                  </Link>
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={groupCount > 0 && selected.length === groupCount}
                    ref={(node) => {
                      if (node)
                        node.indeterminate =
                          selected.length > 0 && selected.length < groupCount;
                    }}
                    onChange={(e) => {
                      setSelected(
                        e.target.checked
                          ? Array.from({ length: groupCount }, (_, i) => i + 1)
                          : [],
                      );
                      request.current = null;
                    }}
                  />
                  Chọn tất cả {groupCount} nhóm
                </label>
              </div>
              {groupCount > 0 ? (
                <div className="practice-groups">
                  {Array.from(
                    { length: Math.min(12, groupCount - (page - 1) * 12) },
                    (_, i) => {
                      const group = (page - 1) * 12 + i + 1,
                        ids = collectionIds.slice(
                          (group - 1) * preferences.lessonSize,
                          group * preferences.lessonSize,
                        ),
                        stats = aggregateProgress(ids, progress),
                        checked = selected.includes(group);
                      return (
                        <label
                          className={`card practice-group-card${checked ? " selected" : ""}`}
                          key={group}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            aria-label={`Chọn nhóm ${group}`}
                            onChange={(e) => {
                              setSelected((old) =>
                                e.target.checked
                                  ? [...old, group]
                                  : old.filter((n) => n !== group),
                              );
                              request.current = null;
                            }}
                          />
                          <span className="lesson-number">
                            {String(group).padStart(2, "0")}
                          </span>
                          <span>
                            <strong>Nhóm từ {group}</strong>
                            <small>
                              {ids.length} từ · {stats.studied} đã học
                            </small>
                          </span>
                          {checked && <Check size={17} />}
                        </label>
                      );
                    },
                  )}
                </div>
              ) : (
                <EmptyState
                  title="Bộ từ này chưa có nhóm"
                  description="Hãy chọn một Band hoặc chủ đề khác."
                />
              )}
              {pageCount > 1 && (
                <div className="lesson-pagination">
                  <Button
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={16} />
                    Trước
                  </Button>
                  <span>
                    {page} / {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    disabled={page === pageCount}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Sau
                    <ChevronRight size={16} />
                  </Button>
                </div>
              )}
            </>
          )}
          {sourceMode === "band" && (
            <div className="practice-band-source">
              <label>
                Band cần kiểm tra
                <select
                  value={band}
                  onChange={(e) => {
                    setBand(e.target.value);
                    request.current = null;
                  }}
                >
                  {bands.map((b) => (
                    <option value={b} key={b}>
                      Band {b} · {number(bootstrap.counts[b] ?? 0)} mục từ
                    </option>
                  ))}
                </select>
              </label>
              <p className="content-note">
                Bài gồm toàn bộ {number(count)} mục từ của Band, kể cả từ chưa
                học. Bài dài được tự lưu để bạn tiếp tục sau.
              </p>
            </div>
          )}
          {sourceMode === "personal" && (
            <label>
              Bộ từ cá nhân
              <select
                value={personal}
                onChange={(e) => {
                  setPersonal(e.target.value as typeof personal);
                  request.current = null;
                }}
              >
                <option value="learned">Từ đã học</option>
                <option value="favorite">Từ đã lưu</option>
                <option value="difficult">Từ khó</option>
              </select>
            </label>
          )}
          {sourceMode === "entries" && (
            <div className="practice-custom-source">
              <strong>Nhóm vừa học · {number(explicit.length)} mục từ</strong>
              <p>Giữ đúng những mục từ từ buổi Flashcards của bạn.</p>
              <Button variant="ghost" onClick={() => chooseSource("groups")}>
                Chọn bộ khác
              </Button>
            </div>
          )}
        </fieldset>
        <div className="practice-config practice-field-grid">
          <label>
            Chế độ
            <select
              aria-label="Chế độ"
              disabled={busy}
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                request.current = null;
              }}
            >
              <option value="learn">Luyện học · xem đáp án sau mỗi câu</option>
              <option value="exam">Thi thử · xem đáp án sau khi nộp</option>
            </select>
          </label>
          <label>
            Dạng câu hỏi
            <select
              aria-label="Dạng câu hỏi"
              disabled={busy}
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as typeof direction);
                request.current = null;
              }}
            >
              <option value="mixed">Trộn hai chiều</option>
              <option value="word-meaning">Chữ Hán → nghĩa</option>
              <option value="meaning-word">Nghĩa → chữ Hán</option>
            </select>
          </label>
          <label>
            Ngôn ngữ nghĩa
            <select
              aria-label="Ngôn ngữ nghĩa"
              disabled={busy}
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value as "vi" | "en");
                request.current = null;
              }}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">Tiếng Anh</option>
            </select>
          </label>
        </div>
        {mode === "learn" && (
          <>
            <fieldset className="practice-exercise-types" disabled={busy}>
              <legend>Loại bài luyện</legend>
              <p className="muted">
                Chọn một hoặc nhiều dạng. Mỗi từ chỉ xuất hiện ở một dạng trong
                lượt đầu.
              </p>
              {exerciseTypes.map((type) => (
                <label className="checkbox-label" key={type}>
                  <input
                    type="checkbox"
                    checked={types.includes(type)}
                    onChange={(e) => {
                      setTypes((old) =>
                        e.target.checked
                          ? [...old, type]
                          : old.filter((t) => t !== type),
                      );
                      request.current = null;
                    }}
                  />
                  {exerciseLabels[type]}
                </label>
              ))}
              {!types.length && (
                <p role="alert">Hãy chọn ít nhất một loại bài.</p>
              )}
              {types.includes("listening_choice") && voice !== "ready" && (
                <p className="content-note" role="status">
                  {voice === "loading"
                    ? "Đang kiểm tra giọng Mandarin…"
                    : "Thiết bị chưa có giọng Mandarin. Hãy cài giọng tiếng Trung rồi tải lại, hoặc bỏ chọn Nghe chọn chữ để tiếp tục."}
                </p>
              )}
            </fieldset>
            <QuickModeToggle disabled={busy} />
          </>
        )}
        {count > 0 && chosenTypes.length > 0 && (
          <div className="practice-exercise-preview" role="status">
            {previewError?.key === previewKey ? (
              <div className="form-error" role="alert">
                {previewError.message}
                <br />
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setPreview(null);
                    setPreviewError(null);
                    setPreviewAttempt((n) => n + 1);
                  }}
                >
                  Kiểm tra lại
                </Button>
              </div>
            ) : previewReady ? (
              <>
                <strong>Phân bổ {number(preview.total)} từ</strong>
                <p>
                  {chosenTypes
                    .map(
                      (t) =>
                        `${exerciseLabels[t]}: ${number(preview.exerciseCounts?.[t] ?? 0)} từ`,
                    )
                    .join(" · ")}
                  {!!preview.boardCount && ` · ${preview.boardCount} bảng ghép`}
                </p>
              </>
            ) : (
              <p>Đang kiểm tra toàn bộ từ và phân bổ dạng bài…</p>
            )}
          </div>
        )}
        <div className="practice-start">
          <div>
            <strong>
              {number(count)} mục từ · {number(count)} câu
            </strong>
            <p>
              {sourceMode === "groups"
                ? `${selected.length} nhóm đã chọn · `
                : ""}
              Mỗi từ một lần trong lượt đầu.
            </p>
          </div>
          <Button
            disabled={
              busy ||
              !count ||
              !chosenTypes.length ||
              !previewReady ||
              voiceMissing
            }
            onClick={() => void begin()}
          >
            <Play size={18} />
            {busy ? "Đang chuẩn bị…" : "Bắt đầu"}
            <ArrowRight size={18} />
          </Button>
        </div>
        {busy && (
          <p role="status" className="content-note">
            {download || `Đang chuẩn bị đầy đủ ${number(count)} câu hỏi…`}
          </p>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
            <br />
            Bạn có thể bấm Bắt đầu để thử lại.
          </div>
        )}
      </section>
      {!!recent.length && (
        <details className="practice-history">
          <summary>
            <RotateCcw size={16} />
            Bài gần đây ({recent.length})
          </summary>
          {recent.map((s) => (
            <Link
              className="card practice-recent-row"
              href={`/practice/${s.id}${s.status === "submitted" ? "/result" : ""}`}
              key={s.id}
            >
              <div>
                <strong>{s.title}</strong>
                <span>
                  {s.status === "submitted" ? "Đã nộp" : "Đang làm"} ·{" "}
                  {s.mode === "exam" ? "Thi thử" : "Luyện học"} ·{" "}
                  {number(s.answered)} / {number(s.total)} câu
                </span>
              </div>
              <ArrowRight size={17} />
            </Link>
          ))}
        </details>
      )}
      {recentError && (
        <p className="content-note" role="status">
          Chưa tải được lịch sử: {recentError}
        </p>
      )}
      <p className="practice-footer-note">
        <Sparkles size={16} />
        Chọn đáp án để kiểm tra trí nhớ. Bạn quyết định từ nào cần hỏi lại.
      </p>
    </div>
  );
}
