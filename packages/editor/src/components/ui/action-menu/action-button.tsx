import * as React from 'react'
import { ActionButtonBase } from './../../../components/ui/primitives/action-button-base'
import { cn } from './../../../lib/utils'

interface ActionButtonProps extends React.ComponentProps<typeof ActionButtonBase> {
  label: string
  shortcut?: string
  isActive?: boolean
  tooltipContent?: React.ReactNode
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    { className, children, label, shortcut, isActive, tooltipContent, tooltipSide, ...props },
    ref,
  ) => {
    return (
      <ActionButtonBase
        className={cn('relative h-11 w-11 transition-all', className)}
        label={label}
        ref={ref}
        shortcut={shortcut}
        tooltipContent={tooltipContent}
        tooltipSide={tooltipSide}
        {...props}
      >
        <div
          className={cn(
            'flex h-full w-full items-center justify-center transition-transform',
            shortcut && '-translate-x-0.5 -translate-y-0.5',
          )}
        >
          {children}
        </div>
      </ActionButtonBase>
    )
  },
)
ActionButton.displayName = 'ActionButton'
