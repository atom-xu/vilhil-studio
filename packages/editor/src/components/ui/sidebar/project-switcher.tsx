'use client'

/**
 * ProjectSwitcher — Home 按钮 + 项目切换下拉
 *
 * S1 阶段：占位实现，显示当前项目名，下拉菜单中提示"项目管理即将上线"。
 * S5 阶段：接入真实项目列表、新建项目、权限管理。
 */

import { useScene } from '@pascal-app/core'
import {
  FolderOpen,
  Home,
  Plus,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '../primitives/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './../../../components/ui/primitives/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './../../../components/ui/primitives/tooltip'
import { cn } from './../../../lib/utils'

export function ProjectSwitcher() {
  const [open, setOpen] = useState(false)

  // 从 scene store 读取项目名（site 节点的 name 字段）
  const siteName = useScene((s: any) => {
    const nodes = Object.values(s.nodes ?? {}) as any[]
    const site = nodes.find((n: any) => n?.type === 'site')
    return (site?.name as string | undefined) ?? '未命名项目'
  })

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost"
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                open
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground/60 hover:bg-accent hover:text-foreground',
              )}
              type="button"
            >
              <Home size={16} strokeWidth={1.5} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">项目切换</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="start"
        className="w-56 p-1"
        side="right"
        sideOffset={8}
      >
        {/* 当前项目 */}
        <div className="flex items-center gap-2 rounded-md bg-accent/50 px-2.5 py-2">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/20 text-primary">
            <Home size={11} />
          </div>
          <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
            {siteName}
          </span>
          <span className="shrink-0 text-[10px] text-primary">当前</span>
        </div>

        <div className="my-1 h-px bg-border/50" />

        {/* 占位提示 */}
        <div className="px-2.5 py-3 text-center text-muted-foreground text-xs">
          项目管理即将上线
        </div>

        <div className="my-1 h-px bg-border/50" />

        {/* 新建 / 管理 — 占位按钮 */}
        <Button variant="ghost"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
          disabled
          type="button"
        >
          <Plus size={14} />
          新建项目
        </Button>
        <Button variant="ghost"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground"
          disabled
          type="button"
        >
          <FolderOpen size={14} />
          管理项目
        </Button>
      </PopoverContent>
    </Popover>
  )
}
