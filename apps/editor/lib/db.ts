/**
 * 数据库连接池
 *
 * 复用同一 pg Pool 供 Drizzle ORM 和 Better Auth 使用。
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 20,
})

export const db = drizzle(pool, { schema })
