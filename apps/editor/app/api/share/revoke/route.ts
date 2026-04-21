/**
 * POST /api/share/revoke
 *
 * 撤销分享链接（删除 share_link 记录）。
 * 仅允许创建者、项目所有者或管理员删除。
 */

import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, shareLinks } from '@/lib/schema'

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const body = await request.json()
    const { id } = body as { id: string }

    if (!id) {
      return NextResponse.json({ error: '缺少分享链接 ID' }, { status: 400 })
    }

    const link = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.id, id),
    })

    if (!link) {
      return NextResponse.json({ error: '分享链接不存在' }, { status: 404 })
    }

    // 检查权限：创建者或项目所有者可以删除
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, link.projectId),
    })

    const isCreator = link.createdBy === session.user.id
    const isOwner = project?.ownerId === session.user.id
    const isAdmin = (session.user as any).role === 'admin'

    if (!isCreator && !isOwner && !isAdmin) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    await db.delete(shareLinks).where(eq(shareLinks.id, id))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API /share/revoke]', err)
    return NextResponse.json({ error: '撤销分享失败' }, { status: 500 })
  }
}
