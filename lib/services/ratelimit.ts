import { RateLimit } from "../models";
import { ready } from "./bootstrap";

export type RateResult = { allowed: boolean; count: number; retryAfterMs: number };

/**
 * Fixed-window counter stored in MongoDB so limits hold across serverless
 * instances. Atomic: one pipeline update per hit.
 */
export async function hitRateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  await ready();
  const now = new Date();
  const windowFloor = new Date(now.getTime() - windowMs);
  const expired = { $or: [{ $not: ["$windowStart"] }, { $lte: ["$windowStart", windowFloor] }] };
  const doc = await RateLimit.findOneAndUpdate(
    { key },
    [
      {
        $set: {
          count: { $cond: [expired, 1, { $add: ["$count", 1] }] },
          windowStart: { $cond: [expired, now, "$windowStart"] },
        },
      },
      { $set: { expiresAt: { $add: ["$windowStart", windowMs] } } },
    ],
    { upsert: true, returnDocument: "after", updatePipeline: true },
  ).lean();
  const count = doc?.count ?? 1;
  const windowStart = doc?.windowStart ? new Date(doc.windowStart).getTime() : now.getTime();
  return { allowed: count <= limit, count, retryAfterMs: Math.max(0, windowStart + windowMs - now.getTime()) };
}

/** Read the current count without incrementing. */
export async function peekRateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  await ready();
  const now = Date.now();
  const doc = await RateLimit.findOne({ key }).lean();
  if (!doc || !doc.windowStart || new Date(doc.windowStart).getTime() <= now - windowMs)
    return { allowed: true, count: 0, retryAfterMs: 0 };
  return {
    allowed: doc.count < limit,
    count: doc.count,
    retryAfterMs: Math.max(0, new Date(doc.windowStart).getTime() + windowMs - now),
  };
}

export async function clearRateLimit(key: string) {
  await ready();
  await RateLimit.deleteOne({ key });
}

export const LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000 },
  invalidScan: { limit: 12, windowMs: 5 * 60_000 },
  answer: { limit: 10, windowMs: 5 * 60_000 },
  issue: { limit: 5, windowMs: 10 * 60_000 },
};
