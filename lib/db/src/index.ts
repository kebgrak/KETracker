import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

/**
 * Initialize the database connection. Must be called before accessing `db` or `pool`.
 * In non-Electron environments, this is called automatically from process.env.DATABASE_URL.
 * In Electron, the main process calls this with the user-provided Neon URL.
 */
export async function initDb(databaseUrl?: string): Promise<void> {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }

  if (_pool) {
    await _pool.end();
  }

  _pool = new Pool({
    connectionString: url,
    ssl: url.includes("neon.tech") || url.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : false,
  });
  _db = drizzle(_pool, { schema });
}

export function getPool(): pg.Pool {
  if (!_pool) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return _pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return _db;
}

// Auto-initialize from env var if available (backward compat for dev mode)
if (process.env.DATABASE_URL) {
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("neon.tech") || process.env.DATABASE_URL.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : false,
  });
  _db = drizzle(_pool, { schema });
}

// Expose as module-level bindings so existing `import { db, pool }` still works.
// These are getters that delegate to the initialized instances.
let _dbTarget: NodePgDatabase<typeof schema> | null = null;
let _poolTarget: pg.Pool | null = null;

const dbHandler: ProxyHandler<NodePgDatabase<typeof schema>> = {
  get(_, prop) {
    const target = getDb();
    const value = (target as any)[prop];
    if (typeof value === "function") {
      return value.bind(target);
    }
    return value;
  },
};

const poolHandler: ProxyHandler<pg.Pool> = {
  get(_, prop) {
    const target = getPool();
    const value = (target as any)[prop];
    if (typeof value === "function") {
      return value.bind(target);
    }
    return value;
  },
};

export const db = new Proxy({} as NodePgDatabase<typeof schema>, dbHandler);
export const pool = new Proxy({} as pg.Pool, poolHandler);

export * from "./schema";
