import { connectDb } from "../db";
import * as M from "../models";

const ALL_MODELS = [
  M.Team,
  M.Admin,
  M.QRCheckpoint,
  M.TeamSequence,
  M.CheckpointCompletion,
  M.ScoreTransaction,
  M.PowerUpActivation,
  M.HintUsage,
  M.Notification,
  M.ScanEvent,
  M.AdminAuditLog,
  M.IssueReport,
  M.RateLimit,
  M.ImportRun,
  M.EventSettings,
];

const g = globalThis as unknown as { __heistInit?: Promise<unknown> | null };

/**
 * Connect and make sure every collection and index exists before any
 * transaction runs (MongoDB cannot build indexes inside a transaction).
 */
export async function ready(): Promise<void> {
  await connectDb();
  g.__heistInit ??= Promise.all(ALL_MODELS.map((m) => m.init())).catch((err) => {
    g.__heistInit = null;
    throw err;
  });
  await g.__heistInit;
}

export function resetReadyCache() {
  g.__heistInit = null;
}
