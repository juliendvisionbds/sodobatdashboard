import { createRequire } from "module";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const require = createRequire(import.meta.url);

// En production (docker-compose) : DATABASE_URL → node-postgres.
// En développement sans Postgres : PGlite embarqué dans .data/pglite.
// Les deux drivers exposent la même API drizzle ; on type sur node-postgres.
type Db = NodePgDatabase<typeof schema>;

function buildPg(url: string): Db {
  const { drizzle } = require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
  const { Pool } = require("pg") as typeof import("pg");
  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema });
}

function buildPglite(): Db {
  const { drizzle } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  const client = new PGlite("./.data/pglite");
  return drizzle(client, { schema }) as unknown as Db;
}

const globalForDb = globalThis as unknown as { __db?: Db };

export const db: Db =
  globalForDb.__db ??
  (process.env.DATABASE_URL ? buildPg(process.env.DATABASE_URL) : buildPglite());

globalForDb.__db = db;

export * as tables from "./schema";
