import type { Progress, ProgressMap, ProgressPatch } from "./types";
export function applyProgress(
  current: Progress | undefined,
  id: string,
  patch: ProgressPatch,
  now = new Date(),
): Progress {
  return {
    vocabulary_id: id,
    state: "NEW",
    favorite: false,
    difficult: false,
    suspended: false,
    studied_at: null,
    ...current,
    ...patch,
    ...(patch.state === "LEARNING" && current?.state === "MASTERED"
      ? { state: "MASTERED" as const }
      : {}),
    ...(patch.state && !current?.studied_at
      ? { studied_at: now.toISOString() }
      : {}),
    updated_at: now.toISOString(),
  };
}
export function localDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function studiedToday(
  progress: ProgressMap,
  timeZone: string,
  now = new Date(),
) {
  const today = localDate(now, timeZone);
  return Object.values(progress).filter(
    (p) =>
      p.studied_at && localDate(new Date(p.studied_at), timeZone) === today,
  ).length;
}
