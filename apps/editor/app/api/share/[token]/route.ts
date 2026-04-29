/**
 * POST /api/share/[token]
 *
 * 通过短 token 获取分享内容。
 * - 检查 token 是否存在、是否过期
 * - 校验访问密码（如有设置）
 * - 返回项目快照和权限信息
 */

import * as Sentry from '@sentry/nextjs'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projects, shareLinks } from '@/lib/schema'
import { verifyPassword } from '@/lib/password-hash'
import { getClientIp, rateLimit, rateLimitedResponse } from '@/lib/rate-limit'

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    // 防暴力破解：同一 IP 对同一 token，1 分钟内最多 10 次尝试
    const { token } = await params
    const ip = getClientIp(request)
    const rl = rateLimit(`share-token:${ip}:${token}`, 10, 60_000)
    if (!rl.success) return rateLimitedResponse(rl.retryAfterMs)

    const body = (await request.json().catch(() => ({}))) as { password?: string }
    const providedPassword = body.password || ''

    const link = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.token, token),
    })

    if (!link) {
      return NextResponse.json({ error: '链接不存在' }, { status: 404 })
    }

    // 检查过期
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return NextResponse.json({ error: '链接已过期' }, { status: 410 })
    }

    // 校验访问密码
    if (link.password) {
      if (!providedPassword) {
        return NextResponse.json(
          { error: '需要访问密码', code: 'PASSWORD_REQUIRED' },
          { status: 401 },
        )
      }
      if (!(await verifyPassword(providedPassword, link.password))) {
        return NextResponse.json(
          { error: '访问密码错误', code: 'PASSWORD_INVALID' },
          { status: 403 },
        )
      }
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, link.projectId),
    })

    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    }

    // 增加浏览计数
    await db
      .update(shareLinks)
      .set({ viewCount: link.viewCount + 1 })
      .where(eq(shareLinks.id, link.id))

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        data: project.data,
      },
      permission: link.permission,
    })
  } catch (err) {
    Sentry.captureException(err)
    console.error('[API /share/[token]]', err)
    return NextResponse.json({ error: '获取分享内容失败' }, { status: 500 })
  }
}
