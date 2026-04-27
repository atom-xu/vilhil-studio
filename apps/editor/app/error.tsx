'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="font-barlow text-6xl font-semibold text-foreground/10">!</p>
      <h1 className="text-xl font-semibold text-foreground">出了点问题</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error.message || '发生了未知错误，请尝试刷新页面'}
      </p>
      <div className="mt-2 flex gap-3">
        <button
          className="vh-btn vh-btn-primary px-5 py-2 text-sm"
          onClick={reset}
          type="button"
        >
          重试
        </button>
        <a className="vh-btn vh-btn-secondary px-5 py-2 text-sm" href="/">
          返回首页
        </a>
        <a
          className="vh-btn vh-btn-secondary px-5 py-2 text-sm"
          href="mailto:support@vilhil.cn"
        >
          联系支持
        </a>
      </div>
    </div>
  )
}
