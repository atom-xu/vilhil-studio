'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'

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

  async function handleDelete(id: string) {
    if (!confirm('确定撤销此分享链接？')) return
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
      loadShares()
    } catch (err: any) {
      alert(err.message)
    }
  }

  function handleCopy(token: string) {
    const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
    const url = `${baseURL}/share/${token}`
    navigator.clipboard.writeText(url).then(() => alert('链接已复制'))
  }

  if (isPending || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          <p className="text-sm text-neutral-500">加载中…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="text-center">
          <p className="text-lg font-medium text-red-600">{error}</p>
          <button
            className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white"
            onClick={() => router.push('/')}
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold text-neutral-900">我的分享</h1>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
              href="/"
            >
              返回编辑器
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {shares.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white py-16 text-center">
            <p className="text-neutral-500">暂无分享链接</p>
            <p className="mt-2 text-sm text-neutral-400">在编辑器中点击"分享"按钮生成链接</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shares.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900">{s.projectName}</span>
                    {s.isExpired && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                        已过期
                      </span>
                    )}
                    {s.hasPassword && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                        密码保护
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
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
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100"
                    onClick={() => handleCopy(s.token)}
                    type="button"
                  >
                    复制链接
                  </button>
                  <button
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    onClick={() => handleDelete(s.id)}
                    type="button"
                  >
                    撤销
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
