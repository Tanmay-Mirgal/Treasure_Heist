import { randomBytes } from "node:crypto";
import { inject } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { resetEnvCache } from "@/lib/env";
import { disconnectDb } from "@/lib/db";
import { resetReadyCache, ready } from "@/lib/services/bootstrap";
import { seedAdmin, seedTeams } from "@/lib/services/seed";
import { parseWorkbook } from "@/lib/import/workbook";
import { importWorkbook } from "@/lib/import/apply";
import { DEFAULT_RULES } from "@/lib/game/types";
import { EventSettings, QRCheckpoint, RateLimit, Team, TeamSequence } from "@/lib/models";
import { clearTeamGameData } from "@/lib/services/admin-teams";
import { getSettings } from "@/lib/services/settings";
import { buildFixtureWorkbook, type FixtureTeam } from "./fixture-workbook";

export const ADMIN_PASSWORD = "Admin-Test-Pass-123";

/** Point the app at a fresh database on the shared in-memory replica set. */
export async function useTestDb(name: string) {
  const base = inject("mongoUri");
  const db = `heist_${name}_${randomBytes(3).toString("hex")}`;
  const url = new URL(base);
  url.pathname = `/${db}`;
  process.env.MONGODB_URI = url.toString();
  delete process.env.MONGO_URI;
  process.env.MONGODB_DB = db;
  process.env.SESSION_SECRET = "test-session-secret-0123456789-abcdefghijklmnop";
  process.env.ADMIN_USERNAME = "Tanmay";
  process.env.ADMIN_INITIAL_PASSWORD = ADMIN_PASSWORD;
  resetEnvCache();
  resetReadyCache();
  await disconnectDb();
  await ready();
}

export async function dropTestDb() {
  if (mongoose.connection.readyState === 1) await mongoose.connection.db?.dropDatabase();
  await disconnectDb();
}

/** Seed admin + 3 fixture teams and import the fixture workbook. */
export async function seedFixture(teams?: FixtureTeam[]) {
  await seedAdmin("Tanmay", ADMIN_PASSWORD);
  await seedTeams(teams?.length ?? 3);
  const wb = await parseWorkbook(await buildFixtureWorkbook(teams), "fixture.xlsx");
  return importWorkbook(wb, { dryRun: false, rules: DEFAULT_RULES });
}

export async function setEvent(patch: Record<string, unknown>) {
  await getSettings(); // make sure the singleton exists with defaults
  await EventSettings.updateOne({ key: "event" }, { $set: patch });
}

/** Back to a clean RUNNING event: no progress, no ledger, QR active, no rate-limit counters. */
export async function resetGame() {
  await clearTeamGameData("ALL", 0);
  await Team.updateMany({}, { $set: { status: "ACTIVE" } });
  await QRCheckpoint.updateMany({}, { $set: { status: "ACTIVE" } });
  await RateLimit.deleteMany({});
  await setEvent({
    status: "RUNNING",
    startedAt: new Date(),
    pausedAt: null,
    endedAt: null,
    totalPausedMs: 0,
    testMode: false,
    participationEnabled: true,
    scoringEnabled: true,
    leaderboardFrozen: false,
    "timer.enabled": false,
  });
}

export const startEvent = () => setEvent({ status: "RUNNING", startedAt: new Date(), testMode: false, totalPausedMs: 0 });

export async function teamId(n: number) {
  const t = await Team.findOne({ teamNumber: n }).lean();
  return String(t!._id);
}

/** Manual code of a team's checkpoint at a route position. */
export async function codeAt(team: number, position: number): Promise<string> {
  const seq = await TeamSequence.findOne({ teamNumber: team }).lean();
  const entry = seq!.entries.find((e) => e.position === position)!;
  const qr = await QRCheckpoint.findById(entry.qr).select("+manualCode").lean<{ manualCode: string }>();
  return qr!.manualCode;
}

export async function tokenAt(team: number, position: number): Promise<string> {
  const seq = await TeamSequence.findOne({ teamNumber: team }).lean();
  const entry = seq!.entries.find((e) => e.position === position)!;
  const qr = await QRCheckpoint.findById(entry.qr).select("+token").lean<{ token: string }>();
  return qr!.token;
}

/* ------------------------------------------------------------------ */
/* Calling route handlers directly                                     */
/* ------------------------------------------------------------------ */

type AnyHandler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export type CallResult = { status: number; body: { ok: boolean; data?: any; error?: { code: string; message: string } }; res: Response; raw: string };

export async function call(
  handler: unknown,
  opts: { method?: string; path?: string; body?: unknown; cookie?: string; params?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.cookie) headers.cookie = opts.cookie;
  const req = new NextRequest(new URL(opts.path ?? "/api/test", "http://localhost:3000"), {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await (handler as AnyHandler)(req, { params: Promise.resolve(opts.params ?? {}) });
  const raw = await res.clone().text();
  let body: CallResult["body"];
  try {
    body = JSON.parse(raw);
  } catch {
    body = { ok: res.ok };
  }
  return { status: res.status, body, res, raw };
}

/** Extract "name=value" pairs from Set-Cookie headers for reuse as a Cookie header. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
}
