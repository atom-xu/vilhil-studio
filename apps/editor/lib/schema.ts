/**
 * VilHil Studio — 业务层数据库 Schema (Drizzle ORM)
 *
 * 不包含 Better Auth 自带表（user/session/account/verification），
 * 那些由 Better Auth CLI 自动生成和管理。
 */

import { sql } from 'drizzle-orm'
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// ─── projects 表 ───────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  /** 项目所有者（nullable = 匿名项目） */
  ownerId: text('owner_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  /** 场景图快照：{ nodes: Record<string, AnyNode>, rootNodeIds: string[] } */
  data: jsonb('data').notNull().default(sql`'{}'`),
  thumbnail: text('thumbnail'),
  isPublic: boolean('is_public').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── share_links 表 ────────────────────────────────────────────────────────

export const shareLinks = pgTable('share_links', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  /** 创建者 user id */
  createdBy: text('created_by'),
  /** 短链 token，如 "a1b2c3d4" */
  token: text('token').notNull().unique(),
  /** view = 只读展示, operate = 可操作设备 */
  permission: text('permission').notNull().default('view'),
  expiresAt: timestamp('expires_at'),
  /** 可选访问密码（bcrypt hash） */
  password: text('password'),
  viewCount: integer('view_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── project_members 表（协作成员，Phase 2 扩展）────────────────────────────

export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  role: text('role').notNull().default('viewer'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── user 表（Better Auth 管理，此处仅用于 Drizzle 查询）────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  role: text('role').default('user'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

// ─── 类型导出 ──────────────────────────────────────────────────────────────

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type ShareLink = typeof shareLinks.$inferSelect
export type NewShareLink = typeof shareLinks.$inferInsert
export type ProjectMember = typeof projectMembers.$inferSelect
export type NewProjectMember = typeof projectMembers.$inferInsert
