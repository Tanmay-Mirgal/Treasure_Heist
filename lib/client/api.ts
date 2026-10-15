"use client";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type Opts = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal; redirectOn401?: false | "team" | "admin" };

/** fetch() wrapper for our { ok, data | error } envelope. */
export async function api<T>(url: string, opts: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiClientError(0, "NETWORK", "Connection lost. Check your signal and try again.");
  }
  let json: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.ok && json?.ok) return json.data as T;
  const err = new ApiClientError(
    res.status,
    json?.error?.code ?? "HTTP_" + res.status,
    json?.error?.message ?? "Something went wrong. Please try again.",
    json?.error?.details,
  );
  if (opts.redirectOn401 && typeof window !== "undefined") {
    if (res.status === 403 && opts.redirectOn401 === "admin") {
      // Forbidden: A logged-in team called an organizer API endpoint
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/play";
    } else if (res.status === 401) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      // Full navigation on purpose: drop all client state when the session is gone.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `${opts.redirectOn401 === "admin" ? "/admin/login" : "/login"}?next=${next}`;
    }
  }
  throw err;
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Only allow same-site relative redirects after login and enforce strict role boundaries. */
export function safeNext(next: string | null, fallback: string, role?: "team" | "admin"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (role === "team" && (next === "/admin" || next.startsWith("/admin/"))) return fallback;
  if (role === "admin" && (next === "/play" || next.startsWith("/play/"))) return fallback;
  return next;
}
