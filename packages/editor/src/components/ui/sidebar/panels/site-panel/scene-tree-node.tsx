'use client'

import type { SceneNodeType } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { deleteScene } from '@vilhil/smarthome'
import { Sparkles, Trash2 } from 'lucide-react'
import { focusTreeNode, handleTreeSelection, TreeNodeWrapper } from './tree-node'

interface SceneTreeNodeProps {
  node: SceneNodeType
  depth: number
  isLast?: boolean
}

export function SceneTreeNode({ node, depth, isLast }: SceneTreeNodeProps) {
  const selectedIds = useViewer((state: any) => state.selection.selectedIds)
  const isSelected = selectedIds.includes(node.id)
  const isHovered = useViewer((state: any) => state.hoveredId === node.id)
  const setSelection = useViewer((state: any) => state.setSelection)
  const setHoveredId = useViewer((state: any) => state.setHoveredId)

  const effectCount = node.effects?.length ?? 0

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    handleTreeSelection(e, node.id, selectedIds, setSelection)
  }

  const handleDoubleClick = () => {
    focusTreeNode(node.id)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    deleteScene(node.id)
    if (selectedIds.includes(node.id)) {
      setSelection({ selectedIds: [] })
    }
  }

  return (
    <TreeNodeWrapper
      actions={
        <button
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-400"
          onClick={handleDelete}
          title="删除场景"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      }
      depth={depth}
      expanded={false}
      hasChildren={false}
      icon={
        <Sparkles className="h-3.5 w-3.5 text-violet-400" />
      }
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      isVisible={true}
      label={
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm">
          {node.icon && <span className="shrink-0 text-xs leading-none">{node.icon}</span>}
          <span className="truncate">{node.name}</span>
          {effectCount > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-accent px-1 text-[9px] tabular-nums text-muted-foreground">
              {effectCount}
            </span>
          )}
        </span>
      }
      nodeId={node.id}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setHoveredId(node.id)}
      onMouseLeave={() => setHoveredId(null)}
      onToggle={() => {}}
    />
  )
}
