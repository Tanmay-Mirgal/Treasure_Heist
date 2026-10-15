import type { ClientSession } from "mongoose";
import { EventSettings, type EventSettingsDoc } from "../models";
import { computeTimer } from "../game/rules";
import { DEFAULT_RULES, type GameRules } from "../game/types";
import { ready } from "./bootstrap";

export type Settings = EventSettingsDoc;

let cachedSettings: { data: Settings; expiresAt: number } | null = null;

export function invalidateSettingsCache() {
  cachedSettings = null;
}

export async function getSettings(session?: ClientSession): Promise<Settings> {
  // If session is provided (e.g. transaction), bypass cache to ensure read consistency
  if (!session && cachedSettings && Date.now() < cachedSettings.expiresAt) {
    return cachedSettings.data;
  }

  await ready();
  let existing = await EventSettings.findOne({ key: "event" }).session(session ?? null).lean<Settings>();
  if (!existing) {
    try {
      await EventSettings.create([{ key: "event" }]);
    } catch {
      /* created concurrently */
    }
    existing = (await EventSettings.findOne({ key: "event" }).session(session ?? null).lean<Settings>())!;
  }

  // AUTO-TERMINATE EVENT WHEN TIMER EXPIRES:
  // If the event is currently RUNNING or PAUSED with an enabled timer and duration has expired,
  // automatically update the database record to ENDED so all clients, scans, and screens recognize
  // that the event has terminated.
  if ((existing.status === "RUNNING" || existing.status === "PAUSED") && existing.timer?.enabled && existing.startedAt) {
    const t = timerOf(existing);
    if (t.expired) {
      const now = new Date();
      const durationMs = (existing.timer.durationMinutes ?? 90) * 60_000;
      const calculatedEnd = new Date(new Date(existing.startedAt).getTime() + (existing.totalPausedMs ?? 0) + durationMs);
      const endedAt = calculatedEnd.getTime() <= now.getTime() ? calculatedEnd : now;

      await EventSettings.updateOne(
        { key: "event", status: { $in: ["RUNNING", "PAUSED"] } },
        {
          $set: {
            status: "ENDED",
            endedAt,
          },
        },
      ).session(session ?? null);

      existing = (await EventSettings.findOne({ key: "event" }).session(session ?? null).lean<Settings>())!;
      invalidateSettingsCache();

      // Notify real-time listeners across WebSockets / SSE
      try {
        const { notifyRealtime } = await import("../server/notify");
        void notifyRealtime({ leaderboard: true });
      } catch {
        // Safe ignore
      }
    }
  }

  // Cache for 1500ms on serverless container (buffers 100 simultaneous requests)
  if (!session) {
    cachedSettings = { data: existing, expiresAt: Date.now() + 1500 };
  }

  return existing;
}

export function rulesOf(s: Settings): GameRules {
  const r = s.rules ?? ({} as Settings["rules"]);
  return {
    points: { ...DEFAULT_RULES.points, ...(r?.points ?? {}) },
    superShoes: { ...DEFAULT_RULES.superShoes, ...(r?.superShoes ?? {}) },
    magnet: { ...DEFAULT_RULES.magnet, ...(r?.magnet ?? {}) },
    hints: { ...DEFAULT_RULES.hints, ...(r?.hints ?? {}) },
  } as GameRules;
}

export function timerOf(s: Settings, now = new Date()) {
  return computeTimer(
    {
      status: s.status,
      startedAt: s.startedAt,
      pausedAt: s.pausedAt,
      endedAt: s.endedAt,
      totalPausedMs: s.totalPausedMs,
      timer: { enabled: Boolean(s.timer?.enabled), durationMinutes: s.timer?.durationMinutes ?? 90 },
    },
    now,
  );
}

export type Gate = { open: true; isTest: boolean } | { open: false; code: string; message: string };

/** Whether teams may progress / score right now. */
export function gameGate(s: Settings, now = new Date()): Gate {
  if (!s.participationEnabled)
    return { open: false, code: "PARTICIPATION_DISABLED", message: "Team participation is currently disabled by the organizer." };
  switch (s.status) {
    case "SETUP":
      return s.testMode
        ? { open: true, isTest: true }
        : { open: false, code: "NOT_STARTED", message: "The heist has not started yet. Wait for the organizer's signal." };
    case "PAUSED":
      return { open: false, code: "PAUSED", message: "The heist is paused. Hold your position until the organizer resumes it." };
    case "ENDED":
      return { open: false, code: "ENDED", message: "The heist has ended. No further scans are accepted." };
    case "RUNNING": {
      const t = timerOf(s, now);
      if (t.expired) return { open: false, code: "TIME_UP", message: "Time is up! The heist is over." };
      return { open: true, isTest: false };
    }
  }
  return { open: false, code: "UNKNOWN", message: "The event is not accepting scans right now." };
}

/** Public, participant-safe view of event state. */
export function publicEventView(s: Settings, now = new Date()) {
  const t = timerOf(s, now);
  return {
    name: s.eventName,
    status: s.status,
    testMode: s.testMode,
    participationEnabled: s.participationEnabled,
    scoringEnabled: s.scoringEnabled,
    magnetEnabled: rulesOf(s).magnet.enabled,
    leaderboardFrozen: s.leaderboardFrozen,
    serverNow: now.toISOString(),
    startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : null,
    timer: {
      enabled: t.enabled,
      durationMs: t.durationMs,
      remainingMs: t.remainingMs,
      elapsedMs: t.elapsedMs,
      running: t.running,
      expired: t.expired,
    },
  };
}
