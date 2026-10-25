"use client";
import { useId, useSyncExternalStore } from "react";

const storageKey = "hanziflow.practice.quick-mode.v1";
const changeEvent = "hanziflow:practice-quick-mode";
let fallback: boolean | undefined;
function snapshot() {
  if (fallback !== undefined) return fallback;
  try {
    return localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) listener();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(changeEvent, listener);
  };
}
export function useQuickPractice() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
function setQuickPractice(value: boolean) {
  fallback = value;
  try {
    localStorage.setItem(storageKey, String(value));
    fallback = undefined;
  } catch {
    /* Keep the in-memory setting when storage is unavailable. */
  }
  window.dispatchEvent(new Event(changeEvent));
}
export function QuickModeToggle({
  disabled = false,
  compact = false,
}: {
  disabled?: boolean;
  compact?: boolean;
}) {
  const enabled = useQuickPractice(),
    helpId = useId();
  return (
    <div className={`practice-quick-mode${compact ? " compact" : ""}`}>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          aria-describedby={helpId}
          onChange={(e) => setQuickPractice(e.target.checked)}
        />
        <strong>Quick mode</strong>
      </label>
      <p id={helpId} className={compact ? "sr-only" : undefined}>
        Đúng thì chuyển câu ngay · Sai thì xem lại lời giải.
      </p>
    </div>
  );
}
