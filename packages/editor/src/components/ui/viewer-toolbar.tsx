'use client'

import { type BuildingNode, type LevelNode, useScene } from '@pascal-app/core'
import { Icon as IconifyIcon } from '@iconify/react'
import { useViewer } from '@pascal-app/viewer'
import {
  ChevronsLeft,
  ChevronsRight,
  Columns2,
  Eye,
  Footprints,
  FolderOpen,
  Layers,
  Moon,
  Save,
  Sparkles,
  Sun,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '../../lib/utils'
import useEditor from '../../store/use-editor'
import type { ViewMode } from '../../store/use-editor'
import { Popover, PopoverContent, PopoverTrigger } from './primitives/popover'
import { useSidebarStore } from './primitives/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip'

// ── Shared styles ───────────────────────────────────────────────────────────

/** Container for a group of buttons — no padding, overflow-hidden clips children flush. */
const TOOLBAR_CONTAINER =
  'inline-flex h-8 items-stretch overflow-hidden rounded-xl border border-border bg-background/90 shadow-2xl backdrop-blur-md'

/** Ghost button inside a container — flush edges, no individual border/radius. */
const TOOLBAR_BTN =
  'flex items-center justify-center w-8 text-muted-foreground/80 transition-colors hover:bg-white/8 hover:text-foreground/90'

// ── View mode segmented control ─────────────────────────────────────────────

const VIEW_MODES: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    id: '3d',
    label: '3D',
    icon: <img alt="" className="h-3.5 w-3.5 object-contain" src="/icons/building.png" />,
  },
  {
    id: '2d',
    label: '2D',
    icon: <img alt="" className="h-3.5 w-3.5 object-contain" src="/icons/blueprint.png" />,
  },
  {
    id: 'split',
    label: '分屏',
    icon: <Columns2 className="h-3 w-3" />,
  },
]

function ViewModeControl() {
  const viewMode = useEditor((s) => s.viewMode)
  const setViewMode = useEditor((s) => s.setViewMode)

  return (
    <div className={TOOLBAR_CONTAINER}>
      {VIEW_MODES.map((mode) => {
        const isActive = viewMode === mode.id
        return (
          <button
            className={cn(
              'flex items-center justify-center gap-1.5 px-2.5 font-medium text-xs transition-colors',
              isActive
                ? 'bg-white/10 text-foreground'
                : 'text-muted-foreground/70 hover:bg-white/8 hover:text-muted-foreground',
            )}
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            type="button"
          >
            {mode.icon}
            <span>{mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Collapse sidebar button ─────────────────────────────────────────────────

function CollapseSidebarButton() {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)
  const setIsCollapsed = useSidebarStore((s) => s.setIsCollapsed)

  const toggle = useCallback(() => {
    setIsCollapsed(!isCollapsed)
  }, [isCollapsed, setIsCollapsed])

  return (
    <div className={TOOLBAR_CONTAINER}>
      <button
        className={TOOLBAR_BTN}
        onClick={toggle}
        title={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
        type="button"
      >
        {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Right toolbar buttons ───────────────────────────────────────────────────

function WalkthroughButton() {
  const isFirstPersonMode = useEditor((s) => s.isFirstPersonMode)
  const setFirstPersonMode = useEditor((s) => s.setFirstPersonMode)

  const toggle = () => {
    setFirstPersonMode(!isFirstPersonMode)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            isFirstPersonMode && 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20',
          )}
          onClick={toggle}
          type="button"
        >
          <Footprints className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">漫游</TooltipContent>
    </Tooltip>
  )
}

function UnitToggle() {
  const unit = useViewer((s) => s.unit)
  const setUnit = useViewer((s) => s.setUnit)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={TOOLBAR_BTN}
          onClick={() => setUnit(unit === 'metric' ? 'imperial' : 'metric')}
          type="button"
        >
          <span className="font-semibold text-[10px]">{unit === 'metric' ? 'm' : 'ft'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {unit === 'metric' ? '公制 (m)' : '英制 (ft)'}
      </TooltipContent>
    </Tooltip>
  )
}

function ThemeToggle() {
  const theme = useViewer((s) => s.theme)
  const setTheme = useViewer((s) => s.setTheme)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(TOOLBAR_BTN, theme === 'dark' ? 'text-indigo-400/60' : 'text-amber-400/60')}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          type="button"
        >
          {theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{theme === 'dark' ? '暗色' : '亮色'}</TooltipContent>
    </Tooltip>
  )
}

// ── Level mode toggle ───────────────────────────────────────────────────────

const levelModeOrder = ['stacked', 'exploded', 'solo'] as const
const levelModeLabels: Record<string, string> = {
  manual: '堆叠',
  stacked: '堆叠',
  exploded: '展开',
  solo: '独立',
}

function LevelModeToggle() {
  const levelMode = useViewer((s) => s.levelMode)
  const setLevelMode = useViewer((s) => s.setLevelMode)

  const cycle = () => {
    if (levelMode === 'manual') {
      setLevelMode('stacked')
      return
    }
    const idx = levelModeOrder.indexOf(levelMode as (typeof levelModeOrder)[number])
    const next = levelModeOrder[(idx + 1) % levelModeOrder.length]
    if (next) setLevelMode(next)
  }

  const isDefault = levelMode === 'stacked' || levelMode === 'manual'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            'w-auto gap-1.5 px-2.5',
            !isDefault && 'bg-white/10 text-foreground/90',
          )}
          onClick={cycle}
          type="button"
        >
          {levelMode === 'solo' ? (
            <IconifyIcon height={14} icon="lucide:diamond" width={14} />
          ) : levelMode === 'exploded' ? (
            <IconifyIcon height={14} icon="charm:stack-pop" width={14} />
          ) : (
            <IconifyIcon height={14} icon="charm:stack-push" width={14} />
          )}
          <span className="font-medium text-xs">{levelModeLabels[levelMode] ?? 'Stack'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        楼层: {levelMode === 'manual' ? '手动' : levelModeLabels[levelMode]}
      </TooltipContent>
    </Tooltip>
  )
}

// ── Wall mode toggle ────────────────────────────────────────────────────────

const wallModeOrder = ['cutaway', 'up', 'down'] as const
const wallModeConfig: Record<string, { icon: string; label: string }> = {
  up: { icon: '/icons/room.png', label: '全高' },
  cutaway: { icon: '/icons/wallcut.png', label: '剖切' },
  down: { icon: '/icons/walllow.png', label: '低矮' },
}

function WallModeToggle() {
  const wallMode = useViewer((s) => s.wallMode)
  const setWallMode = useViewer((s) => s.setWallMode)

  const cycle = () => {
    const idx = wallModeOrder.indexOf(wallMode as (typeof wallModeOrder)[number])
    const next = wallModeOrder[(idx + 1) % wallModeOrder.length]
    if (next) setWallMode(next)
  }

  const config = wallModeConfig[wallMode] ?? wallModeConfig.cutaway!

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            'w-auto gap-1.5 px-2.5',
            wallMode !== 'cutaway'
              ? 'bg-white/10'
              : 'opacity-60 grayscale hover:opacity-100 hover:grayscale-0',
          )}
          onClick={cycle}
          type="button"
        >
          <img alt={config.label} className="h-4 w-4 object-contain" src={config.icon} />
          <span className="font-medium text-xs">{config.label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">墙体: {config.label}</TooltipContent>
    </Tooltip>
  )
}

// ── Camera mode toggle ──────────────────────────────────────────────────────

function CameraModeToggle() {
  const cameraMode = useViewer((s) => s.cameraMode)
  const setCameraMode = useViewer((s) => s.setCameraMode)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            TOOLBAR_BTN,
            cameraMode === 'orthographic' && 'bg-white/10 text-foreground/90',
          )}
          onClick={() =>
            setCameraMode(cameraMode === 'perspective' ? 'orthographic' : 'perspective')
          }
          type="button"
        >
          {cameraMode === 'perspective' ? (
            <IconifyIcon height={16} icon="icon-park-outline:perspective" width={16} />
          ) : (
            <IconifyIcon height={16} icon="vaadin:grid" width={16} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {cameraMode === 'perspective' ? '透视' : '正交'}
      </TooltipContent>
    </Tooltip>
  )
}

// ── Level alignment button ──────────────────────────────────────────────────

function useSiblingLevels(): LevelNode[] {
  const currentLevelId = useViewer((s) => s.selection.levelId)
  const selectedBuildingId = useViewer((s) => s.selection.buildingId)
  return useScene(
    useShallow((state) => {
      const buildingId =
        selectedBuildingId ??
        (Object.values(state.nodes).find((n) => n?.type === 'building') as BuildingNode | undefined)
          ?.id
      if (!buildingId) return [] as LevelNode[]
      const building = state.nodes[buildingId]
      if (!building || building.type !== 'building') return [] as LevelNode[]
      return ((building as BuildingNode).children ?? [])
        .map((id) => state.nodes[id])
        .filter((node): node is LevelNode => node?.type === 'level' && node.id !== currentLevelId)
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    }),
  )
}

function AlignmentButton() {
  const [isOpen, setIsOpen] = useState(false)
  const setReferenceLevelId = useViewer((s) => s.setReferenceLevelId)
  const isAlignmentActive = useEditor((s) => s.levelAlignment.active)
  const cancelLevelAlignment = useEditor((s) => s.cancelLevelAlignment)
  const levels = useSiblingLevels()

  // Only render when there are multiple levels
  if (levels.length === 0) return null

  const handleLevelClick = (refLevelId: LevelNode['id']) => {
    setReferenceLevelId(refLevelId)
    // Pass the current level ID so applyLevelAlignment always moves the right layer,
    // even after the viewer auto-switches to the reference level for point placement.
    const currentLevelId = useViewer.getState().selection.levelId
    useEditor.getState().startLevelAlignment(currentLevelId ?? null)
    setIsOpen(false)
  }

  const handleCancel = () => {
    const la = useEditor.getState().levelAlignment
    const aligningId = la.aligningLevelId
    cancelLevelAlignment()
    // 取消时跳回被对齐的原始层
    if (aligningId) {
      const viewerState = useViewer.getState()
      const { selection } = viewerState
      viewerState.setSelection(
        selection.buildingId
          ? { buildingId: selection.buildingId, levelId: aligningId }
          : { levelId: aligningId },
      )
    }
    setIsOpen(false)
  }

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              className={cn(
                TOOLBAR_BTN,
                'w-auto gap-1.5 px-2.5',
                isAlignmentActive
                  ? 'bg-primary/15 text-primary hover:bg-primary/20'
                  : isOpen && 'bg-white/10 text-foreground/90',
              )}
              type="button"
            >
              <Layers className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium text-xs">对齐</span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">多层底图对齐</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        className="w-52 rounded-xl border-border/45 bg-background/96 p-2 shadow-[0_14px_28px_-18px_rgba(15,23,42,0.55),0_6px_16px_-10px_rgba(15,23,42,0.2)] backdrop-blur-xl"
        side="bottom"
        sideOffset={10}
      >
        {isAlignmentActive ? (
          <div className="space-y-2">
            <p className="px-1 text-[11px] text-primary">对齐进行中…</p>
            <button
              className="flex w-full items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
              onClick={handleCancel}
              type="button"
            >
              取消对齐
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="px-1 pb-0.5 text-[11px] text-muted-foreground">
              选择参考楼层，2 点对齐当前层
            </p>
            {levels.map((lvl) => (
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
                key={lvl.id}
                onClick={() => handleLevelClick(lvl.id)}
                type="button"
              >
                <Layers className="h-3.5 w-3.5 shrink-0 opacity-50" />
                <span className="truncate">{lvl.name || `Level ${lvl.level}`}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── Preview button ──────────────────────────────────────────────────────────

function PreviewButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="flex h-8 items-center gap-1.5 rounded-xl border border-border bg-background/90 px-3 font-medium text-muted-foreground/80 text-xs shadow-2xl backdrop-blur-md transition-colors hover:bg-white/8 hover:text-foreground/90"
          onClick={() => useEditor.getState().setPreviewMode(true)}
          type="button"
        >
          <Eye className="h-3.5 w-3.5 shrink-0" />
          <span>预览</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">预览模式</TooltipContent>
    </Tooltip>
  )
}

// ── Proposal demo button ────────────────────────────────────────────────────

function ProposalDemoButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#2D7FF9] px-3.5 font-semibold text-white text-xs shadow-lg shadow-[#2D7FF9]/20 transition-all hover:bg-[#2D7FF9]/90 hover:shadow-[#2D7FF9]/30"
          href="/proposal-demo"
          rel="noopener noreferrer"
          target="_blank"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span>提案演示</span>
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom">打开客户提案演示</TooltipContent>
    </Tooltip>
  )
}

// ── Save / Load scene file ──────────────────────────────────────────────────

/** 把当前场景下载为 .json 文件，名字带日期方便归档 */
function SaveSceneButton() {
  const handleSave = useCallback(() => {
    const state = useScene.getState()
    const payload = { nodes: state.nodes, rootNodeIds: state.rootNodeIds }
    const json = JSON.stringify(payload, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const date = new Date().toISOString().slice(0, 10)
    const a = document.createElement('a')
    a.href = url
    a.download = `vilhil-scene-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className={TOOLBAR_BTN} onClick={handleSave} type="button">
          <Save className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">保存方案（下载 JSON）</TooltipContent>
    </Tooltip>
  )
}

/** 从本地 .json 文件恢复场景 */
function LoadSceneButton() {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target?.result as string)
        if (!payload?.nodes) throw new Error('Invalid scene file')
        // 写入 localStorage 然后重载，让 Pascal 走正常 loadScene 流程
        localStorage.setItem('pascal-editor-scene', JSON.stringify(payload))
        window.location.reload()
      } catch {
        alert('文件格式不对，请选择 vilhil-scene-*.json 文件')
      }
    }
    reader.readAsText(file)
    // 清空 input，允许重复选同一个文件
    e.target.value = ''
  }, [])

  return (
    <>
      <input
        accept=".json"
        className="hidden"
        onChange={handleChange}
        ref={inputRef}
        type="file"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={TOOLBAR_BTN}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">打开方案（加载 JSON）</TooltipContent>
      </Tooltip>
    </>
  )
}

// ── Composed toolbar sections ───────────────────────────────────────────────

export function ViewerToolbarLeft() {
  return (
    <>
      <CollapseSidebarButton />
      <ViewModeControl />
      <div className={TOOLBAR_CONTAINER}>
        <SaveSceneButton />
        <div className="my-1.5 w-px bg-border/50" />
        <LoadSceneButton />
      </div>
    </>
  )
}

export function ViewerToolbarRight() {
  return (
    <div className="flex items-center gap-2">
      {/* Edit-mode controls */}
      <div className={TOOLBAR_CONTAINER}>
        <LevelModeToggle />
        <WallModeToggle />
        <div className="my-1.5 w-px bg-border/50" />
        <UnitToggle />
        <ThemeToggle />
        <CameraModeToggle />
        <div className="my-1.5 w-px bg-border/50" />
        <WalkthroughButton />
        <AlignmentButton />
      </div>

      {/* Preview — standalone pill, visually distinct from edit controls */}
      <PreviewButton />

      {/* Proposal Demo — prominent branded CTA */}
      <ProposalDemoButton />
    </div>
  )
}
