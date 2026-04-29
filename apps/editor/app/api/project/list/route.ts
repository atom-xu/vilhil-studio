/**
 * GET /api/project/list
 *
 * 获取当前用户的项目列表。
 * 匿名用户返回空列表（匿名项目通过 share_link token 访问）。
 */

import * as Sentry from '@sentry/nextjs'
import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects } from '@/lib/schema'

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ projects: [] })
    }

    const list = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        thumbnail: projects.thumbnail,
        isPublic: projects.isPublic,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.ownerId, session.user.id))
      .orderBy(desc(projects.updatedAt))

    return NextResponse.json({ projects: list })
  } catch (err) {
    Sentry.captureException(err)
    console.error('[API /project/list]', err)
    return NextResponse.json({ error: '获取列表失败' }, { status: 500 })
  }
}
