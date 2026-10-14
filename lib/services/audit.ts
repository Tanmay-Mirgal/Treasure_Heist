import type { ClientSession, Types } from "mongoose";
import { AdminAuditLog } from "../models";

export type AdminActor = { id: Types.ObjectId | string; username: string };

export async function audit(
  actor: AdminActor,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
  session?: ClientSession,
) {
  await AdminAuditLog.create(
    [
      {
        admin: actor.id,
        adminUsername: actor.username,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        reason: entry.reason ?? null,
      },
    ],
    session ? { session } : undefined,
  );
}

/** Keep only the listed keys (for compact before/after audit snapshots). */
export function pick<T extends object>(obj: T | null | undefined, keys: string[]): Record<string, unknown> | null {
  if (!obj) return null;
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (obj as Record<string, unknown>)[k];
  return out;
}
