'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { deleteProject, fetchProjectList, type SavedProject } from '@/lib/project-api'

export default function ProjectsPage() {
  const { data: session, isPending: sessionPending } = useSession()
  const [projects, setProjects] = useState<SavedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (sessionPending) return

    // 未登录时显示空状态，不强制跳转
    if (!session?.user) {
      setLoading(false)
      return
    }

    fetchProjectList()
      .then((data) => setProjects(data.projects))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [session, sessionPending])

  async function handleDelete(id: string) {
    if (!confirm('确定删除此项目？')) return
    try {
      await deleteProject(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (sessionPending || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">加载中…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  const isAnonymous = !session?.user

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold text-neutral-900">我的项目</h1>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
              href="/"
            >
              新建项目
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {isAnonymous ? (
          <div className="rounded-2xl border border-neutral-200 bg-white py-16 text-center">
            <p className="text-neutral-500">登录后可保存和管理您的项目</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Link
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
                href="/login"
              >
                登录
              </Link>
              <Link
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
                href="/register"
              >
                注册
              </Link>
            </div>
            <p className="mt-4 text-xs text-neutral-400">
              当前为匿名模式，项目仅可通过分享链接访问
            </p>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white py-16 text-center">
            <p className="text-neutral-500">暂无保存的项目</p>
            <Link
              className="mt-4 inline-block text-sm font-medium text-neutral-900 underline"
              href="/"
            >
              去编辑器创建第一个项目
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group relative rounded-2xl border border-neutral-200 bg-white p-5 transition hover:shadow-sm"
              >
                <h3 className="truncate text-base font-medium text-neutral-900">{project.name}</h3>
                <p className="mt-1 text-xs text-neutral-400">
                  更新于 {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <Link
                    className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800"
                    href={`/?project=${project.id}`}
                  >
                    打开
                  </Link>
                  <button
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    onClick={() => handleDelete(project.id)}
                    type="button"
                  >
                    删除
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
