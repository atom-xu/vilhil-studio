'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { signIn } from '@/lib/auth-client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get('redirect') || '/'
  const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await signIn.email({ email, password })

    setLoading(false)

    if (res.error) {
      setError(res.error.message || '登录失败')
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm vh-panel p-8">
      <h1 className="mb-1 text-2xl font-semibold text-foreground">登录 VilHil</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {redirectTo !== '/' ? `登录后继续访问 ${redirectTo}` : '继续管理您的智能方案'}
      </p>

      {error && (
        <div className="mb-4 rounded-[var(--ui-radius-control)] border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="email">
            邮箱
          </label>
          <input
            required
            autoComplete="email"
            className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-[var(--ui-focus-ring)]"
            id="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="designer@example.com"
            type="email"
            value={email}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="password">
            密码
          </label>
          <input
            required
            autoComplete="current-password"
            className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-[var(--ui-focus-ring)]"
            id="password"
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            value={password}
          />
        </div>

        <button
          className="w-full vh-btn vh-btn-primary py-2.5"
          disabled={loading}
          type="submit"
        >
          {loading ? '登录中…' : '登录'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        还没有账号？{' '}
        <Link
          className="font-medium text-foreground underline underline-offset-2"
          href="/register"
        >
          立即注册
        </Link>
      </p>

      {/* 游客模式入口 —— 只有从编辑器跳来（redirect=/）或直接访问登录页时才显示 */}
      {(redirectTo === '/' || redirectTo.startsWith('/?')) && (
        <div className="mt-4 border-t border-border/40 pt-4 text-center">
          <Link
            className="text-sm text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            href="/"
          >
            先试试看，不登录继续 →
          </Link>
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Suspense
        fallback={
          <div className="w-full max-w-sm vh-panel p-8">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
            <p className="text-center text-sm text-muted-foreground">加载中…</p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  )
}
