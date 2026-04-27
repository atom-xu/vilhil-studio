'use client'

import { CheckCircle, Info, XCircle } from 'lucide-react'
import { useToastItems } from '@/lib/toast'

export function Toaster() {
  const items = useToastItems()
  if (items.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium shadow-xl ${
            item.type === 'success'
              ? 'bg-primary text-primary-foreground'
              : item.type === 'error'
                ? 'bg-destructive text-white'
                : 'bg-foreground text-background'
          }`}
        >
          {item.type === 'success' && <CheckCircle className="h-4 w-4 shrink-0" />}
          {item.type === 'error' && <XCircle className="h-4 w-4 shrink-0" />}
          {item.type === 'info' && <Info className="h-4 w-4 shrink-0" />}
          {item.message}
        </div>
      ))}
    </div>
  )
}
