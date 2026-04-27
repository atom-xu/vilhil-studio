'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function VerifyForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('正在验证邮箱…')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('验证链接无效，缺少 token')
      return
    }

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.ok) {
          setStatus('success')
          setMessage('邮箱验证成功！即将跳转到登录页…')
          setTimeout(() => router.push('/login'), 2000)
        } else {
          const err = await res.json().catch(() => ({}))
          setStatus('error')
          setMessage(err.message || '验证失败，链接可能已过期')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('网络错误，请稍后重试')
      })
  }, [token, router])

  return (
    <div className="w-full max-w-sm vh-panel p-8 text-center">
      <h1 className="mb-2 text-2xl font-semibold text-foreground">邮箱验证</h1>

      {status === 'loading' && (
        <>
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <p className="text-sm text-muted-foreground">{message}</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-xl">
            ✓
          </div>
          <p className="text-sm text-primary">{message}</p>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xl">
            ✕
          </div>
          <p className="text-sm text-destructive">{message}</p>
          <button
            className="mt-4 vh-btn vh-btn-primary px-4 py-2 text-sm"
            onClick={() => router.push('/login')}
            type="button"
          >
            前往登录
          </button>
        </>
      )}
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Suspense
        fallback={
          <div className="w-full max-w-sm vh-panel p-8 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground" />
            <p className="text-sm text-muted-foreground">加载中…</p>
          </div>
        }
      >
        <VerifyForm />
      </Suspense>
    </div>
  )
}
