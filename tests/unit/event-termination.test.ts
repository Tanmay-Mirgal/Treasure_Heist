import { describe, expect, it } from "vitest";
import { computeTimer } from "@/lib/game/rules";
import { gameGate } from "@/lib/services/settings";
import type { EventSettingsDoc } from "@/lib/models/EventSettings";
import { Types } from "mongoose";

describe("Event timer expiration & termination rules", () => {
  const baseStartedAt = new Date("2026-10-15T20:00:00Z");

  it("calculates remaining time correctly when event is RUNNING with 90 minute timer", () => {
    // 30 minutes in: 60 minutes remaining
    const now = new Date("2026-10-15T20:30:00Z");
    const t = computeTimer(
      {
        status: "RUNNING",
        startedAt: baseStartedAt,
        timer: { enabled: true, durationMinutes: 90 },
      },
      now,
    );
    expect(t.enabled).toBe(true);
    expect(t.running).toBe(true);
    expect(t.elapsedMs).toBe(30 * 60_000);
    expect(t.remainingMs).toBe(60 * 60_000);
    expect(t.expired).toBe(false);
  });

  it("detects expiration when elapsed time reaches or exceeds duration", () => {
    // 90 minutes in: 0 minutes remaining, expired = true
    const exactEnd = new Date("2026-10-15T21:30:00Z");
    const tExact = computeTimer(
      {
        status: "RUNNING",
        startedAt: baseStartedAt,
        timer: { enabled: true, durationMinutes: 90 },
      },
      exactEnd,
    );
    expect(tExact.expired).toBe(true);
    expect(tExact.remainingMs).toBe(0);

    // 95 minutes in: still expired
    const pastEnd = new Date("2026-10-15T21:35:00Z");
    const tPast = computeTimer(
      {
        status: "RUNNING",
        startedAt: baseStartedAt,
        timer: { enabled: true, durationMinutes: 90 },
      },
      pastEnd,
    );
    expect(tPast.expired).toBe(true);
    expect(tPast.remainingMs).toBe(0);
  });

  it("accounts for paused time so pause doesn't consume timer countdown", () => {
    // 90 minutes elapsed on the wall clock, but paused for 20 minutes
    const now = new Date("2026-10-15T21:30:00Z");
    const t = computeTimer(
      {
        status: "RUNNING",
        startedAt: baseStartedAt,
        totalPausedMs: 20 * 60_000,
        timer: { enabled: true, durationMinutes: 90 },
      },
      now,
    );
    // Effective elapsed: 70 min, remaining: 20 min -> NOT expired
    expect(t.elapsedMs).toBe(70 * 60_000);
    expect(t.remainingMs).toBe(20 * 60_000);
    expect(t.expired).toBe(false);
  });

  it("gameGate blocks scans with TIME_UP when timer expires during RUNNING", () => {
    const expiredNow = new Date("2026-10-15T21:31:00Z");
    const mockSettings = {
      _id: new Types.ObjectId(),
      key: "event",
      eventName: "SUBWAY HEIST",
      status: "RUNNING",
      testMode: false,
      startedAt: baseStartedAt,
      pausedAt: null,
      totalPausedMs: 0,
      endedAt: null,
      participationEnabled: true,
      scoringEnabled: true,
      timer: { enabled: true, durationMinutes: 90 },
      rules: {} as any,
      logInvalidScans: true,
      logDuplicateScans: true,
      rankingRule: "POINTS_THEN_EARLIEST",
      leaderboardFrozen: false,
      frozenAt: null,
      frozenSnapshot: null,
      createdAt: baseStartedAt,
      updatedAt: baseStartedAt,
    } as unknown as EventSettingsDoc;

    const gate = gameGate(mockSettings, expiredNow);
    expect(gate.open).toBe(false);
    if (!gate.open) {
      expect(gate.code).toBe("TIME_UP");
      expect(gate.message).toContain("Time is up");
    }
  });

  it("gameGate blocks scans with ENDED when event is in ENDED state", () => {
    const now = new Date();
    const mockSettings = {
      _id: new Types.ObjectId(),
      key: "event",
      eventName: "SUBWAY HEIST",
      status: "ENDED",
      testMode: false,
      startedAt: baseStartedAt,
      pausedAt: null,
      totalPausedMs: 0,
      endedAt: now,
      participationEnabled: true,
      scoringEnabled: true,
      timer: { enabled: true, durationMinutes: 90 },
      rules: {} as any,
      logInvalidScans: true,
      logDuplicateScans: true,
      rankingRule: "POINTS_THEN_EARLIEST",
      leaderboardFrozen: false,
      frozenAt: null,
      frozenSnapshot: null,
      createdAt: baseStartedAt,
      updatedAt: now,
    } as unknown as EventSettingsDoc;

    const gate = gameGate(mockSettings, now);
    expect(gate.open).toBe(false);
    if (!gate.open) {
      expect(gate.code).toBe("ENDED");
      expect(gate.message).toContain("The heist has ended");
    }
  });
});
