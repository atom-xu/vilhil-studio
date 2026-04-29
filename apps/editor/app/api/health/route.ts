/**
 * GET /api/health
 *
 * 健康检查端点，供 UptimeRobot / 负载均衡器探活。
 * - DB 正常 → 200 { status: 'ok' }
 * - DB 异常 → 503 { status: 'degraded' }
 */
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`)
    return Response.json({
      status: 'ok',
      db: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[health] DB ping failed:', err)
    return Response.json(
      { status: 'degraded', db: 'fail', error: String(err) },
      { status: 503 },
    )
  }
}
