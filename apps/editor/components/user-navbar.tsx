'use client'

import { useScene } from '@pascal-app/core'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOut, useSession } from '@/lib/auth-client'
import { saveProjectToCloud } from '@/lib/project-api'
import { ShareDialog } from './share-dialog'

/**
 * 用户状态导航栏组件
 *
 * 注入到 Editor 的 navbarSlot 中，展示当前登录状态。
 */
export function UserNavbar() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [saving, setSaving] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)

  async function handleLogout() {
    await signOut()
    router.refresh()
  }

  async function handleSave() {
    const name = window.prompt('项目名称', `未命名项目 ${new Date().toLocaleDateString('zh-CN')}`)
    if (!name) return

    const { nodes, rootNodeIds } = useScene.getState()
    if (Object.keys(nodes).length === 0) {
      alert('场景为空，无法保存')
      return
    }

    setSaving(true)
    try {
      const result = await saveProjectToCloud(name, { nodes, rootNodeIds })
      alert(`保存成功！项目 ID: ${result.project.id}`)
    } catch (err: any) {
      alert(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (isPending) {
    return (
      <div className="flex h-10 items-center gap-2 px-3">
        <div className="h-6 w-6 animate-pulse rounded-full bg-neutral-200" />
        <div className="h-4 w-16 animate-pulse rounded bg-neutral-200" />
      </div>
    )
  }

  const user = session?.user
  const userRole = (user as any)?.role

  return (
    <>
      {showShareDialog && <ShareDialog onClose={() => setShowShareDialog(false)} />}

      {!user ? (
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            onClick={() => setShowShareDialog(true)}
            type="button"
          >
            分享
          </button>
          <button
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            disabled={saving}
            onClick={handleSave}
            type="button"
          >
            {saving ? '保存中…' : '保存到云端'}
          </button>
          <Link
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            href="/login"
          >
            登录
          </Link>
          <Link
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800"
            href="/register"
          >
            注册
          </Link>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            onClick={() => setShowShareDialog(true)}
            type="button"
          >
            分享
          </button>
          <button
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            disabled={saving}
            onClick={handleSave}
            type="button"
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <Link
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            href="/projects"
          >
            我的项目
          </Link>
          <Link
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            href="/shares"
          >
            我的分享
          </Link>
          {userRole === 'admin' && (
            <Link
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800"
              href="/admin/users"
            >
              管理后台
            </Link>
          )}
          <Link
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            href="/profile"
            title="个人资料"
          >
            {user.image ? (
              <img alt="" className="h-6 w-6 rounded-full object-cover" src={user.image} />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-600">
                {(user.name || user.email || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="max-w-[100px] truncate">{user.name || user.email}</span>
          </Link>
          <button
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            onClick={handleLogout}
            type="button"
          >
            退出
          </button>
        </div>
      )}
    </>
  )
}
