'use client'

import { useScene } from '@pascal-app/core'
import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  const [copied, setCopied] = useState(false)
  const [copyFallback, setCopyFallback] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

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
    navigator.clipboard.writeText(result.shareUrl).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => {
        // Clipboard API not available (e.g., non-HTTPS) → show manual copy input
        setCopyFallback(true)
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md vh-panel p-6">
        {!result ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <h2 className="text-lg font-semibold text-foreground">生成分享链接</h2>

            {error && (
              <div className="rounded-[var(--ui-radius-control)] border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">分享名称</label>
              <input
                className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-[var(--ui-focus-ring)]"
                onChange={(e) => setName(e.target.value)}
                type="text"
                value={name}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">客户权限</label>
              <div className="flex gap-2">
                <button
                  className={`flex-1 rounded-[var(--ui-radius-control)] border px-3 py-2 text-sm transition ${
                    permission === 'operate'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                  onClick={() => setPermission('operate')}
                  type="button"
                >
                  可操作设备
                </button>
                <button
                  className={`flex-1 rounded-[var(--ui-radius-control)] border px-3 py-2 text-sm transition ${
                    permission === 'view'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                  onClick={() => setPermission('view')}
                  type="button"
                >
                  仅查看
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">有效期</label>
              <select
                className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                value={expiresInDays}
              >
                <option value={7}>7 天</option>
                <option value={30}>30 天</option>
                <option value={0}>永久有效</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                访问密码（可选）
              </label>
              <input
                className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-[var(--ui-focus-ring)]"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="留空表示无需密码"
                type="text"
                value={password}
              />
              <p className="mt-1 text-xs text-muted-foreground">设置密码后，访客需输入密码才能查看方案</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                className="flex-1 vh-btn vh-btn-primary py-2.5"
                disabled={loading}
                type="submit"
              >
                {loading ? '生成中…' : '生成链接'}
              </button>
              <button
                className="vh-btn vh-btn-secondary px-4 py-2.5"
                onClick={onClose}
                type="button"
              >
                取消
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">分享链接已生成</h2>
            <p className="text-sm text-muted-foreground">客户可通过此链接访问您的方案</p>

            <div className="rounded-[var(--ui-radius-control)] border border-border bg-muted p-3">
              <p className="break-all text-sm text-foreground">{result.shareUrl}</p>
              {result.expiresAt ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  有效期至 {new Date(result.expiresAt).toLocaleDateString('zh-CN')}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">永久有效</p>
              )}
              {result.hasPassword && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">已设置访问密码</p>
              )}
            </div>

            {copyFallback && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">请手动复制链接：</p>
                <input
                  readOnly
                  autoFocus
                  className="w-full rounded-[var(--ui-radius-control)] border border-border bg-muted px-3 py-1.5 text-sm text-foreground outline-none"
                  onFocus={(e) => e.target.select()}
                  value={result.shareUrl}
                />
              </div>
            )}

            <div className="flex gap-2">
              {!copyFallback && (
                <button
                  className="flex-1 vh-btn vh-btn-primary py-2.5"
                  onClick={handleCopy}
                  type="button"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      复制链接
                    </>
                  )}
                </button>
              )}
              <button
                className={`vh-btn vh-btn-secondary py-2.5 ${copyFallback ? 'flex-1' : 'px-4'}`}
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
