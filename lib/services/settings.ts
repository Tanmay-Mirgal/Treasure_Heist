import type { ClientSession } from "mongoose";
import { EventSettings, type EventSettingsDoc } from "../models";
import { computeTimer } from "../game/rules";
import { DEFAULT_RULES, type GameRules } from "../game/types";
import { ready } from "./bootstrap";

export type Settings = EventSettingsDoc;

export async function getSettings(session?: ClientSession): Promise<Settings> {
  await ready();
  const existing = await EventSettings.findOne({ key: "event" }).session(session ?? null).lean<Settings>();
  if (existing) return existing;
  try {
    await EventSettings.create([{ key: "event" }]);
  } catch {
    /* created concurrently */
  }
  return (await EventSettings.findOne({ key: "event" }).session(session ?? null).lean<Settings>())!;
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
