import path from "node:path";
import { loadEnvConfig } from "@next/env";

/** Load .env / .env.local exactly like Next.js does, then return parsed CLI flags. */
export function initCli(): Record<string, string | boolean> {
  loadEnvConfig(path.resolve(__dirname, ".."), process.env.NODE_ENV !== "production");
  const flags: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=", 2);
    if (v !== undefined) flags[k!] = v;
    else if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) flags[k!] = argv[++i]!;
    else flags[k!] = true;
  }
  return flags;
}

export async function runMain(fn: () => Promise<void>) {
  try {
    await fn();
    const { disconnectDb } = await import("../lib/db");
    await disconnectDb();
    process.exit(0);
  } catch (err) {
    console.error("\n✖", err instanceof Error ? err.message : err);
    try {
      const { disconnectDb } = await import("../lib/db");
      await disconnectDb();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}
