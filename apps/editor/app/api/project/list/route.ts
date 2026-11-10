/**
 * GET /api/project/list
 *
 * 获取当前用户的项目列表。
 * 匿名用户返回空列表（匿名项目通过 share_link token 访问）。
 */

import * as Sentry from '@sentry/nextjs'
import { desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getPresentationFromSiteMetadata } from '@/lib/project-presentations'
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
        // Project cards only need the first root Site's metadata, not geometry.
        presentationMetadata: sql<unknown>`(
          select root_node.value -> 'metadata'
          from jsonb_array_elements(
            case when jsonb_typeof(${projects.data} -> 'rootNodeIds') = 'array'
              then ${projects.data} -> 'rootNodeIds' else '[]'::jsonb end
          ) with ordinality as root_id(value, ord)
          cross join lateral (
            select (${projects.data} -> 'nodes') -> (root_id.value #>> '{}') as value
          ) as root_node
          where jsonb_typeof(root_id.value) = 'string'
            and jsonb_typeof(${projects.data} -> 'nodes') = 'object'
            and jsonb_typeof(root_node.value) = 'object'
            and root_node.value ->> 'type' = 'site'
            and jsonb_typeof(root_node.value -> 'id') = 'string'
            and root_node.value ->> 'id' = (root_id.value #>> '{}')
            and (root_node.value -> 'parentId' is null
              or root_node.value -> 'parentId' = 'null'::jsonb)
          order by root_id.ord
          limit 1
        )`,
      })
      .from(projects)
      .where(eq(projects.ownerId, session.user.id))
      .orderBy(desc(projects.updatedAt))

    return NextResponse.json({
      projects: list.map(({ presentationMetadata, ...project }) => ({
        ...project,
        presentation: getPresentationFromSiteMetadata(presentationMetadata),
      })),
    })
  } catch (err) {
    Sentry.captureException(err)
    console.error('[API /project/list]', err)
    return NextResponse.json({ error: '获取列表失败' }, { status: 500 })
  }
}
