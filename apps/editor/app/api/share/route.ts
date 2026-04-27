/**
 * POST /api/share
 *
 * 创建分享链接。
 * - 接收场景快照，保存为项目
 * - 生成 share_link 记录和短 token
 * - 返回分享 URL
 */

import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, shareLinks } from '@/lib/schema'
import { hashPassword } from '@/lib/password-hash'
import { getClientIp, rateLimit, rateLimitedResponse } from '@/lib/rate-limit'

const MAX_BODY_SIZE = 20 * 1024 * 1024 // 20MB

/** 创建分享链接请求 schema */
const CreateShareBody = z.object({
  name: z.string().min(1).max(200),
  data: z.object({
    nodes: z.record(z.string(), z.unknown()),
    rootNodeIds: z.array(z.string()),
  }),
  projectId: z.string().uuid().optional(),
  permission: z.enum(['view', 'operate']).default('view'),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  password: z.string().max(100).optional(),
})

export async function POST(request: Request) {
  try {
    // 防止匿名刷接口：同一 IP 5 分钟内最多创建 20 个分享链接
    const ip = getClientIp(request)
    const rl = rateLimit(`share-create:${ip}`, 20, 5 * 60_000)
    if (!rl.success) return rateLimitedResponse(rl.retryAfterMs)

    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      return NextResponse.json({ error: '请求体过大' }, { status: 413 })
    }

    const session = await auth.api.getSession({ headers: request.headers })

    const raw = await request.json()
    const parsed = CreateShareBody.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: '请求格式错误', details: parsed.error.flatten() }, { status: 400 })
    }
    const { name, data, projectId, permission, expiresInDays, password } = parsed.data

    let targetProjectId: string

    // 如果提供了 projectId 且用户已登录，复用现有项目
    if (projectId && session?.user?.id) {
      const existing = await db.query.projects.findFirst({
        where: (p, { eq }) => eq(p.id, projectId),
      })

      if (!existing) {
        return NextResponse.json({ error: '项目不存在' }, { status: 404 })
      }

      if (existing.ownerId !== session.user.id) {
        return NextResponse.json({ error: '无权操作此项目' }, { status: 403 })
      }

      // 更新项目数据
      await db
        .update(projects)
        .set({ data, updatedAt: new Date() })
        .where(eq(projects.id, projectId))

      targetProjectId = projectId
    } else {
      // 创建新的匿名项目
      let slug: string
      let inserted: typeof projects.$inferSelect[]
      let retries = 0

      while (true) {
        slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${nanoid(6)}`
        try {
          inserted = await db
            .insert(projects)
            .values({
              ownerId: session?.user?.id ?? null,
              name,
              slug,
              data,
            })
            .returning()
          break
        } catch (err: any) {
          // 处理 slug 唯一键冲突，重试一次
          if (retries < 1 && err?.message?.includes('unique constraint')) {
            retries++
            continue
          }
          throw err
        }
      }

      if (!inserted![0]) {
        return NextResponse.json({ error: '创建项目失败' }, { status: 500 })
      }

      targetProjectId = inserted![0].id
    }

    // 生成短 token（10位 nanoid），处理唯一键冲突
    let token: string = ''
    let shareLinkInserted: typeof shareLinks.$inferSelect[] | undefined
    let tokenRetries = 0

    while (!shareLinkInserted) {
      token = nanoid(10)
      try {
        const expiresAt =
          typeof expiresInDays === 'number' && expiresInDays > 0
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : null

        const values: typeof shareLinks.$inferInsert = {
          projectId: targetProjectId,
          createdBy: session?.user?.id ?? null,
          token,
          permission,
          expiresAt,
        }

        if (password && password.trim()) {
          values.password = await hashPassword(password.trim())
        }

        shareLinkInserted = await db.insert(shareLinks).values(values).returning()
      } catch (err: any) {
        if (tokenRetries < 2 && err?.message?.includes('unique constraint')) {
          tokenRetries++
          continue
        }
        throw err
      }
    }

    const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002'
    const shareUrl = `${baseURL}/share/${token}`

    const insertedLink = shareLinkInserted[0]
    if (!insertedLink) {
      return NextResponse.json({ error: '创建分享链接失败' }, { status: 500 })
    }

    return NextResponse.json({
      shareUrl,
      token,
      expiresAt: insertedLink.expiresAt,
      hasPassword: !!password && !!password.trim(),
    })
  } catch (err) {
    console.error('[API /share]', err)
    return NextResponse.json({ error: '创建分享链接失败' }, { status: 500 })
  }
}
