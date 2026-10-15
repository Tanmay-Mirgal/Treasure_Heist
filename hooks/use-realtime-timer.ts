"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { formatDuration } from "./use-poll";

export type RealtimeTimerState = {
  enabled: boolean;
  durationMs: number | null;
  remainingMs: number | null;
  elapsedMs: number;
  running: boolean;
  expired: boolean;
  isTimeUp: boolean;
  isLowTime: boolean;
  formatted: string;
  wsConnected: boolean;
  eventStatus: string;
};

type TimerPayload = {
  enabled: boolean;
  durationMs: number | null;
  remainingMs: number | null;
  elapsedMs: number;
  running: boolean;
  expired: boolean;
  serverNow?: string;
  eventStatus: string;
};

/**
 * Global Real-time Timer hook synchronized via WebSockets with local countdown anchoring.
 * Broadcasts TIME_UP across all screens simultaneously.
 */
export function useRealtimeTimer(initialTimer?: { enabled: boolean; durationMs: number | null; remainingMs: number | null; running: boolean; expired: boolean; status?: string }): RealtimeTimerState {
  const [timerPayload, setTimerPayload] = useState<TimerPayload>({
    enabled: initialTimer?.enabled ?? false,
    durationMs: initialTimer?.durationMs ?? null,
    remainingMs: initialTimer?.remainingMs ?? null,
    elapsedMs: 0,
    running: initialTimer?.running ?? false,
    expired: initialTimer?.expired ?? false,
    eventStatus: initialTimer?.status ?? "RUNNING",
  });
  const [receivedAt, setReceivedAt] = useState<number>(Date.now());
  const [localNow, setLocalNow] = useState<number>(Date.now());
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<NodeJS.Timeout | null>(null);

  // Update when initialTimer prop changes (e.g. from team state poll)
  useEffect(() => {
    if (initialTimer) {
      setTimerPayload((prev) => ({
        ...prev,
        enabled: initialTimer.enabled,
        durationMs: initialTimer.durationMs,
        remainingMs: initialTimer.remainingMs,
        running: initialTimer.running,
        expired: initialTimer.expired,
        eventStatus: initialTimer.status ?? prev.eventStatus,
      }));
      setReceivedAt(Date.now());
    }
  }, [initialTimer?.enabled, initialTimer?.remainingMs, initialTimer?.running, initialTimer?.expired, initialTimer?.status, initialTimer?.durationMs]);

  // Connect to WebSocket Server for live timer ticks
  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      try {
        const host = typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost";
        const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${proto}//${host}:3001`;
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setWsConnected(true);
          ws.send(JSON.stringify({ type: "SUBSCRIBE_TIMER" }));
        };

        ws.onmessage = (event) => {
          if (unmounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "TIMER_SYNC" && msg.payload) {
              setTimerPayload(msg.payload);
              setReceivedAt(Date.now());
            } else if (msg.type === "TIME_UP") {
              setTimerPayload((prev) => ({
                ...prev,
                expired: true,
                remainingMs: 0,
                running: false,
                eventStatus: "ENDED",
              }));
              setReceivedAt(Date.now());
            } else if (msg.type === "LEADERBOARD_DATA" && msg.payload?.timer) {
              const t = msg.payload.timer;
              setTimerPayload((prev) => ({
                ...prev,
                enabled: t.enabled,
                durationMs: t.durationMs,
                remainingMs: t.remainingMs,
                elapsedMs: t.elapsedMs,
                running: t.running,
                expired: t.expired || msg.payload.eventStatus === "ENDED",
                eventStatus: msg.payload.eventStatus ?? prev.eventStatus,
              }));
              setReceivedAt(Date.now());
            }
          } catch {}
        };

        ws.onerror = () => {
          if (unmounted) return;
          setWsConnected(false);
        };

        ws.onclose = () => {
          if (unmounted) return;
          setWsConnected(false);
          socketRef.current = null;
          retryRef.current = setTimeout(connect, 3000);
        };
      } catch {
        setWsConnected(false);
        retryRef.current = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      try {
        socketRef.current?.close();
      } catch {}
    };
  }, []);

  // High-frequency 1-second local clock ticker
  useEffect(() => {
    const id = setInterval(() => setLocalNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Compute live synchronized remaining time
  const isRunning = Boolean(timerPayload.running && timerPayload.enabled);
  let liveRemaining = timerPayload.remainingMs;
  if (isRunning && timerPayload.remainingMs !== null) {
    const elapsedSinceReceive = Math.max(0, localNow - receivedAt);
    liveRemaining = Math.max(0, timerPayload.remainingMs - elapsedSinceReceive);
  }

  const expired = timerPayload.expired || (timerPayload.enabled && liveRemaining !== null && liveRemaining <= 0);
  const isTimeUp = expired || timerPayload.eventStatus === "ENDED";
  const isLowTime = !isTimeUp && isRunning && liveRemaining !== null && liveRemaining > 0 && liveRemaining < 5 * 60_000;

  return {
    enabled: timerPayload.enabled,
    durationMs: timerPayload.durationMs,
    remainingMs: isTimeUp ? 0 : liveRemaining,
    elapsedMs: timerPayload.elapsedMs,
    running: isRunning && !isTimeUp,
    expired,
    isTimeUp,
    isLowTime,
    formatted: isTimeUp ? "00:00" : formatDuration(liveRemaining),
    wsConnected,
    eventStatus: timerPayload.eventStatus,
  };
}
