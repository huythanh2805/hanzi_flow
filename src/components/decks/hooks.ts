"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLearning } from "../provider";
import { deckChangeEvent, listDecks, resolveDecks } from "@/lib/deck-client";
import type { Deck, DeckSnapshot } from "@/lib/domain/decks";

function useDeckRefresh(refresh: () => void) {
  useEffect(() => {
    const focused = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener(deckChangeEvent, refresh);
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    const channel =
      "BroadcastChannel" in window
        ? new BroadcastChannel(deckChangeEvent)
        : undefined;
    if (channel) channel.onmessage = refresh;
    const timer = setInterval(focused, 15000);
    return () => {
      window.removeEventListener(deckChangeEvent, refresh);
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", focused);
      clearInterval(timer);
      channel?.close();
    };
  }, [refresh]);
}
export function useDeckList() {
  const { bootstrap, progress, ready } = useLearning();
  const [decks, setDecks] = useState<Deck[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const revision = useRef(0);
  const refresh = useCallback(() => {
    const request = ++revision.current;
    if (!ready) return;
    void listDecks(bootstrap.mode, progress)
      .then((rows) => {
        if (request === revision.current) {
          setDecks(rows);
          setLoaded(true);
          setError("");
        }
      })
      .catch((e) => {
        if (request === revision.current) {
          setError(e instanceof Error ? e.message : "Không tải được bộ từ.");
          setLoaded(true);
        }
      });
  }, [bootstrap.mode, progress, ready]);
  useDeckRefresh(refresh);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  return { decks, loaded, error, refresh };
}
export function useDeckStudy(
  refs: string[],
  seed?: { groups?: number[]; fingerprint?: string; size?: number },
) {
  const { bootstrap, progress, preferences, ready } = useLearning();
  const refsKey = [...new Set(refs)].sort().join(",");
  const [data, setData] = useState<{
      refs: string;
      snapshot: DeckSnapshot;
    } | null>(null),
    [failure, setFailure] = useState<{ refs: string; message: string } | null>(
      null,
    );
  const [groupState, setGroupState] = useState(() => ({
    refs: refsKey,
    fingerprint: seed?.fingerprint ?? "",
    size: seed?.size ?? preferences.lessonSize,
    groups: seed?.groups as number[] | undefined,
  }));
  const sequence = useRef(0);
  const refresh = useCallback(() => {
    const request = ++sequence.current;
    if (!ready || !refsKey) return;
    void resolveDecks(bootstrap.mode, progress, refsKey.split(","))
      .then((snapshot) => {
        if (request === sequence.current) {
          setData({ refs: refsKey, snapshot });
          setFailure(null);
        }
      })
      .catch((e) => {
        if (request === sequence.current)
          setFailure({
            refs: refsKey,
            message: e instanceof Error ? e.message : "Không tải được tập từ.",
          });
      });
  }, [bootstrap.mode, progress, refsKey, ready]);
  useDeckRefresh(refresh);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const snapshot = data?.refs === refsKey ? data.snapshot : null;
  const groups = useMemo(
    () =>
      groupState.groups === undefined
        ? undefined
        : groupState.refs === refsKey &&
            groupState.fingerprint === snapshot?.fingerprint &&
            groupState.size === preferences.lessonSize
          ? groupState.groups
          : [],
    [groupState, refsKey, snapshot?.fingerprint, preferences.lessonSize],
  );
  useEffect(() => {
    if (
      groupState.groups === undefined ||
      (groupState.refs === refsKey &&
        groupState.size === preferences.lessonSize &&
        (!snapshot || groupState.fingerprint === snapshot.fingerprint))
    )
      return;
    const timer = setTimeout(
      () =>
        setGroupState({
          refs: refsKey,
          fingerprint: snapshot?.fingerprint ?? "",
          size: preferences.lessonSize,
          groups: [],
        }),
      0,
    );
    return () => clearTimeout(timer);
  }, [groupState, refsKey, preferences.lessonSize, snapshot]);
  const setGroups = useCallback(
    (groups: number[] | undefined) =>
      setGroupState({
        refs: refsKey,
        fingerprint: snapshot?.fingerprint ?? "",
        size: preferences.lessonSize,
        groups,
      }),
    [refsKey, snapshot?.fingerprint, preferences.lessonSize],
  );
  const ids = useMemo(
    () =>
      snapshot
        ? groups === undefined
          ? snapshot.ids
          : snapshot.ids.filter((_, i) =>
              groups.includes(Math.floor(i / preferences.lessonSize) + 1),
            )
        : [],
    [snapshot, groups, preferences.lessonSize],
  );
  const error = failure?.refs === refsKey ? failure.message : "";
  return {
    snapshot,
    error,
    loading: !!refsKey && !snapshot && !error,
    groups,
    setGroups,
    ids,
    refresh,
    refs: refsKey ? refsKey.split(",") : [],
  };
}
export type DeckStudyState = ReturnType<typeof useDeckStudy>;
