'use client'

import { ChevronLeft, RotateCcw, X } from 'lucide-react'
import Image from 'next/image'
import { cn } from '../../../lib/utils'
import { Button } from '../primitives/button'

interface PanelWrapperProps {
  title: string
  icon?: string
  onClose?: () => void
  onReset?: () => void
  onBack?: () => void
  children: React.ReactNode
  className?: string
  width?: number | string
}

export function PanelWrapper({
  title,
  icon,
  onClose,
  onReset,
  onBack,
  children,
  className,
  width = 320, // default width
}: PanelWrapperProps) {
  return (
    <div
      className={cn(
        'pointer-events-auto fixed top-20 right-4 z-50 flex max-h-[calc(100dvh-100px)] flex-col overflow-hidden rounded-xl border border-border/50 bg-sidebar/95 shadow-2xl backdrop-blur-xl dark:text-foreground',
        className,
      )}
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-border/50 border-b px-3 py-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost"
              className="mr-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onBack}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          {icon && (
            <Image alt="" className="shrink-0 object-contain" height={16} src={icon} width={16} />
          )}
          <h2 className="truncate font-semibold text-foreground text-sm tracking-tight">{title}</h2>
        </div>

        <div className="flex items-center gap-1">
          {onReset && (
            <Button variant="ghost"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onReset}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          {onClose && (
            <Button variant="ghost"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
