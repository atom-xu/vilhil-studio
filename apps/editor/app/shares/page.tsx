'use client'

import { Check, Copy } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import { toast } from '@/lib/toast'

interface ShareItem {
  id: string
  token: string
  projectName: string
  permission: 'view' | 'operate'
  expiresAt: string | null
  viewCount: number
  hasPassword: boolean
  isExpired: boolean
  createdAt: string
}

export default function SharesPage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [shares, setShares] = useState<ShareItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isPending) return
    if (!session?.user) {
      router.push('/login?redirect=/shares')
      return
    }
    loadShares()
  }, [session, isPending, router])

  async function loadShares() {
    setLoading(true)
    try {
      const res = await fetch('/api/share/list')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || '获取分享列表失败')
      }
      const data = await res.json()
      setShares(data.shares || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function requestRevoke(id: string) {
    setConfirmRevokeId(id)
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    confirmTimerRef.current = setTimeout(() => setConfirmRevokeId(null), 4000)
  }

  async function confirmRevoke(id: string) {
    setConfirmRevokeId(null)
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    try {
      const res = await fetch('/api/share/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || '撤销失败')
      }
      toast('分享链接已撤销', 'info')
      loadShares()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  function handleCopy(token: string, shareId: string) {
    const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
    const url = `${baseURL}/share/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(shareId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  if (isPending || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <p className="text-sm text-muted-foreground">加载中…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">{error}</p>
          <button
            className="mt-4 vh-btn vh-btn-primary px-4 py-2 text-sm"
            onClick={() => router.push('/')}
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold text-foreground">我的分享</h1>
          <Link className="vh-btn vh-btn-secondary px-4 py-2 text-sm" href="/">
            返回编辑器
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {shares.length === 0 ? (
          <div className="vh-panel py-16 text-center">
            <p className="text-muted-foreground">暂无分享链接</p>
            <p className="mt-2 text-sm text-muted-foreground">在编辑器中点击"分享"按钮生成链接</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shares.map((s) => (
              <div key={s.id} className="flex items-center justify-between vh-panel p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{s.projectName}</span>
                    {s.isExpired && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        已过期
                      </span>
                    )}
                    {s.hasPassword && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                        密码保护
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>权限：{s.permission === 'operate' ? '可操作' : '仅查看'}</span>
                    <span>浏览：{s.viewCount} 次</span>
                    <span>
                      {s.expiresAt
                        ? `有效期至 ${new Date(s.expiresAt).toLocaleDateString('zh-CN')}`
                        : '永久有效'}
                    </span>
                  </div>
                </div>

                <div className="ml-4 flex items-center gap-2">
                  <button
                    className="vh-btn vh-btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => handleCopy(s.token, s.id)}
                    type="button"
                  >
                    {copiedId === s.id ? (
                      <><Check className="h-3.5 w-3.5" /> 已复制</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5" /> 复制链接</>
                    )}
                  </button>

                  {confirmRevokeId === s.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        className="vh-btn px-2 py-1 text-xs text-white bg-destructive hover:bg-destructive/90 rounded-[var(--ui-radius-control)]"
                        onClick={() => confirmRevoke(s.id)}
                        type="button"
                      >
                        确认撤销
                      </button>
                      <button
                        className="vh-btn vh-btn-ghost px-2 py-1 text-xs"
                        onClick={() => setConfirmRevokeId(null)}
                        type="button"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      className="vh-btn px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => requestRevoke(s.id)}
                      type="button"
                    >
                      撤销
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
