'use client'

import { type ReactNode, useEffect } from 'react'
import { CommandPalette } from './../../../components/ui/command-palette'
import { EditorCommands } from './../../../components/ui/command-palette/editor-commands'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebarStore,
} from './../../../components/ui/primitives/sidebar'
import { cn } from './../../../lib/utils'
import useEditor from './../../../store/use-editor'
import { IconRail, PANEL_ENTRIES, normalizePanelId, type ExtraPanel } from './icon-rail'
import { BuildingPanel, type BuildingPanelProps } from './panels/building-panel'
import { ComingSoonPanel } from './panels/coming-soon-panel'
import { DevicePanel } from './panels/device-panel'
import { SettingsPanel, type SettingsPanelProps } from './panels/settings-panel'
import { TopologyPanel } from './panels/topology-panel'

interface AppSidebarProps {
  appMenuButton?: ReactNode
  sidebarTop?: ReactNode
  settingsPanelProps?: SettingsPanelProps
  sitePanelProps?: BuildingPanelProps
  extraPanels?: ExtraPanel[]
}

export function AppSidebar({
  appMenuButton: _appMenuButton,
  sidebarTop,
  settingsPanelProps,
  sitePanelProps,
}: AppSidebarProps) {
  const rawActive = useEditor((s) => s.activeSidebarPanel)
  const activePanel = normalizePanelId(rawActive)

  useEffect(() => {
    const store = useSidebarStore.getState()
    if (store.width <= 288) {
      store.setWidth(432)
    }
  }, [])

  const renderPanelContent = () => {
    switch (activePanel) {
      case 'device':
        return <DevicePanel />
      case 'building':
        return <BuildingPanel {...sitePanelProps} />
      case 'settings':
        return <SettingsPanel {...settingsPanelProps} />
      case 'topology':
        return <TopologyPanel />
      case 'scene':
      case 'share':
      case 'review': {
        const entry = PANEL_ENTRIES.find((e) => e.id === activePanel)
        return <ComingSoonPanel label={entry?.label ?? activePanel} />
      }
      default:
        return <BuildingPanel {...sitePanelProps} />
    }
  }

  return (
    <>
      <Sidebar className={cn('text-sidebar-foreground')} variant="floating">
        <div className="flex h-full">
          <IconRail className="shrink-0" />

          <div className="flex flex-1 flex-col overflow-hidden">
            {sidebarTop && (
              <SidebarHeader className="relative flex-col items-start justify-center gap-1 border-border/50 border-b px-3 py-3">
                {sidebarTop}
              </SidebarHeader>
            )}

            <SidebarContent className={cn('no-scrollbar flex flex-1 flex-col overflow-hidden')}>
              {renderPanelContent()}
            </SidebarContent>
          </div>
        </div>
      </Sidebar>
      <EditorCommands />
      <CommandPalette />
    </>
  )
}
