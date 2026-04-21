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
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, shareLinks } from '@/lib/schema'
import { hashPassword } from '@/lib/password-hash'

const MAX_BODY_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      return NextResponse.json({ error: '请求体过大' }, { status: 413 })
    }

    const session = await auth.api.getSession({ headers: request.headers })

    const body = await request.json()
    const {
      name,
      data,
      projectId,
      permission = 'view',
      expiresInDays,
      password,
    } = body as {
      name: string
      data: { nodes: Record<string, unknown>; rootNodeIds: string[] }
      projectId?: string
      permission?: 'view' | 'operate'
      expiresInDays?: number | null
      password?: string
    }

    if (!name || !data) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 })
    }

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
