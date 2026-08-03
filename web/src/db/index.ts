import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

/**
 * Next dev reloads modules on every edit; without the global, each reload would leak a
 * pool until Postgres refuses new connections.
 */
const globalForDb = globalThis as unknown as { pptgoPool?: Pool }

// `new Pool` opens nothing — the first connection is made on the first query — so this
// is safe to run during `next build`, which imports every route module to collect it.
const pool =
  globalForDb.pptgoPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })

if (process.env.NODE_ENV !== "production") globalForDb.pptgoPool = pool

export const db = drizzle({ client: pool, schema })

export { schema }
