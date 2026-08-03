/**
 * Applies `drizzle/*.sql`, then exits. Runs as the container's entrypoint before
 * `next start`, and can be run by hand in development (`npm run db:migrate`).
 *
 * Plain .mjs against `pg` alone, on purpose. The production image is Next's standalone
 * output, which bundles drizzle-orm into the server chunks instead of shipping it in
 * `node_modules` — so `drizzle-orm/node-postgres/migrator` is not importable there.
 * The bookkeeping below is byte-for-byte what that migrator does, so `drizzle-kit
 * migrate` stays interchangeable with it: same `drizzle.__drizzle_migrations` table,
 * same sha256-of-file hash, same "apply everything newer than the last `created_at`".
 */
import crypto from "node:crypto"
import fs from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const folder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle")

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("缺少环境变量 DATABASE_URL")
  process.exit(1)
}

function readMigrations() {
  const journal = JSON.parse(fs.readFileSync(`${folder}/meta/_journal.json`, "utf8"))
  return journal.entries.map((entry) => {
    const query = fs.readFileSync(`${folder}/${entry.tag}.sql`, "utf8")
    return {
      tag: entry.tag,
      when: entry.when,
      statements: query.split("--> statement-breakpoint"),
      hash: crypto.createHash("sha256").update(query).digest("hex"),
    }
  })
}

async function applyAll(client) {
  await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"')
  await client.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)

  // one writer at a time: compose may start more than one web container at once
  await client.query("SELECT pg_advisory_lock(4021979)")
  try {
    const { rows } = await client.query(
      'SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1',
    )
    const last = rows[0] ? Number(rows[0].created_at) : null

    const pending = readMigrations().filter((m) => last === null || last < m.when)
    if (!pending.length) {
      console.log("数据库已是最新")
      return
    }

    await client.query("BEGIN")
    try {
      for (const migration of pending) {
        for (const statement of migration.statements) {
          if (statement.trim()) await client.query(statement)
        }
        await client.query(
          'INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)',
          [migration.hash, migration.when],
        )
        console.log(`已应用迁移 ${migration.tag}`)
      }
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(4021979)")
  }
}

// compose starts the web container as soon as Postgres reports healthy, which on a cold
// volume is a moment before it accepts connections — so retry rather than crash
const attempts = Number(process.env.MIGRATE_RETRIES ?? 10)

async function connect() {
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString })
    try {
      await client.connect()
      return client
    } catch (error) {
      await client.end().catch(() => {})
      if (attempt >= attempts) throw error
      console.warn(`数据库尚未就绪（第 ${attempt}/${attempts} 次），2 秒后重试`)
      await new Promise((done) => setTimeout(done, 2000))
    }
  }
}

// a failing statement is a bug in a migration, not a cold start — it fails immediately
// instead of being retried
const client = await connect().catch((error) => {
  console.error("无法连接数据库：", error)
  process.exit(1)
})

try {
  await applyAll(client)
} catch (error) {
  console.error("数据库迁移失败：", error)
  await client.end().catch(() => {})
  process.exit(1)
}

await client.end()
