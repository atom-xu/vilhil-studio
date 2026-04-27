'use client'

import { useScene } from '@pascal-app/core'
import { Check, CloudUpload, FolderOpen, Link2, LogOut, Pencil, Share2, User } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { signOut, useSession } from '@/lib/auth-client'
import { getCurrentProject, setCurrentProject, useCurrentProject } from '@/lib/current-project'
import { saveProjectToCloud } from '@/lib/project-api'
import { toast } from '@/lib/toast'
import { ShareDialog } from './share-dialog'

const ICON_BTN =
  'flex h-7 w-7 items-center justify-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-25 disabled:pointer-events-none'

export function UserNavbar() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const currentProject = useCurrentProject()

  const [saving, setSaving] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [savePopoverOpen, setSavePopoverOpen] = useState(false)
  const [nameInput, setNameInput] = useState('')

  const menuRef = useRef<HTMLDivElement>(null)
  const savePopoverRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // close menus on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (savePopoverRef.current && !savePopoverRef.current.contains(e.target as Node)) {
        setSavePopoverOpen(false)
      }
    }
    if (menuOpen || savePopoverOpen) {
      document.addEventListener('mousedown', onClickOutside)
    }
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen, savePopoverOpen])

  // focus input when popover opens
  useEffect(() => {
    if (savePopoverOpen) {
      setNameInput(currentProject?.name ?? `未命名项目 ${new Date().toLocaleDateString('zh-CN')}`)
      setTimeout(() => nameInputRef.current?.select(), 50)
    }
  }, [savePopoverOpen, currentProject?.name])

  async function handleLogout() {
    setMenuOpen(false)
    await signOut()
    router.refresh()
  }

  async function doSave(name: string, projectId?: string) {
    const { nodes, rootNodeIds } = useScene.getState()
    if (Object.keys(nodes).length === 0) {
      toast('场景为空，无法保存', 'error')
      return
    }
    setSaving(true)
    setSavePopoverOpen(false)
    try {
      const result = await saveProjectToCloud(name.trim(), { nodes, rootNodeIds }, projectId)
      setCurrentProject({ id: result.project.id, name: name.trim() })
      toast(`已保存：${name.trim()}`, 'success')
    } catch (err: any) {
      toast(err.message || '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleSaveClick() {
    const cp = getCurrentProject()
    if (cp) {
      // has current project → update directly, no dialog needed
      doSave(cp.name, cp.id)
    } else {
      // new project → show name input
      setSavePopoverOpen(true)
    }
  }

  function handleSaveSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameInput.trim()) return
    doSave(nameInput)
  }

  const user = session?.user
  const userRole = (user as any)?.role

  return (
    <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-4">
      {/* Brand + current project name */}
      <div className="flex items-center gap-2">
        <span className="select-none font-barlow text-sm font-semibold tracking-wide text-sidebar-foreground/50">
          VilHil
        </span>
        {currentProject && (
          <>
            <span className="text-sidebar-foreground/25">/</span>
            <button
              className="flex items-center gap-1 rounded px-1 text-sm text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
              onClick={() => setSavePopoverOpen(true)}
              type="button"
              title="重命名或另存为"
            >
              {currentProject.name}
              <Pencil className="h-3 w-3 opacity-40" />
            </button>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5">
        {showShareDialog && <ShareDialog onClose={() => setShowShareDialog(false)} />}

        <button
          className={ICON_BTN}
          onClick={() => setShowShareDialog(true)}
          title="分享"
          type="button"
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>

        {/* Save button + popover */}
        <div className="relative" ref={savePopoverRef}>
          <button
            className={ICON_BTN}
            disabled={saving || isPending || !user}
            onClick={handleSaveClick}
            title={
              !user
                ? '登录后可保存'
                : saving
                  ? '保存中…'
                  : currentProject
                    ? `更新「${currentProject.name}」`
                    : '保存到云端'
            }
            type="button"
          >
            {saving ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sidebar-foreground/30 border-t-sidebar-foreground/70" />
            ) : (
              <CloudUpload className="h-3.5 w-3.5" />
            )}
          </button>

          {savePopoverOpen && (
            <form
              className="absolute right-0 top-9 z-50 w-64 rounded-xl border border-border bg-popover p-3 shadow-xl"
              onSubmit={handleSaveSubmit}
            >
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {currentProject ? '另存为新项目' : '保存项目'}
              </p>
              <input
                ref={nameInputRef}
                className="w-full rounded-[var(--ui-radius-control)] border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-[var(--ui-focus-ring)]"
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="项目名称"
                type="text"
                value={nameInput}
              />
              <div className="mt-2 flex gap-2">
                <button
                  className="flex-1 vh-btn vh-btn-primary py-1.5 text-xs"
                  disabled={!nameInput.trim()}
                  type="submit"
                >
                  保存
                </button>
                <button
                  className="vh-btn vh-btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => setSavePopoverOpen(false)}
                  type="button"
                >
                  取消
                </button>
              </div>
            </form>
          )}
        </div>

        {/* User area */}
        {isPending ? (
          <div className="ml-1 h-6 w-6 animate-pulse rounded-full bg-sidebar-accent" />
        ) : !user ? (
          <Link
            className="ml-2 rounded-md px-2 py-1 text-xs text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            href="/login"
          >
            登录
          </Link>
        ) : (
          <div className="relative ml-1.5" ref={menuRef}>
            <button
              className="flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-semibold text-sidebar-accent-foreground transition-opacity hover:opacity-75"
              onClick={() => setMenuOpen((v) => !v)}
              title={user.name || user.email}
              type="button"
            >
              {user.image ? (
                <img alt="" className="h-6 w-6 rounded-full object-cover" src={user.image} />
              ) : (
                (user.name || user.email || '?').charAt(0).toUpperCase()
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-8 z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl">
                <p className="truncate px-3 py-1.5 text-xs text-muted-foreground">{user.email}</p>
                <div className="my-1 h-px bg-border" />
                <Link
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                  href="/projects"
                  onClick={() => setMenuOpen(false)}
                >
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  我的项目
                </Link>
                <Link
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                  href="/shares"
                  onClick={() => setMenuOpen(false)}
                >
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  我的分享
                </Link>
                <Link
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                >
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  个人资料
                </Link>
                {userRole === 'admin' && (
                  <Link
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                    href="/admin/users"
                    onClick={() => setMenuOpen(false)}
                  >
                    管理后台
                  </Link>
                )}
                <div className="my-1 h-px bg-border" />
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                  onClick={handleLogout}
                  type="button"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  退出登录
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
