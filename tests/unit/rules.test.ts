import { describe, expect, it } from "vitest";
import { answersMatch, checkpointReward, computeTimer, magnetTransferAmount, rankTeams } from "@/lib/game/rules";
import { DEFAULT_RULES } from "@/lib/game/types";
import { MANUAL_CODE_LENGTH, newManualCode, newScanToken, parseScanInput } from "@/lib/services/qr";

describe("scoring rules", () => {
  it("normal checkpoint grants +1", () => expect(checkpointReward("NORMAL", DEFAULT_RULES)).toBe(1));
  it("BONUS grants +2 total (not 1 + 2)", () => expect(checkpointReward("BONUS", DEFAULT_RULES)).toBe(2));
  it("SUPER SHOES grants +2", () => expect(checkpointReward("SUPER_SHOES", DEFAULT_RULES)).toBe(2));
  it("MAGNET arrival is 0 by default (the transfer is the reward)", () => expect(checkpointReward("MAGNET", DEFAULT_RULES)).toBe(0));
  it("finish counts as a checkpoint", () => expect(checkpointReward("FINISH", DEFAULT_RULES)).toBe(1));
  it("respects a per-checkpoint override and never goes negative", () => {
    expect(checkpointReward("NORMAL", DEFAULT_RULES, 5)).toBe(5);
    expect(checkpointReward("NORMAL", DEFAULT_RULES, -3)).toBe(0);
  });
});

describe("MAGNET transfer amount", () => {
  it("transfers 2 when the target has enough", () => expect(magnetTransferAmount(7, 2)).toBe(2));
  it("transfers only 1 when the target has 1", () => expect(magnetTransferAmount(1, 2)).toBe(1));
  it("transfers nothing when the target has 0", () => expect(magnetTransferAmount(0, 2)).toBe(0));
  it("never creates points from a negative balance", () => expect(magnetTransferAmount(-4, 2)).toBe(0));
});

describe("server timer", () => {
  const base = { timer: { enabled: true, durationMinutes: 60 } };
  const start = new Date("2026-10-14T10:00:00Z");
  it("subtracts paused time", () => {
    const t = computeTimer({ ...base, status: "RUNNING", startedAt: start, totalPausedMs: 10 * 60_000 }, new Date("2026-10-14T10:30:00Z"));
    expect(t.elapsedMs).toBe(20 * 60_000);
    expect(t.remainingMs).toBe(40 * 60_000);
  });
  it("freezes while paused", () => {
    const t = computeTimer({ ...base, status: "PAUSED", startedAt: start, pausedAt: new Date("2026-10-14T10:05:00Z") }, new Date("2026-10-14T11:30:00Z"));
    expect(t.elapsedMs).toBe(5 * 60_000);
    expect(t.expired).toBe(false);
  });
  it("expires after the duration", () => {
    const t = computeTimer({ ...base, status: "RUNNING", startedAt: start }, new Date("2026-10-14T11:00:01Z"));
    expect(t.expired).toBe(true);
    expect(t.remainingMs).toBe(0);
  });
});

describe("ranking", () => {
  it("sorts by points then earliest to reach the score, deterministically", () => {
    const r = rankTeams(
      [
        { id: "a", teamNumber: 1, score: 5, completed: 4, scoreChangedAt: new Date(3000) },
        { id: "b", teamNumber: 2, score: 5, completed: 5, scoreChangedAt: new Date(1000) },
        { id: "c", teamNumber: 3, score: 9, completed: 2, scoreChangedAt: new Date(5000) },
        { id: "d", teamNumber: 4, score: 0, completed: 0, scoreChangedAt: null },
      ],
      "POINTS_THEN_EARLIEST",
    );
    expect(r.map((x) => x.id)).toEqual(["c", "b", "a", "d"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe("answers", () => {
  it("normalizes case, punctuation and alternatives", () => {
    expect(answersMatch("  aquaguard   Purifier!! ", "AquaGuard purifier")).toBe(true);
    expect(answersMatch("water purifier", "AquaGuard purifier|water purifier")).toBe(true);
    expect(answersMatch("", "x")).toBe(false);
    expect(answersMatch("noticeboard", "corridor")).toBe(false);
  });
});

describe("QR tokens", () => {
  it("are long, random and URL safe", () => {
    const tokens = new Set(Array.from({ length: 500 }, newScanToken));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
  it("manual codes avoid ambiguous characters", () => {
    for (let i = 0; i < 200; i++) expect(newManualCode()).toMatch(new RegExp(`^[A-HJ-NP-Z2-9]{${MANUAL_CODE_LENGTH}}$`));
  });
  it("parses scan URLs, bare tokens and typed codes", () => {
    const tok = newScanToken();
    expect(parseScanInput(`https://heist.example.com/s/${tok}`)).toEqual({ kind: "token", value: tok });
    expect(parseScanInput(tok)).toEqual({ kind: "token", value: tok });
    expect(parseScanInput(" k7qx-m4pz ")).toEqual({ kind: "code", value: "K7QXM4PZ" });
    expect(parseScanInput("QR19")).toBeNull();
    expect(parseScanInput("https://evil.example.com/other")).toBeNull();
  });
});
