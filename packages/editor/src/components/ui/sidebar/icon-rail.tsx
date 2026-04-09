'use client'

import { useViewer } from '@pascal-app/viewer'
import { Moon, Sparkles, Sun } from 'lucide-react'
import { motion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './../../../components/ui/primitives/tooltip'
import { cn } from './../../../lib/utils'

export type PanelId = 'site' | 'settings' | 'scenes'

/** 外部注入的额外面板（供 Editor 消费者扩展侧边栏使用） */
export type ExtraPanel = {
  id: string
  label: string
  component: React.ComponentType
}

interface IconRailProps {
  activePanel: PanelId
  onPanelChange: (panel: PanelId) => void
  appMenuButton?: ReactNode
  className?: string
}

type PanelEntry =
  | { id: PanelId; iconSrc: string; label: string; icon?: never }
  | { id: PanelId; icon: ReactNode; label: string; iconSrc?: never }

const panels: PanelEntry[] = [
  { id: 'site', iconSrc: '/icons/level.png', label: '项目' },
  { id: 'scenes', icon: <Sparkles className="h-5 w-5" />, label: '场景' },
  { id: 'settings', iconSrc: '/icons/settings.png', label: '设置' },
]

export function IconRail({ activePanel, onPanelChange, appMenuButton, className }: IconRailProps) {
  const theme = useViewer((state) => state.theme)
  const setTheme = useViewer((state) => state.setTheme)
  const unit = useViewer((state) => state.unit)
  const setUnit = useViewer((state) => state.setUnit)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      className={cn(
        'flex h-full w-11 flex-col items-center gap-1 border-border/50 border-r py-2',
        className,
      )}
    >
      {/* App menu slot */}
      {appMenuButton}

      {/* Divider */}
      <div className="mb-1 h-px w-8 bg-border/50" />

      {panels.map((panel) => {
        const isActive = activePanel === panel.id
        return (
          <Tooltip key={panel.id}>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                  isActive ? 'bg-accent' : 'hover:bg-accent',
                )}
                onClick={() => onPanelChange(panel.id)}
                type="button"
              >
                {panel.icon ? (
                  <span
                    className={cn(
                      'transition-all',
                      isActive ? 'text-foreground' : 'text-muted-foreground/60',
                    )}
                  >
                    {panel.icon}
                  </span>
                ) : (
                  <img
                    alt={panel.label}
                    className={cn(
                      'h-6 w-6 object-contain transition-all',
                      !isActive && 'opacity-50 saturate-0',
                    )}
                    src={panel.iconSrc}
                  />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{panel.label}</TooltipContent>
          </Tooltip>
        )
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Unit Toggle */}
      {mounted && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-accent/40 text-foreground transition-all hover:bg-accent"
              onClick={() => setUnit(unit === 'metric' ? 'imperial' : 'metric')}
              type="button"
            >
              <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 font-medium text-[10px] leading-none">
                {unit === 'metric' ? 'm' : 'ft'}
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">切换单位 (公制/英制)</TooltipContent>
        </Tooltip>
      )}

      {/* Theme Toggle */}
      {mounted && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 bg-accent/40 text-foreground transition-all hover:bg-accent"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              type="button"
            >
              <motion.div
                animate={{ rotate: 0, opacity: 1 }}
                initial={{ rotate: -90, opacity: 0 }}
                key={theme}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">切换主题</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

export { panels }
