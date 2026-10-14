import type { TestProject } from "vitest/node";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet: MongoMemoryReplSet | undefined;

async function start(attempt = 1): Promise<MongoMemoryReplSet> {
  try {
    return await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
      // A cold Windows start (antivirus scan, first run) can exceed the 10 s default.
      instanceOpts: [{ launchTimeout: 90_000 }],
    });
  } catch (err) {
    if (attempt >= 3) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return start(attempt + 1);
  }
}

/** One in-memory single-node replica set (transactions supported) for the whole test run. */
export async function setup(project: TestProject) {
  replSet = await start();
  await replSet.waitUntilRunning();
  project.provide("mongoUri", replSet.getUri());
}

export async function teardown() {
  await replSet?.stop();
}

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
