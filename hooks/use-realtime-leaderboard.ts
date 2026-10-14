"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { LeaderboardRow } from "@/lib/services/leaderboard";
import { api } from "@/lib/client/api";

export type BoardData = {
  frozen: boolean;
  frozenAt: string | null;
  rows: LeaderboardRow[];
  eventStatus: string;
  testMode: boolean;
};

/**
 * Real-time Leaderboard hook powered by WebSockets with HTTP polling fallback.
 */
export function useRealtimeLeaderboard(pollIntervalMs = 12_000) {
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastLiveAt, setLastLiveAt] = useState<Date | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initial HTTP fetch
  const fetchHttp = useCallback(async () => {
    try {
      const d = await api<BoardData>("/api/leaderboard");
      setData(d);
      setLastLiveAt(new Date());
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time WebSocket connection
  useEffect(() => {
    let unmounted = false;

    function connectWs() {
      if (unmounted) return;
      try {
        const host = typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost";
        // Connect to WebSocket server on port 3001
        const wsUrl = `ws://${host}:3001`;
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setWsConnected(true);
          // Subscribe to live leaderboard broadcasts
          ws.send(JSON.stringify({ type: "SUBSCRIBE_LEADERBOARD" }));
        };

        ws.onmessage = (event) => {
          if (unmounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "LEADERBOARD_DATA" && msg.payload) {
              setData(msg.payload);
              setLastLiveAt(new Date(msg.timestamp || Date.now()));
              setLoading(false);
            }
          } catch {
            // Malformed message
          }
        };

        ws.onerror = () => {
          if (unmounted) return;
          setWsConnected(false);
        };

        ws.onclose = () => {
          if (unmounted) return;
          setWsConnected(false);
          socketRef.current = null;
          // Reconnect after 3 seconds
          retryTimerRef.current = setTimeout(connectWs, 3000);
        };
      } catch {
        setWsConnected(false);
        retryTimerRef.current = setTimeout(connectWs, 3000);
      }
    }

    void fetchHttp();
    connectWs();

    // Background HTTP safety poll (every 12s) in case socket drops
    const pollTimer = setInterval(() => {
      void fetchHttp();
    }, pollIntervalMs);

    return () => {
      unmounted = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      clearInterval(pollTimer);
      try {
        socketRef.current?.close();
      } catch {
        // Closed
      }
    };
  }, [fetchHttp, pollIntervalMs]);

  return {
    data,
    loading,
    error,
    wsConnected,
    lastLiveAt,
    refresh: fetchHttp,
  };
}
