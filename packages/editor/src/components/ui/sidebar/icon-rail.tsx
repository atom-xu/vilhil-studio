'use client'

import { useViewer } from '@pascal-app/viewer'
import {
  Building2,
  ClipboardList,
  Moon,
  Network,
  Package,
  Settings,
  Share2,
  Sun,
} from 'lucide-react'
import { motion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import { Button } from '../primitives/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './../../../components/ui/primitives/tooltip'
import { cn } from './../../../lib/utils'
import useEditor from './../../../store/use-editor'
import { ProjectSwitcher } from './project-switcher'

// ─── 类型 ──────────────────────────────────────────────────────────────────────

export type PanelId =
  | 'device'
  | 'building'
  | 'topology'
  | 'scene'
  | 'share'
  | 'review'
  | 'settings'
  // 兼容旧值
  | 'site'
  | 'scenes'

/** 外部注入的额外面板（供 Editor 消费者扩展侧边栏使用） */
export type ExtraPanel = {
  id: string
  label: string
  component: React.ComponentType
}

interface IconRailProps {
  className?: string
}

// ─── 旧 ID 规范化 ──────────────────────────────────────────────────────────────

/** 将旧版 panel id 映射到新版 */
export function normalizePanelId(id: string): PanelId {
  if (id === 'site') return 'building'
  if (id === 'scenes') return 'scene'
  return id as PanelId
}

// ─── 面板入口定义 ───────────────────────────────────────────────────────────────

interface PanelEntry {
  id: PanelId
  label: string
  icon: ReactNode
  /** true = 功能已上线；false = 占位灰色 */
  enabled: boolean
}

const PANEL_ENTRIES: PanelEntry[] = [
  { id: 'device',   label: '设备',   icon: <Package      size={16} strokeWidth={1.5} />, enabled: true  },
  { id: 'building', label: '建筑',   icon: <Building2    size={16} strokeWidth={1.5} />, enabled: true  },
  { id: 'topology', label: '拓扑',   icon: <Network      size={16} strokeWidth={1.5} />, enabled: true  },
  { id: 'share',    label: '分享',   icon: <Share2       size={16} strokeWidth={1.5} />, enabled: false },
  { id: 'review',   label: '查看',   icon: <ClipboardList size={16} strokeWidth={1.5} />, enabled: false },
]

// ─── IconRail ─────────────────────────────────────────────────────────────────

export function IconRail({ className }: IconRailProps) {
  const theme = useViewer((state) => state.theme)
  const setTheme = useViewer((state) => state.setTheme)
  const unit = useViewer((state) => state.unit)
  const setUnit = useViewer((state) => state.setUnit)
  const [mounted, setMounted] = useState(false)

  const rawActive = useEditor((s) => s.activeSidebarPanel)
  const setActivePanel = useEditor((s) => s.setActiveSidebarPanel)
  const activePanel = normalizePanelId(rawActive)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      className={cn(
        'flex h-full w-11 flex-col items-center gap-1 border-sidebar-border/70 border-r py-2',
        className,
      )}
    >
      {/* Home — 项目切换 */}
      <ProjectSwitcher />

      {/* Divider */}
      <div className="mb-1 h-px w-8 bg-sidebar-border/70" />

      {/* 6 个功能入口 */}
      {PANEL_ENTRIES.map((entry) => {
        const isActive = activePanel === entry.id

        if (!entry.enabled) {
          return (
            <Tooltip key={entry.id}>
              <TooltipTrigger asChild>
                <Button variant="ghost"
                  className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-lg text-sidebar-foreground/25 transition-colors"
                  onClick={() => {}}
                  type="button"
                >
                  {entry.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {entry.label} — 即将上线
              </TooltipContent>
            </Tooltip>
          )
        }

        return (
          <Tooltip key={entry.id}>
            <TooltipTrigger asChild>
              <Button variant="ghost"
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                  isActive
                    ? 'bg-sidebar-primary/12 text-sidebar-primary'
                    : 'text-sidebar-foreground/58 hover:bg-sidebar-accent hover:text-sidebar-primary',
                )}
                onClick={() => setActivePanel(entry.id)}
                type="button"
              >
                {entry.icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{entry.label}</TooltipContent>
          </Tooltip>
        )
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* 设置 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost"
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
              activePanel === 'settings'
                ? 'bg-sidebar-primary/12 text-sidebar-primary'
                : 'text-sidebar-foreground/58 hover:bg-sidebar-accent hover:text-sidebar-primary',
            )}
            onClick={() => setActivePanel('settings')}
            type="button"
          >
            <Settings size={16} strokeWidth={1.5} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">设置</TooltipContent>
      </Tooltip>

      {/* Unit Toggle */}
      {mounted && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost"
              className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border/75 bg-sidebar-accent/75 text-sidebar-primary transition-all hover:bg-sidebar-accent"
              onClick={() => setUnit(unit === 'metric' ? 'imperial' : 'metric')}
              type="button"
            >
              <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 font-medium text-[10px] leading-none">
                {unit === 'metric' ? 'm' : 'ft'}
              </div>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">切换单位 (公制/英制)</TooltipContent>
        </Tooltip>
      )}

      {/* Theme Toggle */}
      {mounted && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost"
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border/75 bg-sidebar-accent/75 text-sidebar-primary transition-all hover:bg-sidebar-accent"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              type="button"
            >
              <motion.div
                animate={{ rotate: 0, opacity: 1 }}
                initial={{ rotate: -90, opacity: 0 }}
                key={theme}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                {theme === 'dark'
                  ? <Sun size={15} strokeWidth={1.5} />
                  : <Moon size={15} strokeWidth={1.5} />}
              </motion.div>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">切换主题</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

export { PANEL_ENTRIES }
