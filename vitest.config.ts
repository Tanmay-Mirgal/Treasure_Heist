import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "tests/helpers/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/helpers/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    pool: "forks",
    // Each test file uses its own database on the shared in-memory replica set.
    fileParallelism: true,
    maxWorkers: 4,
  },
});
