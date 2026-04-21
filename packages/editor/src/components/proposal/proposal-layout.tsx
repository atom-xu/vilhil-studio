'use client'

import type { AnyNodeId, BuildingNode, LevelNode } from '@pascal-app/core'
import { emitter, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useDeviceState } from '@vilhil/smarthome'
import { ArrowLeft, ChevronRight, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useDeviceInteraction } from '../../hooks/use-device-interaction'
import { cn } from '../../lib/utils'
import { Button } from '../ui/primitives/button'
import { CameraInfoCard } from './camera-info-card'
import { DeviceInfoCard } from './device-info-card'
import { QuotePanel } from './quote-panel'
import { SceneBar } from './scene-bar'
import { SubsystemBar } from './subsystem-bar'

interface ProposalLayoutProps {
  children: React.ReactNode
  projectName?: string
  onBack?: () => void
  className?: string
}

/**
 * 提案模式布局
 * 只读模式，用于客户展示
 */
export function ProposalLayout({
  children,
  projectName = '项目',
  onBack,
  className,
}: ProposalLayoutProps) {
  const [showQuote, setShowQuote] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)

  const selection = useViewer(useShallow((s: any) => s.selection))
  const hoveredId = useViewer((s: any) => s.hoveredId)
  const nodes = useScene(useShallow((s: any) => s.nodes))

  const building = selection.buildingId
    ? (nodes[selection.buildingId] as BuildingNode | undefined)
    : null
  const level = selection.levelId
    ? (nodes[selection.levelId] as LevelNode | undefined)
    : null

  // Use hovered device if no explicit selection, or use selected from viewer
  const effectiveDeviceId = selectedDeviceId || hoveredId || selection.selectedIds?.[0]
  const selectedDevice = effectiveDeviceId
    ? (nodes[effectiveDeviceId as AnyNodeId] as any | undefined)
    : null

  // Camera item detection — ItemNode with security tag
  const selectedItemId = selection.selectedIds?.[0]
  const selectedItem = selectedItemId ? (nodes[selectedItemId as AnyNodeId] as any) : null
  const isCameraItem =
    selectedItem?.type === 'item' && selectedItem?.asset?.tags?.includes('security')

  // 子系统聚焦 → 推荐视角
  const selectedSubsystem = useDeviceState((s) => s.selectedSubsystem)
  useEffect(() => {
    if (!selectedSubsystem) return

    // 收集该子系统所有节点的位置
    const sceneNodes = useScene.getState().nodes
    const positions: [number, number, number][] = []
    for (const n of Object.values(sceneNodes)) {
      const pos = (n as any).position as [number, number, number] | undefined
      if (!pos) continue
      if (n.type === 'device' && (n as any).subsystem === selectedSubsystem) {
        positions.push(pos)
      }
      if (n.type === 'item' && (n as any).asset?.tags?.includes(selectedSubsystem)) {
        positions.push(pos)
      }
    }
    if (positions.length === 0) return

    // 计算质心
    const cx = positions.reduce((s, p) => s + p[0], 0) / positions.length
    const cy = positions.reduce((s, p) => s + p[1], 0) / positions.length
    const cz = positions.reduce((s, p) => s + p[2], 0) / positions.length

    // 计算分布半径 → 确定观察距离
    const spread = Math.max(
      5,
      ...positions.map((p) => Math.sqrt((p[0] - cx) ** 2 + (p[2] - cz) ** 2)),
    )
    const d = Math.min(spread * 2.8, 40)

    requestAnimationFrame(() => {
      emitter.emit('camera-controls:fly-to', {
        position: [cx + d * 0.65, cy + d * 0.55, cz + d * 0.75],
        target: [cx, cy, cz],
      })
    })
  }, [selectedSubsystem])

  // L2 展示模式：点击设备 → 翻转开关
  useDeviceInteraction({ editMode: false })

  // 展示模式下仍需要同步 selectedDeviceId，用于 DeviceInfoCard 展示
  useEffect(() => {
    const handleDeviceClick = (event: any) => {
      if (event.node?.type === 'device') {
        setSelectedDeviceId(event.node.id)
      }
    }
    emitter.on('device:click', handleDeviceClick)
    return () => emitter.off('device:click', handleDeviceClick)
  }, [])

  return (
    <div className={cn('relative h-full w-full', className)}>
      {/* 3D Scene */}
      <div className="h-full w-full">{children}</div>

      {/* Top Bar - Project Info */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
        {/* Back Button + Project Name */}
        <div className="vh-panel flex items-center gap-3 px-4 py-2">
          {onBack && (
            <Button
              onClick={onBack}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="font-semibold text-foreground">{projectName}</h1>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <span>场地</span>
              {building && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span>{building.name || '建筑'}</span>
                </>
              )}
              {level && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span>{level.name || `楼层 ${level.level}`}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quote Button */}
        <Button
          className={cn(
            'vh-btn-secondary h-10 w-10 border-border/40 shadow-lg backdrop-blur-xl transition-all duration-200',
            showQuote && 'bg-accent/50',
            'hover:bg-accent/30',
          )}
          onClick={() => setShowQuote(!showQuote)}
          size="icon"
          type="button"
          variant="outline"
        >
          <FileText className="h-5 w-5" />
        </Button>
      </div>

      {/* Left Side - Subsystem Bar */}
      <div className="absolute top-1/2 left-4 z-20 -translate-y-1/2">
        <SubsystemBar />
      </div>

      {/* Bottom - Scene Bar */}
      <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
        <SceneBar />
      </div>

      {/* Right Side - Camera Info Card (security ItemNode) */}
      {isCameraItem && (
        <div className="absolute top-20 right-4 z-20">
          <CameraInfoCard node={selectedItem} />
        </div>
      )}

      {/* Right Side - Device Info Card (DeviceNode) */}
      {!isCameraItem && selectedDevice?.type === 'device' && (
        <div className="absolute top-20 right-4 z-20">
          <DeviceInfoCard device={selectedDevice} />
        </div>
      )}

      {/* Right Side - Quote Panel */}
      <QuotePanel isOpen={showQuote} onClose={() => setShowQuote(false)} />
    </div>
  )
}
