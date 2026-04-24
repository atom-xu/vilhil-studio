/**
 * POST /api/project/save
 *
 * 保存项目快照到云端。必须登录后才能保存。
 */

import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects } from '@/lib/schema'

const MAX_BODY_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      return NextResponse.json({ error: '请求体过大' }, { status: 413 })
    }

    const body = await request.json()
    const { name, data, projectId } = body as {
      name: string
      data: { nodes: Record<string, unknown>; rootNodeIds: string[] }
      projectId?: string
    }

    if (!name || !data) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 })
    }

    // 生成唯一 slug
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${nanoid(6)}`

    // 如果提供了 projectId 且用户已登录，尝试更新现有项目
    if (projectId && session?.user?.id) {
      const existing = await db.query.projects.findFirst({
        where: (p, { eq, and }) => and(eq(p.id, projectId), eq(p.ownerId, session.user.id)),
      })

      if (existing) {
        const [updated] = await db
          .update(projects)
          .set({
            name,
            data,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId))
          .returning()

        return NextResponse.json({ project: updated })
      }
    }

    // 创建新项目
    const [project] = await db
      .insert(projects)
      .values({
        ownerId: session.user.id,
        name,
        slug,
        data,
      })
      .returning()

    return NextResponse.json({ project })
  } catch (err) {
    console.error('[API /project/save]', err)
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
