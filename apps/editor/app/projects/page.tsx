'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { deleteProject, fetchProjectList, type SavedProject } from '@/lib/project-api'
import { toast } from '@/lib/toast'

export default function ProjectsPage() {
  const { data: session, isPending: sessionPending } = useSession()
  const [projects, setProjects] = useState<SavedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (sessionPending) return

    if (!session?.user) {
      setLoading(false)
      return
    }

    fetchProjectList()
      .then((data) => setProjects(data.projects))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [session, sessionPending])

  function requestDelete(id: string) {
    setConfirmDeleteId(id)
    // auto-cancel after 4s if user doesn't confirm
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    confirmTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 4000)
  }

  async function confirmDelete(id: string) {
    setConfirmDeleteId(null)
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    try {
      await deleteProject(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
      toast('项目已删除', 'info')
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  if (sessionPending || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  const isAnonymous = !session?.user

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold text-foreground">我的项目</h1>
          <Link className="vh-btn vh-btn-primary px-4 py-2 text-sm" href="/">
            新建项目
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {isAnonymous ? (
          <div className="vh-panel py-16 text-center">
            <p className="text-muted-foreground">登录后可保存和管理您的项目</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Link className="vh-btn vh-btn-primary px-4 py-2 text-sm" href="/login">
                登录
              </Link>
              <Link className="vh-btn vh-btn-secondary px-4 py-2 text-sm" href="/register">
                注册
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              当前为匿名模式，项目仅可通过分享链接访问
            </p>
          </div>
        ) : projects.length === 0 ? (
          <div className="vh-panel py-16 text-center">
            <p className="text-muted-foreground">暂无保存的项目</p>
            <Link
              className="mt-4 inline-block text-sm font-medium text-foreground underline"
              href="/"
            >
              去编辑器创建第一个项目
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div key={project.id} className="group relative vh-panel p-5 transition hover:shadow-md">
                <h3 className="truncate text-base font-medium text-foreground">{project.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  更新于 {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <Link
                    className="vh-btn vh-btn-primary px-3 py-1.5 text-xs"
                    href={`/?project=${project.id}`}
                  >
                    打开
                  </Link>

                  {confirmDeleteId === project.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        className="vh-btn px-2 py-1 text-xs text-white bg-destructive hover:bg-destructive/90 rounded-[var(--ui-radius-control)]"
                        onClick={() => confirmDelete(project.id)}
                        type="button"
                      >
                        确认删除
                      </button>
                      <button
                        className="vh-btn vh-btn-ghost px-2 py-1 text-xs"
                        onClick={() => setConfirmDeleteId(null)}
                        type="button"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      className="vh-btn px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => requestDelete(project.id)}
                      type="button"
                    >
                      删除
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
