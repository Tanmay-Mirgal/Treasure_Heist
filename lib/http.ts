import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { TransactionsUnavailableError } from "./db";

/**
 * Consistent JSON envelope for every Route Handler:
 *   success → { ok: true, data }
 *   failure → { ok: false, error: { code, message, details? } }
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const unauthorized = (msg = "Please log in to continue.") => new ApiError(401, "UNAUTHORIZED", msg);
export const forbidden = (msg = "You do not have access to this resource.") => new ApiError(403, "FORBIDDEN", msg);
export const notFound = (msg = "Not found.") => new ApiError(404, "NOT_FOUND", msg);
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", msg, details);
export const conflict = (msg: string, details?: unknown) => new ApiError(409, "CONFLICT", msg, details);

export function ok<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json(
    { ok: true, data },
    { status: init?.status ?? 200, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } },
  );
}

export function fail(err: ApiError) {
  return NextResponse.json(
    { ok: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
    { status: err.status, headers: { "Cache-Control": "no-store" } },
  );
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** HTTP status for game-rule refusals raised by services (GameError codes). */
const GAME_ERROR_STATUS: Record<string, number> = {
  INVALID: 400,
  SELF_TARGET: 400,
  INVALID_TARGET: 400,
  NOT_FOUND: 404,
  MAGNET_DISABLED: 403,
  EVENT_CLOSED: 423,
  SCORING_DISABLED: 423,
  ALREADY_USED: 409,
  TARGET_EMPTY: 409,
  RETRY: 409,
  SESSION_MISMATCH: 409,
  NO_ROUTE: 409,
  FINISHED: 409,
  AWAITING_ANSWER: 409,
  NO_HINT: 409,
  NO_HINTS_LEFT: 409,
};

/** Wrap a route handler: CSRF origin check on mutations + uniform error handling. */
export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return fail(err);
      if (err instanceof Error && err.name === "GameError") {
        const code = (err as Error & { code?: string }).code ?? "GAME_ERROR";
        return fail(new ApiError(GAME_ERROR_STATUS[code] ?? 409, code, err.message));
      }
      if (err instanceof TransactionsUnavailableError) return fail(new ApiError(503, "TRANSACTIONS_UNAVAILABLE", err.message));
      console.error("[api] unhandled error", req.method, req.nextUrl?.pathname, err);
      return fail(new ApiError(500, "INTERNAL", "Something went wrong. Please try again."));
    }
  };
}

/**
 * Defense in depth against CSRF (cookies are already SameSite=Lax): reject
 * mutating requests whose Origin header names a different host.
 */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // Non-browser clients (tests, curl) send no Origin; cookies still required.
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Cross-site request blocked.");
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  if (originHost !== host) throw forbidden("Cross-site request blocked.");
}

export async function readJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 64_000) throw badRequest("Request body too large.");
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw badRequest("Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(
      "Invalid request.",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
export const reasonField = z.string().trim().min(3, "Please give a reason (min 3 characters).").max(500);

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/** Public base URL encoded into printed QR codes. Set NEXT_PUBLIC_APP_URL for the deployed site. */
export function appBaseUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || req.nextUrl.origin).replace(/\/+$/, "");
}
