"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, X, AlertCircle } from "lucide-react";
import { savePreferences, updateVocabulary } from "@/app/actions";
import { applyProgress } from "@/lib/domain/progress";
import { preferencesSchema } from "@/lib/domain/validation";
import type {
  Bootstrap,
  Preferences,
  ProgressMap,
  ProgressPatch,
} from "@/lib/domain/types";
const storageKey = "hanziflow.trial.v1";
type Store = {
  bootstrap: Bootstrap;
  progress: ProgressMap;
  preferences: Preferences;
  ready: boolean;
  pending: Record<string, boolean>;
  mutate: (id: string, patch: ProgressPatch) => Promise<boolean>;
  updatePreferences: (preferences: Preferences) => Promise<boolean>;
  notify: (message: string, error?: boolean) => void;
};
const Context = createContext<Store | null>(null);
export function LearningProvider({
  bootstrap,
  children,
}: {
  bootstrap: Bootstrap;
  children: React.ReactNode;
}) {
  const [progress, setProgress] = useState(bootstrap.progress);
  const [preferences, setPreferences] = useState(bootstrap.preferences);
  const [ready, setReady] = useState(bootstrap.mode === "cloud");
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const current = useRef({
    progress: bootstrap.progress,
    preferences: bootstrap.preferences,
  });
  const locks = useRef(new Set<string>());
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  useEffect(() => {
    if (bootstrap.mode === "cloud") return;
    function load() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const value = JSON.parse(raw);
          const prefs = preferencesSchema.safeParse(value.preferences);
          const next: ProgressMap = {};
          for (const [id, p] of Object.entries(value.progress ?? {})) {
            if (
              /^hsk30-b(?:[1-6]|79)-\d{4}$/.test(id) &&
              p &&
              typeof p === "object" &&
              "state" in p &&
              ["NEW", "LEARNING"].includes(String(p.state))
            ) {
              next[id] = {
                vocabulary_id: id,
                state: p.state as "NEW" | "LEARNING",
                favorite: "favorite" in p && p.favorite === true,
                difficult: "difficult" in p && p.difficult === true,
                suspended: "suspended" in p && p.suspended === true,
                studied_at:
                  "studied_at" in p &&
                  typeof p.studied_at === "string" &&
                  Number.isFinite(Date.parse(p.studied_at))
                    ? p.studied_at
                    : null,
                updated_at: new Date().toISOString(),
              };
            }
          }
          current.current = {
            progress: next,
            preferences: prefs.success ? prefs.data : bootstrap.preferences,
          };
          setProgress(next);
          setPreferences(current.current.preferences);
        }
      } catch {
        notify(
          "Không đọc được dữ liệu bản thử. Hãy kiểm tra quyền lưu trữ của trình duyệt.",
          true,
        );
      }
      setReady(true);
    }
    // Load browser-only storage after hydration; never use it for an authenticated account.
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, [bootstrap.mode, bootstrap.preferences, notify]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        preferences.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : preferences.theme;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preferences.theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const mutate = useCallback(
    async (id: string, patch: ProgressPatch) => {
      if (!ready || locks.current.has(id)) return false;
      locks.current.add(id);
      setPending((p) => ({ ...p, [id]: true }));
      try {
        const next =
          bootstrap.mode === "cloud"
            ? await updateVocabulary(id, patch)
            : applyProgress(current.current.progress[id], id, patch);
        const updated = { ...current.current.progress, [id]: next };
        if (bootstrap.mode === "trial")
          localStorage.setItem(
            storageKey,
            JSON.stringify({ ...current.current, progress: updated }),
          );
        current.current.progress = updated;
        setProgress(updated);
        return true;
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Không thể lưu thay đổi.",
          true,
        );
        return false;
      } finally {
        locks.current.delete(id);
        setPending((p) => ({ ...p, [id]: false }));
      }
    },
    [bootstrap.mode, ready, notify],
  );
  const updatePrefs = useCallback(
    async (input: Preferences) => {
      try {
        const parsed = preferencesSchema.parse(input);
        const next =
          bootstrap.mode === "cloud" ? await savePreferences(parsed) : parsed;
        if (bootstrap.mode === "trial")
          localStorage.setItem(
            storageKey,
            JSON.stringify({ ...current.current, preferences: next }),
          );
        current.current.preferences = next;
        setPreferences(next);
        notify("Đã lưu cài đặt của bạn.");
        return true;
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Không lưu được cài đặt.",
          true,
        );
        return false;
      }
    },
    [bootstrap.mode, notify],
  );
  return (
    <Context.Provider
      value={{
        bootstrap,
        progress,
        preferences,
        ready,
        pending,
        mutate,
        updatePreferences: updatePrefs,
        notify,
      }}
    >
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button aria-label="Đóng thông báo" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useLearning() {
  const value = useContext(Context);
  if (!value) throw new Error("LearningProvider missing");
  return value;
}
