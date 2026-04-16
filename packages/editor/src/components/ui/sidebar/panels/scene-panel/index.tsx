'use client'

/**
 * ScenePanel — 设计师侧场景管理面板（S3-T2）
 *
 * 功能：
 *   - 列出所有场景节点（从 useScene store 读取）
 *   - 新建场景（createScene）
 *   - 编辑场景名称、图标（updateScene）
 *   - 删除场景（deleteScene）
 *   - 为场景配置设备效果（addSceneEffect / removeSceneEffect）
 */

import { type AnyNode, type DeviceNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  addSceneEffect,
  createScene,
  deleteScene,
  getSubsystemLabel,
  removeSceneEffect,
  updateScene,
} from '@vilhil/smarthome'
import type { SceneNodeType } from '@pascal-app/core'
import {
  ChevronDown,
  GitBranch,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { SceneFlowEditor } from './scene-flow-editor'
import { useShallow } from 'zustand/shallow'
import { cn } from '../../../../../lib/utils'

// ─── 图标选择器（常用 emoji） ─────────────────────────────────────────────────

// 场景图标 — 纯文字标签，不用 emoji
const SCENE_ICONS = ['回家', '离家', '影院', '晨间', '睡眠', '会客', '阅读', '派对', '节能', '自定义']

// ─── 新建场景内联表单 ──────────────────────────────────────────────────────────

interface NewSceneFormProps {
  levelId: string
  onDone: () => void
}

function NewSceneForm({ levelId, onDone }: NewSceneFormProps) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCreate = useCallback(() => {
    const trimmed = name.trim()
    if (!trimmed) return
    createScene(levelId, trimmed, [], icon)
    onDone()
  }, [name, icon, levelId, onDone])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleCreate()
      if (e.key === 'Escape') onDone()
    },
    [handleCreate, onDone],
  )

  return (
    <motion.div
      animate={{ height: 'auto', opacity: 1 }}
      className="overflow-hidden border-border/50 border-b"
      exit={{ height: 0, opacity: 0 }}
      initial={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
    >
      <div className="flex flex-col gap-2 p-3">
        {/* 场景类型标签 */}
        <div className="flex flex-wrap gap-1">
          {SCENE_ICONS.map((label) => (
            <button
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-medium transition-all',
                icon === label
                  ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                  : 'bg-accent/30 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
              key={label}
              onClick={() => setIcon(label)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {/* 场景名称 */}
        <input
          autoFocus
          className="w-full rounded-md border border-border/50 bg-accent/20 px-2 py-1.5 text-foreground text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={'场景名称，如"回家模式"'}
          ref={inputRef}
          type="text"
          value={name}
        />

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2">
          <button
            className="rounded-md px-3 py-1 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
            onClick={onDone}
            type="button"
          >
            取消
          </button>
          <button
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-all',
              name.trim()
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'cursor-not-allowed bg-accent text-muted-foreground',
            )}
            disabled={!name.trim()}
            onClick={handleCreate}
            type="button"
          >
            创建
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── 设备效果行 ───────────────────────────────────────────────────────────────

interface DeviceEffectRowProps {
  device: DeviceNode
  sceneId: string
  effect: { state: Record<string, unknown> } | undefined
}

function DeviceEffectRow({ device, sceneId, effect }: DeviceEffectRowProps) {
  const isIncluded = !!effect
  const isLighting = device.subsystem === 'lighting'

  const handleToggleInclude = () => {
    if (isIncluded) {
      removeSceneEffect(sceneId, device.id)
    } else {
      // 以设备当前运行状态为初始值
      const currentState = (device.state as Record<string, unknown>) ?? {}
      addSceneEffect(sceneId, device.id, {
        on: (currentState.on as boolean) ?? true,
        ...(isLighting
          ? {
              brightness: (currentState.brightness as number) ?? 80,
              colorTemp: (currentState.colorTemp as number) ?? 3000,
            }
          : {}),
      })
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border px-2 py-2 transition-colors',
        isIncluded ? 'border-primary/30 bg-primary/5' : 'border-border/30 bg-accent/10',
      )}
    >
      {/* 设备行头 */}
      <div className="flex items-center gap-2">
        {/* Include 复选框 */}
        <button
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all',
            isIncluded
              ? 'border-primary bg-primary text-white'
              : 'border-border/60 hover:border-primary/60',
          )}
          onClick={handleToggleInclude}
          title={isIncluded ? '从场景移除' : '加入场景'}
          type="button"
        >
          {isIncluded && (
            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
              <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {(device.productName as string | undefined) ?? device.productId}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {getSubsystemLabel(device.subsystem)}
        </span>
      </div>

      {/* 效果配置（仅 included + lighting） */}
      {isIncluded && isLighting && effect && (
        <div className="flex flex-col gap-1 pl-6">
          {/* On/Off */}
          <div className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-[10px] text-muted-foreground">开关</span>
            <div className="flex gap-1">
              {[true, false].map((val) => (
                <button
                  className={cn(
                    'rounded px-2 py-0.5 text-[10px] font-medium transition-all',
                    effect.state.on === val
                      ? 'bg-primary/80 text-white'
                      : 'bg-accent/40 text-muted-foreground hover:bg-accent',
                  )}
                  key={String(val)}
                  onClick={() =>
                    addSceneEffect(sceneId, device.id, { ...effect.state, on: val })
                  }
                  type="button"
                >
                  {val ? '开' : '关'}
                </button>
              ))}
            </div>
          </div>

          {/* Brightness */}
          {effect.state.on !== false && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-[10px] text-muted-foreground">亮度</span>
                <input
                  className="h-1.5 flex-1 appearance-none rounded-full bg-border/40 accent-primary"
                  max={100}
                  min={0}
                  onChange={(e) =>
                    addSceneEffect(sceneId, device.id, {
                      ...effect.state,
                      brightness: Number(e.target.value),
                    })
                  }
                  step={5}
                  type="range"
                  value={(effect.state.brightness as number) ?? 80}
                />
                <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {(effect.state.brightness as number) ?? 80}%
                </span>
              </div>

              {/* Color Temp */}
              <div className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-[10px] text-muted-foreground">色温</span>
                <input
                  className="h-1.5 flex-1 appearance-none rounded-full accent-amber-400"
                  max={6500}
                  min={2700}
                  onChange={(e) =>
                    addSceneEffect(sceneId, device.id, {
                      ...effect.state,
                      colorTemp: Number(e.target.value),
                    })
                  }
                  step={100}
                  style={{
                    background: `linear-gradient(to right, #ffb347, #fff5e0, #cceeff)`,
                  }}
                  type="range"
                  value={(effect.state.colorTemp as number) ?? 3000}
                />
                <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {(effect.state.colorTemp as number) ?? 3000}K
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 场景卡片 ─────────────────────────────────────────────────────────────────

interface SceneCardProps {
  scene: SceneNodeType
  devices: DeviceNode[]
}

function SceneCard({ scene, devices }: SceneCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(scene.name)
  const [editIcon, setEditIcon] = useState(scene.icon ?? '')
  const [isFlowEditorOpen, setIsFlowEditorOpen] = useState(false)

  const effects = scene.effects ?? []

  const handleSaveName = useCallback(() => {
    const trimmed = editName.trim()
    if (trimmed && (trimmed !== scene.name || editIcon !== scene.icon)) {
      updateScene(scene.id, { name: trimmed, icon: editIcon })
    }
    setIsEditing(false)
  }, [editName, editIcon, scene.id, scene.name, scene.icon])

  const handleDelete = useCallback(() => {
    deleteScene(scene.id)
  }, [scene.id])

  const effectMap = useMemo(() => {
    const m = new Map<string, { state: Record<string, unknown> }>()
    for (const e of effects) {
      m.set(e.deviceId, { state: e.state })
    }
    return m
  }, [effects])

  return (
    <motion.div
      className="overflow-hidden border-border/50 border-b last:border-0"
      layout
      transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
    >
      {/* 卡片头 */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* 场景标签 */}
        {scene.icon ? (
          <span className="shrink-0 rounded bg-accent/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {scene.icon}
          </span>
        ) : null}

        {/* 名称 / 编辑 */}
        {isEditing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* 场景类型标签 */}
            <div className="flex flex-wrap gap-1">
              {SCENE_ICONS.map((label) => (
                <button
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-medium transition-all',
                    editIcon === label
                      ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                      : 'bg-accent/30 text-muted-foreground hover:bg-accent/60',
                  )}
                  key={label}
                  onClick={() => setEditIcon(label)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              autoFocus
              className="w-full rounded border border-border/50 bg-accent/20 px-2 py-1 text-foreground text-xs outline-none focus:border-primary/60"
              onBlur={handleSaveName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName()
                if (e.key === 'Escape') {
                  setEditName(scene.name)
                  setEditIcon(scene.icon ?? '')
                  setIsEditing(false)
                }
              }}
              type="text"
              value={editName}
            />
          </div>
        ) : (
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => setIsExpanded((v) => !v)}
            type="button"
          >
            <span className="block truncate font-medium text-foreground text-sm">{scene.name}</span>
            <span className="text-muted-foreground text-[10px]">
              {effects.length > 0 ? `${effects.length} 个设备` : '未配置设备'}
            </span>
          </button>
        )}

        {/* 操作按钮 */}
        {!isEditing && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setIsFlowEditorOpen(true)}
              title="流程编辑"
              type="button"
            >
              <GitBranch className="h-3 w-3" />
            </button>
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setIsEditing(true)}
              title="重命名"
              type="button"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-400"
              onClick={handleDelete}
              title="删除场景"
              type="button"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setIsExpanded((v) => !v)}
              title={isExpanded ? '收起' : '展开配置'}
              type="button"
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')}
              />
            </button>
          </div>
        )}

        {/* 流程编辑器遮罩 */}
        {isFlowEditorOpen && (
          <SceneFlowEditor
            devices={devices}
            onClose={() => setIsFlowEditorOpen(false)}
            scene={scene}
          />
        )}
      </div>

      {/* 设备效果配置列表 */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
          >
            <div className="flex flex-col gap-1.5 px-3 pb-3">
              {devices.length === 0 ? (
                <p className="py-2 text-center text-muted-foreground text-xs">
                  当前楼层没有设备
                </p>
              ) : (
                devices.map((device) => (
                  <DeviceEffectRow
                    device={device}
                    effect={effectMap.get(device.id)}
                    key={device.id}
                    sceneId={scene.id}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── ScenePanel 主组件 ────────────────────────────────────────────────────────

export function ScenePanel() {
  const [isCreating, setIsCreating] = useState(false)

  const levelId = useViewer((s: any) => s.levelId)

  // 所有节点（浅比较避免无限 re-render）
  const nodes = useScene(useShallow((s: any) => s.nodes))

  const allNodes: AnyNode[] = useMemo(() => Object.values(nodes), [nodes])

  // 当前楼层的场景节点
  const sceneNodes = useMemo(
    () =>
      allNodes.filter(
        (n): n is SceneNodeType => n?.type === 'scene',
      ),
    [allNodes],
  )

  // 当前楼层的设备节点（用于配置效果）
  const deviceNodes = useMemo(
    () =>
      allNodes.filter(
        (n): n is DeviceNode => n?.type === 'device',
      ),
    [allNodes],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶栏 */}
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span className="font-semibold text-foreground text-sm">场景</span>
          {sceneNodes.length > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {sceneNodes.length}
            </span>
          )}
        </div>

        <button
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg transition-all',
            isCreating ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
          onClick={() => setIsCreating((v) => !v)}
          title={isCreating ? '取消' : '新建场景'}
          type="button"
        >
          {isCreating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {/* 新建场景表单 */}
      <AnimatePresence initial={false}>
        {isCreating && levelId && (
          <NewSceneForm
            key="new-scene-form"
            levelId={levelId}
            onDone={() => setIsCreating(false)}
          />
        )}
        {isCreating && !levelId && (
          <motion.div
            animate={{ opacity: 1 }}
            className="px-3 py-2 text-muted-foreground text-xs"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            请先选择楼层
          </motion.div>
        )}
      </AnimatePresence>

      {/* 场景列表 */}
      <div className="no-scrollbar flex-1 overflow-y-auto">
        {sceneNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/50">
              <Sparkles className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <div>
              <p className="font-medium text-foreground text-sm">还没有场景</p>
              <p className="mt-0.5 text-muted-foreground text-xs">
                点击 + 新建一个场景，如"回家模式"
              </p>
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sceneNodes.map((scene) => (
              <SceneCard
                devices={deviceNodes}
                key={scene.id}
                scene={scene}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* 底部提示 */}
      {sceneNodes.length > 0 && (
        <div className="shrink-0 border-border/50 border-t px-3 py-2">
          <p className="text-[10px] text-muted-foreground">
            在展示模式底部的场景栏点击卡片，即可一键应用场景。
          </p>
        </div>
      )}
    </div>
  )
}
