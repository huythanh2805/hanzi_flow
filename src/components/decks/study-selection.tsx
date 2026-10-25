"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Play } from "lucide-react";
import { useLearning } from "../provider";
import { Button } from "../ui/button";
import { DeckModal } from "./modal";
import { useDeckStudy, type DeckStudyState } from "./hooks";
import { number } from "@/lib/utils";
export function deckStudyUrl(
  path: "flashcards" | "practice",
  refs: string[],
  fingerprint: string,
  groups: number[] | undefined,
  size: number,
) {
  const query = new URLSearchParams({
    decks: refs.join(","),
    version: fingerprint,
    size: String(size),
  });
  if (groups) query.set("groups", groups.join(","));
  return `/${path}?${query}`;
}
export function DeckGroupSelection({ study }: { study: DeckStudyState }) {
  const { preferences, progress } = useLearning(),
    [page, setPage] = useState(1);
  const { snapshot, groups, setGroups } = study,
    count = Math.ceil((snapshot?.ids.length ?? 0) / preferences.lessonSize),
    pages = Math.max(1, Math.ceil(count / 12)),
    safePage = Math.min(page, pages);
  return (
    <div className="deck-group-selection">
      {study.error && (
        <p role="alert" className="form-error">
          {study.error}
          <Button variant="ghost" onClick={study.refresh}>
            Tải lại
          </Button>
        </p>
      )}
      {study.loading && <p role="status">Đang gộp bộ từ…</p>}
      {snapshot && (
        <>
          <p>
            <strong>{number(snapshot.total)} mục từ duy nhất</strong> · Đã loại
            trùng mã giữa các bộ.
          </p>
          <div
            className="deck-study-modes"
            role="group"
            aria-label="Phạm vi học"
          >
            <Button
              variant={groups === undefined ? "default" : "outline"}
              aria-pressed={groups === undefined}
              onClick={() => setGroups(undefined)}
            >
              Cả tập từ gộp
            </Button>
            <Button
              variant={groups !== undefined ? "default" : "outline"}
              aria-pressed={groups !== undefined}
              onClick={() => setGroups([])}
            >
              Chọn nhóm
            </Button>
          </div>
          {groups !== undefined && (
            <>
              <p className="muted">
                Mỗi nhóm {preferences.lessonSize} từ · Nhóm được chia sau khi
                gộp.
              </p>
              <div className="deck-bulk-actions">
                <Button
                  variant="ghost"
                  onClick={() =>
                    setGroups(Array.from({ length: count }, (_, i) => i + 1))
                  }
                >
                  Chọn tất cả nhóm
                </Button>
                <Button variant="ghost" onClick={() => setGroups([])}>
                  Bỏ chọn nhóm
                </Button>
              </div>
              <div className="practice-groups">
                {Array.from(
                  {
                    length: Math.max(
                      0,
                      Math.min(12, count - (safePage - 1) * 12),
                    ),
                  },
                  (_, i) => {
                    const group = (safePage - 1) * 12 + i + 1,
                      ids = snapshot.ids.slice(
                        (group - 1) * preferences.lessonSize,
                        group * preferences.lessonSize,
                      );
                    return (
                      <label
                        className={`card practice-group-card ${groups.includes(group) ? "selected" : ""}`}
                        key={group}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Chọn nhóm ${group}`}
                          checked={groups.includes(group)}
                          onChange={(e) =>
                            setGroups(
                              e.target.checked
                                ? [...groups, group].sort((a, b) => a - b)
                                : groups.filter((n) => n !== group),
                            )
                          }
                        />
                        <span>
                          <strong>Nhóm từ {group}</strong>
                          <small>
                            {ids.length} từ ·{" "}
                            {
                              ids.filter((id) =>
                                snapshot.studiedIds
                                  ? snapshot.studiedIds.includes(id)
                                  : progress[id] &&
                                    progress[id].state !== "NEW",
                              ).length
                            }{" "}
                            đã học
                          </small>
                        </span>
                      </label>
                    );
                  },
                )}
              </div>
              {pages > 1 && (
                <div className="lesson-pagination">
                  <Button
                    variant="outline"
                    disabled={safePage === 1}
                    onClick={() => setPage(safePage - 1)}
                  >
                    Trước
                  </Button>
                  <span>
                    {safePage} / {pages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={safePage === pages}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Sau
                  </Button>
                </div>
              )}
            </>
          )}
          <p role="status">
            Đang chọn {number(study.ids.length)} mục từ
            {groups !== undefined ? ` · ${groups.length} nhóm` : ""}.
          </p>
        </>
      )}
    </div>
  );
}
export function DeckStudyDialog({
  refs,
  onClose,
}: {
  refs: string[];
  onClose: () => void;
}) {
  const study = useDeckStudy(refs),
    { preferences } = useLearning(),
    router = useRouter();
  const disabled = !study.snapshot || !!study.error || !study.ids.length;
  const go = (path: "practice" | "flashcards") => {
    if (study.snapshot)
      router.push(
        deckStudyUrl(
          path,
          study.refs,
          study.snapshot.fingerprint,
          study.groups,
          preferences.lessonSize,
        ),
      );
  };
  return (
    <DeckModal wide title="Học từ các bộ đã chọn" onClose={onClose}>
      <p className="muted">
        {refs.length} bộ · Tiến độ học dùng chung ở mọi nơi.
      </p>
      <DeckGroupSelection study={study} />
      <footer>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => go("flashcards")}
        >
          <BookOpen size={17} />
          Flashcards
        </Button>
        <Button disabled={disabled} onClick={() => go("practice")}>
          <Play size={17} />
          Luyện tập
        </Button>
      </footer>
    </DeckModal>
  );
}
