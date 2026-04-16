'use client'

import { type AnyNodeId, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import useEditor from '../../../store/use-editor'
import { CeilingPanel } from './ceiling-panel'
import { DevicePanel } from './device-panel'
import { DoorPanel } from './door-panel'
import { ItemPanel } from './item-panel'
import { ReferencePanel } from './reference-panel'
import { RoofPanel } from './roof-panel'
import { RoofSegmentPanel } from './roof-segment-panel'
import { SlabPanel } from './slab-panel'
import { StairPanel } from './stair-panel'
import { StairSegmentPanel } from './stair-segment-panel'
import { WallPanel } from './wall-panel'
import { WindowPanel } from './window-panel'
// 场景节点属性面板（选中场景节点时显示）
import { SceneNodePanel } from './scene-node-panel'

export function PanelManager() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const selectedReferenceId = useEditor((s) => s.selectedReferenceId)
  const nodes = useScene((s) => s.nodes)

  // Show reference panel if a reference is selected
  if (selectedReferenceId) {
    return <ReferencePanel />
  }

  // 多选：如果全部是墙，显示 WallPanel（支持批量改种类 + 批量删除）
  if (selectedIds.length > 1) {
    const allAreWalls = selectedIds.every((id) => nodes[id as AnyNodeId]?.type === 'wall')
    if (allAreWalls) return <WallPanel />
  }

  // Show appropriate panel based on selected node type
  if (selectedIds.length === 1) {
    const selectedNode = selectedIds[0]
    const node = nodes[selectedNode as AnyNodeId]
    if (node) {
      switch (node.type) {
        case 'device':
          return <DevicePanel />
        case 'scene':
          return <SceneNodePanel sceneId={node.id} />
        case 'item':
          return <ItemPanel />
        case 'roof':
          return <RoofPanel />
        case 'roof-segment':
          return <RoofSegmentPanel />
        case 'slab':
          return <SlabPanel />
        case 'stair':
          return <StairPanel />
        case 'stair-segment':
          return <StairSegmentPanel />
        case 'ceiling':
          return <CeilingPanel />
        case 'wall':
          return <WallPanel />
        case 'door':
          return <DoorPanel />
        case 'window':
          return <WindowPanel />
      }
    }
  }

  return null
}
