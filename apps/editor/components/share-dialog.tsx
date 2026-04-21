'use client'

import { useScene } from '@pascal-app/core'
import { useState } from 'react'
import { createShareLink } from '@/lib/share-api'

interface ShareDialogProps {
  onClose: () => void
}

export function ShareDialog({ onClose }: ShareDialogProps) {
  const [name, setName] = useState(`方案分享 ${new Date().toLocaleDateString('zh-CN')}`)
  const [permission, setPermission] = useState<'view' | 'operate'>('operate')
  const [expiresInDays, setExpiresInDays] = useState<number>(7)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    shareUrl: string
    token: string
    expiresAt: string | null
    hasPassword: boolean
  } | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const { nodes, rootNodeIds } = useScene.getState()
    if (Object.keys(nodes).length === 0) {
      setError('场景为空，无法分享')
      return
    }

    setLoading(true)
    try {
      const res = await createShareLink(
        name.trim() || '未命名方案',
        { nodes, rootNodeIds },
        {
          permission,
          expiresInDays: expiresInDays === 0 ? null : expiresInDays,
          password: password.trim() || undefined,
        },
      )
      setResult(res)
      navigator.clipboard.writeText(res.shareUrl).catch(() => {})
    } catch (err: any) {
      setError(err.message || '创建分享链接失败')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result.shareUrl).then(() => {
      alert('链接已复制到剪贴板')
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-lg">
        {!result ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <h2 className="text-lg font-semibold text-neutral-900">生成分享链接</h2>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">分享名称</label>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                onChange={(e) => setName(e.target.value)}
                type="text"
                value={name}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">客户权限</label>
              <div className="flex gap-2">
                <button
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                    permission === 'operate'
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                  }`}
                  onClick={() => setPermission('operate')}
                  type="button"
                >
                  可操作设备
                </button>
                <button
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                    permission === 'view'
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                  }`}
                  onClick={() => setPermission('view')}
                  type="button"
                >
                  仅查看
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">有效期</label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                value={expiresInDays}
              >
                <option value={7}>7 天</option>
                <option value={30}>30 天</option>
                <option value={0}>永久有效</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                访问密码（可选）
              </label>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="留空表示无需密码"
                type="text"
                value={password}
              />
              <p className="mt-1 text-xs text-neutral-400">设置密码后，访客需输入密码才能查看方案</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                className="flex-1 rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
                disabled={loading}
                type="submit"
              >
                {loading ? '生成中…' : '生成链接'}
              </button>
              <button
                className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
                onClick={onClose}
                type="button"
              >
                取消
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">分享链接已生成</h2>
            <p className="text-sm text-neutral-500">客户可通过此链接访问您的方案</p>

            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <p className="break-all text-sm text-neutral-900">{result.shareUrl}</p>
              {result.expiresAt ? (
                <p className="mt-1 text-xs text-neutral-500">
                  有效期至 {new Date(result.expiresAt).toLocaleDateString('zh-CN')}
                </p>
              ) : (
                <p className="mt-1 text-xs text-neutral-500">永久有效</p>
              )}
              {result.hasPassword && (
                <p className="mt-1 text-xs text-amber-600">已设置访问密码</p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
                onClick={handleCopy}
                type="button"
              >
                复制链接
              </button>
              <button
                className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
                onClick={onClose}
                type="button"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
