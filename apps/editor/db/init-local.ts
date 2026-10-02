/** Local development only. Never run the historical SQL set against a production database. */
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { getMigrations } from 'better-auth/db/migration'

async function main() {
  const url = new URL(process.env.POSTGRES_URL ?? '')
  if (
    process.env.NODE_ENV === 'production' ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '55432' ||
    url.pathname !== '/vilhil_dev' ||
    url.username !== 'vilhil_dev' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Only the dedicated local vilhil_dev database on 127.0.0.1:55432 is allowed')
  }

  // Validate the target before importing modules that create a database pool.
  const { pool } = await import('../lib/db')
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SELECT pg_advisory_xact_lock(hashtext('vilhil-local-init'))")
      await client.query(`CREATE TABLE IF NOT EXISTS _vilhil_local_migrations (
        name text PRIMARY KEY,
        sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`)
      const dir = fileURLToPath(new URL('../drizzle/', import.meta.url))
      const names = (await readdir(dir)).filter((name) => /^\d+_[\w-]+\.sql$/.test(name)).sort()
      for (const name of names) {
        const sql = await readFile(`${dir}/${name}`, 'utf8')
        const hash = createHash('sha256').update(sql).digest('hex')
        const prior = await client.query<{ sha256: string }>(
          'SELECT sha256 FROM _vilhil_local_migrations WHERE name = $1',
          [name],
        )
        if (prior.rows[0]) {
          if (prior.rows[0].sha256 !== hash) throw new Error(`Applied SQL changed: ${name}`)
          console.log(`[local-db] skip ${name}`)
          continue
        }
        await client.query(sql)
        await client.query('INSERT INTO _vilhil_local_migrations (name, sha256) VALUES ($1, $2)', [
          name,
          hash,
        ])
        console.log(`[local-db] applied ${name}`)
      }
      await client.query('COMMIT')

      // Historical SQL predates the current admin plugin. Use its actual schema.
      const { auth } = await import('../lib/auth')
      await client.query('BEGIN')
      await client.query("SELECT pg_advisory_xact_lock(hashtext('vilhil-local-init'))")
      const migrations = await getMigrations(auth.options)
      if (migrations.toBeCreated.length || migrations.toBeAdded.length) {
        await client.query(await migrations.compileMigrations())
        console.log('[local-db] synchronized missing Better Auth tables/fields')
      } else {
        console.log('[local-db] Better Auth schema already current')
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(
    '[local-db] Initialization failed:',
    error instanceof Error ? error.message : 'unknown error',
  )
  process.exitCode = 1
})
