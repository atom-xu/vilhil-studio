'use client'

import type * as React from 'react'
import { cn } from '../../../lib/utils'
import { ActionButtonBase } from '../primitives/action-button-base'

interface ActionButtonProps extends React.ComponentProps<typeof ActionButtonBase> {
  icon?: React.ReactNode
  label: string
}

export function ActionButton({ icon, label, className, ...props }: ActionButtonProps) {
  return (
    <ActionButtonBase
      {...props}
      className={cn(
        'vh-btn-secondary h-9 flex-1 gap-1.5 px-3 text-xs',
        className,
      )}
      label={label}
      size="sm"
      tooltipDisabled
      variant="outline"
    >
      {icon}
      <span>{label}</span>
    </ActionButtonBase>
  )
}

export function ActionGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('flex gap-1.5', className)}>{children}</div>
}
