/**
 * 数据库种子脚本
 *
 * 用途：
 *   1. 写入"客厅样板间"这个系统级 sample project（ownerId = null，slug = "sample-living-room"）
 *   2. 可多次安全运行（upsert，不会重复插入）
 *
 * 运行方式：
 *   bun apps/editor/db/seed.ts
 *   或 npx tsx apps/editor/db/seed.ts
 *
 * 生产部署时在 docker-compose CMD 或 Dockerfile 里加一行：
 *   bun apps/editor/db/seed.ts && node server.js
 */

import { eq } from 'drizzle-orm'
import { db } from '../lib/db'
import { projects } from '../lib/schema'
import { SAMPLE_SCENE_DATA, SAMPLE_PROJECT_SLUG } from './sample-scene'

async function seed() {
  console.log('[seed] 开始写入样板间数据…')

  // 检查是否已存在
  const existing = await db.query.projects.findFirst({
    where: eq(projects.slug, SAMPLE_PROJECT_SLUG),
  })

  if (existing) {
    // 更新数据（开发时方便迭代样板间内容）
    await db
      .update(projects)
      .set({ data: SAMPLE_SCENE_DATA as any, updatedAt: new Date() })
      .where(eq(projects.slug, SAMPLE_PROJECT_SLUG))
    console.log(`[seed] 已更新样板间（id=${existing.id}）`)
  } else {
    const inserted = await db
      .insert(projects)
      .values({
        ownerId: null, // 系统级项目，无 owner
        name: '客厅样板间',
        slug: SAMPLE_PROJECT_SLUG,
        data: SAMPLE_SCENE_DATA as any,
        isPublic: false, // 不出现在公开列表，只用于 fork
      })
      .returning()
    console.log(`[seed] 已插入样板间（id=${inserted[0]?.id}）`)
  }

  console.log('[seed] 完成')
  process.exit(0)
}

seed().catch((e) => {
  console.error('[seed] 失败:', e)
  process.exit(1)
})
