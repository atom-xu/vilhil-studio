/**
 * GET /api/project/[id]
 * DELETE /api/project/[id]
 *
 * 获取或删除指定项目。
 */

import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects } from '@/lib/schema'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await auth.api.getSession({ headers: request.headers })

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    })

    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    }

    // 公开项目或所有者可以访问
    const isOwner = session?.user?.id === project.ownerId
    if (!project.isPublic && !isOwner) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }

    return NextResponse.json({ project })
  } catch (err) {
    console.error('[API /project/[id] GET]', err)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    })

    if (!project) {
      return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    }

    if (project.ownerId !== session.user.id) {
      return NextResponse.json({ error: '无权删除' }, { status: 403 })
    }

    await db.delete(projects).where(eq(projects.id, id))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API /project/[id] DELETE]', err)
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
