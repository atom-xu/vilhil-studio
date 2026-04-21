'use client'

/**
 * ComingSoonPanel — 即将上线面板占位
 *
 * 用于拓扑/分享/查看等尚未实现的功能入口。
 */

import { Construction } from 'lucide-react'

interface ComingSoonPanelProps {
  label: string
  description?: string
}

export function ComingSoonPanel({ label, description }: ComingSoonPanelProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/50">
        <Construction className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <div>
        <p className="font-semibold text-foreground text-sm">{label}</p>
        <p className="mt-1 text-muted-foreground text-xs">
          {description ?? '该功能正在开发中，即将上线'}
        </p>
      </div>
    </div>
  )
}
