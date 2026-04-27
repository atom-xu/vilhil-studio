'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'
import { toast } from '@/lib/toast'

interface AdminUser {
  id: string
  name: string | null
  email: string
  role: string
  createdAt: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user')
  const [creating, setCreating] = useState(false)

  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isPending) return
    if (!session?.user) {
      router.push('/login?redirect=/admin/users')
      return
    }
    const role = (session.user as any).role
    if (role !== 'admin') {
      setError('无权访问：需要管理员权限')
      setLoading(false)
      return
    }
    loadUsers()
  }, [session, isPending, router])

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/admin/list-users')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || '获取用户列表失败')
      }
      const data = await res.json()
      setUsers(data.users || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/auth/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName || undefined,
          email: newEmail,
          password: newPassword,
          role: newRole,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || '创建用户失败')
      }
      setShowCreate(false)
      setNewName('')
      setNewEmail('')
      setNewPassword('')
      setNewRole('user')
      loadUsers()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  function requestDelete(userId: string) {
    setConfirmDeleteId(userId)
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    confirmTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 4000)
  }

  async function confirmDelete(userId: string) {
    setConfirmDeleteId(null)
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    try {
      const res = await fetch('/api/auth/admin/remove-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || '删除失败')
      }
      toast('用户已删除', 'info')
      loadUsers()
    } catch (err: any) {
      toast(err.message, 'error')
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!resetUserId) return
    setResetting(true)
    try {
      const res = await fetch('/api/auth/admin/set-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetUserId, password: resetPassword }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || '重置密码失败')
      }
      setResetUserId(null)
      setResetPassword('')
      toast('密码已重置', 'success')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setResetting(false)
    }
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
          <h1 className="text-xl font-semibold text-foreground">用户管理</h1>
          <div className="flex items-center gap-3">
            <button
              className="vh-btn vh-btn-primary px-4 py-2 text-sm"
              onClick={() => setShowCreate(true)}
              type="button"
            >
              创建用户
            </button>
            <button
              className="vh-btn vh-btn-secondary px-4 py-2 text-sm"
              onClick={() => router.push('/')}
              type="button"
            >
              返回编辑器
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="overflow-hidden vh-panel">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 font-medium text-foreground">用户</th>
                <th className="px-4 py-3 font-medium text-foreground">邮箱</th>
                <th className="px-4 py-3 font-medium text-foreground">角色</th>
                <th className="px-4 py-3 font-medium text-foreground">创建时间</th>
                <th className="px-4 py-3 font-medium text-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                    暂无用户
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{u.name || '未命名'}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.role === 'admin'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {u.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="vh-btn vh-btn-ghost px-2 py-1 text-xs"
                          onClick={() => setResetUserId(u.id)}
                          type="button"
                        >
                          重置密码
                        </button>
                        {confirmDeleteId === u.id ? (
                          <>
                            <button
                              className="vh-btn px-2 py-1 text-xs text-white bg-destructive hover:bg-destructive/90 rounded-[var(--ui-radius-control)]"
                              onClick={() => confirmDelete(u.id)}
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
                          </>
                        ) : (
                        <button
                          className="vh-btn px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => requestDelete(u.id)}
                          type="button"
                        >
                          删除
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* 创建用户弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md vh-panel p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">创建用户</h2>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">名称</label>
                <input
                  className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-[var(--ui-focus-ring)]"
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="设计师小王"
                  type="text"
                  value={newName}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">邮箱 *</label>
                <input
                  required
                  className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-[var(--ui-focus-ring)]"
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="designer@example.com"
                  type="email"
                  value={newEmail}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">密码 *</label>
                <input
                  required
                  minLength={8}
                  className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-[var(--ui-focus-ring)]"
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 8 位字符"
                  type="password"
                  value={newPassword}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">角色</label>
                <select
                  className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
                  onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}
                  value={newRole}
                >
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  className="flex-1 vh-btn vh-btn-primary py-2.5"
                  disabled={creating}
                  type="submit"
                >
                  {creating ? '创建中…' : '创建'}
                </button>
                <button
                  className="vh-btn vh-btn-secondary px-4 py-2.5"
                  onClick={() => setShowCreate(false)}
                  type="button"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 重置密码弹窗 */}
      {resetUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md vh-panel p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">重置密码</h2>
            <form className="space-y-4" onSubmit={handleResetPassword}>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">新密码</label>
                <input
                  required
                  minLength={8}
                  className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-[var(--ui-focus-ring)]"
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="至少 8 位字符"
                  type="password"
                  value={resetPassword}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  className="flex-1 vh-btn vh-btn-primary py-2.5"
                  disabled={resetting}
                  type="submit"
                >
                  {resetting ? '重置中…' : '确认重置'}
                </button>
                <button
                  className="vh-btn vh-btn-secondary px-4 py-2.5"
                  onClick={() => setResetUserId(null)}
                  type="button"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
