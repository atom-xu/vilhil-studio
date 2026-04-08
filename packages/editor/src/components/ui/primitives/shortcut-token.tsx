import { Icon } from '@iconify/react'
import type * as React from 'react'

import { cn } from '../../../lib/utils'

const MOUSE_SHORTCUTS = {
  Click: {
    icon: 'ph:mouse-left-click-fill',
    label: '左键点击',
  },
  'Left click': {
    icon: 'ph:mouse-left-click-fill',
    label: '左键点击',
  },
  'Middle click': {
    icon: 'qlementine-icons:mouse-middle-button-16',
    label: '中键点击',
  },
  'Right click': {
    icon: 'ph:mouse-right-click-fill',
    label: '右键点击',
  },
} as const

type ShortcutTokenProps = React.ComponentProps<'kbd'> & {
  value: string
  displayValue?: string
}

function ShortcutToken({ className, displayValue, value, ...props }: ShortcutTokenProps) {
  const mouseShortcut =
    value in MOUSE_SHORTCUTS ? MOUSE_SHORTCUTS[value as keyof typeof MOUSE_SHORTCUTS] : null

  return (
    <kbd
      aria-label={mouseShortcut?.label ?? displayValue ?? value}
      className={cn(
        'inline-flex h-6 items-center rounded border border-border bg-muted px-2 font-medium font-mono text-[11px] text-muted-foreground',
        mouseShortcut && 'justify-center px-1.5',
        className,
      )}
      title={mouseShortcut?.label ?? value}
      {...props}
    >
      {mouseShortcut ? (
        <>
          <Icon
            aria-hidden="true"
            className="shrink-0"
            color="currentColor"
            height={14}
            icon={mouseShortcut.icon}
            width={14}
          />
          <span className="sr-only">{mouseShortcut.label}</span>
        </>
      ) : (
        (displayValue ?? value)
      )}
    </kbd>
  )
}

export { ShortcutToken }
