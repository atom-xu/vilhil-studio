'use client'

import * as React from 'react'
import { cn } from '../../../lib/utils'
import { Button } from './button'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

interface ActionButtonBaseProps extends React.ComponentProps<typeof Button> {
  label: string
  shortcut?: string
  tooltipContent?: React.ReactNode
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
  tooltipDisabled?: boolean
}

export const ActionButtonBase = React.forwardRef<HTMLButtonElement, ActionButtonBaseProps>(
  (
    {
      className,
      children,
      label,
      shortcut,
      tooltipContent,
      tooltipSide,
      tooltipDisabled = false,
      ...props
    },
    ref,
  ) => {
    const content = (
      <Button className={className} ref={ref} {...props}>
        {children}
        {shortcut && (
          <div className="absolute right-1 bottom-1 rounded border border-border/40 bg-background/40 px-1 py-[2px] backdrop-blur-md">
            <span className="block font-medium font-mono text-[9px] text-muted-foreground/70 leading-none">
              {shortcut}
            </span>
          </div>
        )}
      </Button>
    )

    if (tooltipDisabled) return content

    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side={tooltipSide}>
          {tooltipContent || (
            <p className={cn('leading-none')}>
              {label} {shortcut && `(${shortcut})`}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    )
  },
)

ActionButtonBase.displayName = 'ActionButtonBase'
