"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiClientError } from "@/lib/client/api";

/**
 * Load data now and refresh it every `intervalMs` while the tab is visible.
 * Also refreshes when the tab regains focus or the device comes back online.
 */
export function usePoll<T>(load: (signal: AbortSignal) => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });
  const ctrlRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const d = await loadRef.current(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setData(d);
      setError(null);
      setLastOkAt(Date.now());
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e as Error);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      ctrlRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, refresh, ...deps]);

  return { data, error, loading, refresh, lastOkAt, setData };
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/**
 * Milliseconds remaining on a server-authoritative countdown. `receivedAt` is
 * the client time the server value arrived; the display ticks locally and is
 * re-anchored on every poll, so refreshes never reset the timer.
 */
export function useServerCountdown(remainingMs: number | null, receivedAt: number | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  if (remainingMs === null || receivedAt === null || !running) return remainingMs;
  return Math.max(0, remainingMs - Math.max(0, now - receivedAt));
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "--:--";
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
