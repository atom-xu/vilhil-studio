'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'

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

  // 创建用户表单
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user')
  const [creating, setCreating] = useState(false)

  // 重置密码
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

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
      // Better Auth admin list-users 返回格式可能是 { users: [...] }
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
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm('确定删除此用户？此操作不可撤销。')) return
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
      loadUsers()
    } catch (err: any) {
      alert(err.message)
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
      alert('密码已重置')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setResetting(false)
    }
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
          <h1 className="text-xl font-semibold text-neutral-900">用户管理</h1>
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
              onClick={() => setShowCreate(true)}
              type="button"
            >
              创建用户
            </button>
            <button
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
              onClick={() => router.push('/')}
              type="button"
            >
              返回编辑器
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 font-medium text-neutral-700">用户</th>
                <th className="px-4 py-3 font-medium text-neutral-700">邮箱</th>
                <th className="px-4 py-3 font-medium text-neutral-700">角色</th>
                <th className="px-4 py-3 font-medium text-neutral-700">创建时间</th>
                <th className="px-4 py-3 font-medium text-neutral-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={5}>
                    暂无用户
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-neutral-900">{u.name || '未命名'}</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.role === 'admin'
                            ? 'bg-neutral-900 text-white'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {u.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100"
                          onClick={() => setResetUserId(u.id)}
                          type="button"
                        >
                          重置密码
                        </button>
                        <button
                          className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                          onClick={() => handleDelete(u.id)}
                          type="button"
                        >
                          删除
                        </button>
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
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">创建用户</h2>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">名称</label>
                <input
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="设计师小王"
                  type="text"
                  value={newName}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">邮箱 *</label>
                <input
                  required
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="designer@example.com"
                  type="email"
                  value={newEmail}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">密码 *</label>
                <input
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 8 位字符"
                  type="password"
                  value={newPassword}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">角色</label>
                <select
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}
                  value={newRole}
                >
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  className="flex-1 rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
                  disabled={creating}
                  type="submit"
                >
                  {creating ? '创建中…' : '创建'}
                </button>
                <button
                  className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
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
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">重置密码</h2>
            <form className="space-y-4" onSubmit={handleResetPassword}>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">新密码</label>
                <input
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="至少 8 位字符"
                  type="password"
                  value={resetPassword}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  className="flex-1 rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
                  disabled={resetting}
                  type="submit"
                >
                  {resetting ? '重置中…' : '确认重置'}
                </button>
                <button
                  className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
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
