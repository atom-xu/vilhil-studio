'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/auth-client'

export default function ProfilePage() {
  const router = useRouter()
  const { data: session, isPending } = useSession()

  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [updatingProfile, setUpdatingProfile] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  useEffect(() => {
    if (isPending) return
    if (!session?.user) {
      router.push('/login?redirect=/profile')
      return
    }
    setName(session.user.name || '')
    setImage(session.user.image || '')
  }, [session, isPending, router])

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess('')
    setUpdatingProfile(true)

    try {
      const res = await fetch('/api/auth/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, image: image || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || '更新失败')
      }
      setProfileSuccess('资料已更新')
      router.refresh()
    } catch (err: any) {
      setProfileError(err.message)
    } finally {
      setUpdatingProfile(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('新密码至少 8 位')
      return
    }

    setUpdatingPassword(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || '密码修改失败')
      }
      setPasswordSuccess('密码已修改')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPasswordError(err.message)
    } finally {
      setUpdatingPassword(false)
    }
  }

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          <p className="text-sm text-neutral-500">加载中…</p>
        </div>
      </div>
    )
  }

  if (!session?.user) return null

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold text-neutral-900">个人资料</h1>
          <button
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
            onClick={() => router.push('/')}
            type="button"
          >
            返回编辑器
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
        {/* 资料卡片 */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">基本信息</h2>

          {profileError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
              {profileError}
            </div>
          )}
          {profileSuccess && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-600">
              {profileSuccess}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleUpdateProfile}>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">邮箱</label>
              <input
                disabled
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                type="email"
                value={session.user.email}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">昵称</label>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                onChange={(e) => setName(e.target.value)}
                placeholder="设计师小王"
                type="text"
                value={name}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                头像 URL（可选）
              </label>
              <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://example.com/avatar.png"
                type="text"
                value={image}
              />
              {image && (
                <img
                  alt="头像预览"
                  className="mt-2 h-12 w-12 rounded-full object-cover"
                  src={image}
                />
              )}
            </div>
            <button
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
              disabled={updatingProfile}
              type="submit"
            >
              {updatingProfile ? '保存中…' : '保存资料'}
            </button>
          </form>
        </div>

        {/* 修改密码卡片 */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">修改密码</h2>

          {passwordError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
              {passwordError}
            </div>
          )}
          {passwordSuccess && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-600">
              {passwordSuccess}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleChangePassword}>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">当前密码</label>
              <input
                required
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                onChange={(e) => setOldPassword(e.target.value)}
                type="password"
                value={oldPassword}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">新密码</label>
              <input
                required
                minLength={8}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                onChange={(e) => setNewPassword(e.target.value)}
                type="password"
                value={newPassword}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">确认新密码</label>
              <input
                required
                minLength={8}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                value={confirmPassword}
              />
            </div>
            <button
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
              disabled={updatingPassword}
              type="submit"
            >
              {updatingPassword ? '修改中…' : '修改密码'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
