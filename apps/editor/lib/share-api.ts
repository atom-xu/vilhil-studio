/**
 * 分享体系工具函数
 */

import type { ProjectSnapshot } from './project-api'

export interface ShareResult {
  shareUrl: string
  token: string
  expiresAt: string | null
  hasPassword: boolean
}

export interface ShareContent {
  project: {
    id: string
    name: string
    data: ProjectSnapshot
  }
  permission: 'view' | 'operate'
}

/** 创建分享链接 */
export async function createShareLink(
  name: string,
  snapshot: ProjectSnapshot,
  options?: {
    projectId?: string
    permission?: 'view' | 'operate'
    expiresInDays?: number | null
    password?: string
  },
): Promise<ShareResult> {
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      data: snapshot,
      ...options,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '创建分享链接失败')
  }

  return res.json()
}

/** 通过 token 获取分享内容 */
export async function fetchShareContent(token: string, password?: string): Promise<ShareContent> {
  const res = await fetch(`/api/share/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || '获取分享内容失败')
  }

  return res.json()
}
