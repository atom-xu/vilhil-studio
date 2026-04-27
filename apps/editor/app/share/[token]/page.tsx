'use client'

import { useScene } from '@pascal-app/core'
import { ProposalLayout } from '@pascal-app/editor'
import { Viewer } from '@pascal-app/viewer'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { fetchShareContent, type ShareContent } from '@/lib/share-api'

/**
 * 分享落地页
 *
 * 通过短 token 加载场景快照，根据权限进入只读或操作模式。
 */
export default function SharePage() {
  const params = useParams()
  const token = params.token as string

  const [content, setContent] = useState<ShareContent | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [passwordInput, setPasswordInput] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)

  async function loadContent(password?: string) {
    if (!token) return
    setLoading(true)
    setError('')

    try {
      const data = await fetchShareContent(token, password)
      setContent(data)
      setNeedsPassword(false)

      // 加载场景到 store
      const { nodes, rootNodeIds } = data.project.data as {
        nodes: Record<string, any>
        rootNodeIds: string[]
      }
      useScene.getState().setScene(nodes, rootNodeIds as any)
      // view = 完全只读, operate = 可操作设备但不能编辑场景
      useScene.getState().setInteractionMode(data.permission === 'view' ? 'view' : 'operate')
    } catch (err: any) {
      const msg = err.message || ''
      if (msg.includes('需要访问密码') || msg.includes('PASSWORD_REQUIRED')) {
        setNeedsPassword(true)
        setError('')
      } else {
        setError(msg)
        setNeedsPassword(false)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadContent()
  }, [token])

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <p className="text-sm text-muted-foreground">正在加载方案…</p>
        </div>
      </div>
    )
  }

  if (needsPassword) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm vh-panel p-8">
          <h1 className="mb-1 text-xl font-semibold text-foreground">访问受保护</h1>
          <p className="mb-6 text-sm text-muted-foreground">此方案需要输入访问密码</p>

          {error && (
            <div className="mb-4 rounded-[var(--ui-radius-control)] border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              loadContent(passwordInput)
            }}
          >
            <input
              autoFocus
              className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-[var(--ui-focus-ring)]"
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="请输入访问密码"
              type="password"
              value={passwordInput}
            />
            <button
              className="w-full vh-btn vh-btn-primary py-2.5"
              type="submit"
            >
              确认访问
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-lg font-medium text-foreground">{error}</p>
          <p className="mt-2 text-sm text-muted-foreground">链接可能已过期或不存在</p>
        </div>
      </div>
    )
  }

  if (!content) return null

  return (
    <div className="h-screen w-screen">
      <ProposalLayout projectName={content.project.name}>
        <Viewer />
      </ProposalLayout>
    </div>
  )
}
