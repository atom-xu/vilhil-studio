/**
 * GET /api/share/list
 *
 * 获取当前用户创建的分享链接列表。
 */

import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, shareLinks } from '@/lib/schema'

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const list = await db
      .select({
        id: shareLinks.id,
        token: shareLinks.token,
        projectId: shareLinks.projectId,
        projectName: projects.name,
        permission: shareLinks.permission,
        expiresAt: shareLinks.expiresAt,
        viewCount: shareLinks.viewCount,
        hasPassword: shareLinks.password,
        createdAt: shareLinks.createdAt,
      })
      .from(shareLinks)
      .innerJoin(projects, eq(shareLinks.projectId, projects.id))
      .where(eq(shareLinks.createdBy, session.user.id))
      .orderBy(desc(shareLinks.createdAt))

    return NextResponse.json({
      shares: list.map((s) => ({
        ...s,
        hasPassword: !!s.hasPassword,
        isExpired: s.expiresAt ? new Date(s.expiresAt) < new Date() : false,
      })),
    })
  } catch (err) {
    console.error('[API /share/list]', err)
    return NextResponse.json({ error: '获取分享列表失败' }, { status: 500 })
  }
}
