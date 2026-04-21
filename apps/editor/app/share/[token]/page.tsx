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
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          <p className="text-sm text-neutral-500">正在加载方案…</p>
        </div>
      </div>
    )
  }

  if (needsPassword) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-50">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">访问受保护</h1>
          <p className="mb-6 text-sm text-neutral-500">此方案需要输入访问密码</p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="请输入访问密码"
              type="password"
              value={passwordInput}
            />
            <button
              className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
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
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-50">
        <div className="text-center">
          <p className="text-lg font-medium text-neutral-900">{error}</p>
          <p className="mt-2 text-sm text-neutral-500">链接可能已过期或不存在</p>
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
