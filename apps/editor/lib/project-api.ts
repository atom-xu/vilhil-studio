/**
 * 项目云端持久化工具函数
 *
 * 纯函数封装，可被 UI / AI / 测试脚本直接调用。
 */

import type { AnyNode } from '@pascal-app/core'

export interface ProjectSnapshot {
  nodes: Record<string, AnyNode>
  rootNodeIds: string[]
}

export interface SavedProject {
  id: string
  name: string
  slug: string
  thumbnail?: string
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

/** 保存项目到云端 */
export async function saveProjectToCloud(
  name: string,
  snapshot: ProjectSnapshot,
  projectId?: string,
): Promise<{ project: { id: string; slug: string } }> {
  const res = await fetch('/api/project/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data: snapshot, projectId }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '保存失败')
  }

  return res.json()
}

/** 获取项目列表 */
export async function fetchProjectList(): Promise<{ projects: SavedProject[] }> {
  const res = await fetch('/api/project/list')

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '获取列表失败')
  }

  return res.json()
}

/** 获取单个项目 */
export async function fetchProject(
  id: string,
): Promise<{ project: { id: string; name: string; data: ProjectSnapshot } }> {
  const res = await fetch(`/api/project/${id}`)

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '获取项目失败')
  }

  return res.json()
}

/** 删除项目 */
export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/project/${id}`, { method: 'DELETE' })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '删除失败')
  }
}
