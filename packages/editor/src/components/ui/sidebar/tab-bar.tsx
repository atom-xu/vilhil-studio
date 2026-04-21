'use client'

import { cn } from './../../../lib/utils'
import { Button } from '../primitives/button'

export type SidebarTab = {
  id: string
  label: string
}

interface TabBarProps {
  tabs: SidebarTab[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-border/50 border-b px-2">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <Button variant="ghost"
            className={cn(
              'relative h-7 rounded-md px-3 font-medium text-sm transition-colors',
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </Button>
        )
      })}
    </div>
  )
}
