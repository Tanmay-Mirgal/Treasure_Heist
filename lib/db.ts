import mongoose, { type ClientSession } from "mongoose";
import { getEnv } from "./env";

type Cache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  supportsTransactions: boolean | null;
};

const globalForMongoose = globalThis as unknown as { __heistMongoose?: Cache };
const cache: Cache = (globalForMongoose.__heistMongoose ??= {
  conn: null,
  promise: null,
  supportsTransactions: null,
});

mongoose.set("strictQuery", true);

/** Connect once per process and reuse the connection (safe across hot reloads). */
export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  if (!cache.promise) {
    const env = getEnv();
    cache.promise = mongoose
      .connect(env.MONGODB_URI, {
        dbName: env.MONGODB_DB,
        serverSelectionTimeoutMS: 15_000,
        maxPoolSize: 10,
        autoIndex: true,
      })
      .catch((err) => {
        cache.promise = null;
        throw new Error(
          `Could not connect to MongoDB. Check MONGODB_URI and network access (Atlas IP allow-list). Cause: ${err.message}`,
        );
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}

export async function disconnectDb() {
  if (cache.conn) await mongoose.disconnect();
  cache.conn = null;
  cache.promise = null;
  cache.supportsTransactions = null;
}

/**
 * Multi-document transactions require a replica set or sharded cluster
 * (MongoDB Atlas always qualifies). A standalone local mongod does not.
 */
export async function supportsTransactions(): Promise<boolean> {
  if (cache.supportsTransactions !== null) return cache.supportsTransactions;
  const conn = await connectDb();
  const db = conn.connection.db;
  if (!db) return false;
  const hello = await db.admin().command({ hello: 1 });
  cache.supportsTransactions = Boolean(hello.setName) || hello.msg === "isdbgrid";
  return cache.supportsTransactions;
}

export class TransactionsUnavailableError extends Error {
  constructor() {
    super(
      "This operation needs MongoDB transactions. Use MongoDB Atlas or run local mongod as a single-node replica set (see README → Local MongoDB).",
    );
    this.name = "TransactionsUnavailableError";
  }
}

/**
 * Run `fn` inside a MongoDB transaction. Transient errors (write conflicts) are
 * retried by the driver. If the deployment cannot run transactions we refuse
 * instead of applying a multi-document change partially.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  await connectDb();
  if (!(await supportsTransactions())) throw new TransactionsUnavailableError();
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
    return result as T;
  } finally {
    await session.endSession();
  }
}

export function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000);
}
