import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '../../../lib/utils'

const buttonVariants = cva(
  "vh-btn shrink-0 whitespace-nowrap font-barlow outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring)] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'vh-btn-primary',
        destructive:
          'vh-btn bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        outline:
          'vh-btn-secondary dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'vh-btn bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'vh-btn-ghost dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-4 py-2 has-[>svg]:px-3',
        sm: 'gap-1.5 px-3 text-xs has-[>svg]:px-2.5',
        lg: 'px-6 text-base has-[>svg]:px-4',
        icon: 'size-9 min-h-0',
        'icon-sm': 'size-8 min-h-0',
        'icon-lg': 'size-10 min-h-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  if (asChild) {
    return (
      <Slot
        className={cn(buttonVariants({ variant, size, className }))}
        data-slot="button"
        ref={ref as never}
        {...props}
      />
    )
  }

  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      data-slot="button"
      ref={ref}
      {...props}
    />
  )
}

export { Button, buttonVariants }
