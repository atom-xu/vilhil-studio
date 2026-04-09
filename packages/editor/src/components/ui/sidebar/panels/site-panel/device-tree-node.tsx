'use client'

import type { DeviceNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { SUBSYSTEM_META } from '@vilhil/smarthome'
import { Cpu } from 'lucide-react'
import useEditor from './../../../../../store/use-editor'
import { focusTreeNode, handleTreeSelection, TreeNodeWrapper } from './tree-node'
import { TreeNodeActions } from './tree-node-actions'

interface DeviceTreeNodeProps {
  node: DeviceNode
  depth: number
  isLast?: boolean
}

export function DeviceTreeNode({ node, depth, isLast }: DeviceTreeNodeProps) {
  const selectedIds = useViewer((state) => state.selection.selectedIds)
  const isSelected = selectedIds.includes(node.id)
  const isHovered = useViewer((state) => state.hoveredId === node.id)
  const setSelection = useViewer((state) => state.setSelection)
  const setHoveredId = useViewer((state) => state.setHoveredId)

  const meta = SUBSYSTEM_META[node.subsystem]
  const subsystemColor = meta?.color ?? '#6b7280'
  const displayName = node.productName || meta?.label || '智能设备'

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const handled = handleTreeSelection(e, node.id, selectedIds, setSelection)
    if (!handled && useEditor.getState().phase !== 'furnish') {
      useEditor.getState().setPhase('furnish')
    }
  }

  const handleDoubleClick = () => {
    focusTreeNode(node.id)
  }

  return (
    <TreeNodeWrapper
      actions={<TreeNodeActions node={node} />}
      depth={depth}
      expanded={false}
      hasChildren={false}
      icon={
        <div
          className="h-3.5 w-3.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: subsystemColor }}
        />
      }
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      isVisible={node.visible !== false}
      label={<span className="truncate text-sm">{displayName}</span>}
      nodeId={node.id}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHoveredId(node.id)}
      onMouseLeave={() => setHoveredId(null)}
      onToggle={() => {}}
    />
  )
}
