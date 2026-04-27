import { type BuildingNode, type LevelNode as LevelNodeT, LevelNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Building2, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../../primitives/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './../../../../../components/ui/primitives/tooltip'
import { focusTreeNode, TreeNode, TreeNodeWrapper } from './tree-node'
import { TreeNodeActions } from './tree-node-actions'

interface BuildingTreeNodeProps {
  node: BuildingNode
  depth: number
  isLast?: boolean
}

export function BuildingTreeNode({ node, depth, isLast }: BuildingTreeNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const createNode = useScene((state) => state.createNode)
  const isSelected = useViewer((state) => state.selection.buildingId === node.id)
  const isHovered = useViewer((state) => state.hoveredId === node.id)
  const setSelection = useViewer((state) => state.setSelection)

  const handleClick = () => {
    setSelection({ buildingId: node.id })
  }

  const nodes = useScene((state) => state.nodes)

  // 楼层子节点按 `level` 倒序（高楼层在上）—— 和 FloatingLevelSelector 对齐。
  // 非楼层子节点（scan 等）保持原插入顺序、拼在楼层后面。
  type ChildId = (typeof node.children)[number]
  const sortedChildren = (() => {
    const levelChildren: { id: ChildId; level: number }[] = []
    const others: ChildId[] = []
    for (const childId of node.children) {
      const child = nodes[childId]
      if (child?.type === 'level') {
        levelChildren.push({ id: childId, level: (child as LevelNodeT).level })
      } else {
        others.push(childId)
      }
    }
    levelChildren.sort((a, b) => b.level - a.level)
    return [...levelChildren.map((x) => x.id), ...others]
  })()

  const handleAddLevel = (e: React.MouseEvent) => {
    e.stopPropagation()
    // 新楼层的 level 值 = 现有所有楼层里最大的 level + 1
    // 不能用 children.length —— 如果中间删过一层再加回来，会和残留的 level 冲突，
    // 导致排序歧义（两个 level 值相同时 sort 不稳定，FloatingLevelSelector 交换顺序失效）。
    let maxLevel = -1
    for (const childId of node.children) {
      const child = nodes[childId]
      if (child?.type === 'level') {
        maxLevel = Math.max(maxLevel, (child as LevelNodeT).level)
      }
    }
    const newLevel = LevelNode.parse({
      level: maxLevel + 1,
      children: [],
      parentId: node.id,
    })
    createNode(newLevel, node.id)
  }

  return (
    <TreeNodeWrapper
      actions={
        <div className="flex items-center gap-0.5">
          <TreeNodeActions node={node} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost"
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-primary-foreground/20"
                onClick={handleAddLevel}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">添加楼层</TooltipContent>
          </Tooltip>
        </div>
      }
      depth={depth}
      expanded={expanded}
      hasChildren={node.children.length > 0}
      icon={<Building2 className="h-3.5 w-3.5" />}
      isHovered={isHovered}
      isLast={isLast}
      isSelected={isSelected}
      label={node.name || '建筑'}
      onClick={handleClick}
      onDoubleClick={() => focusTreeNode(node.id)}
      onToggle={() => setExpanded(!expanded)}
    >
      {sortedChildren.map((childId, index) => (
        <TreeNode
          depth={depth + 1}
          isLast={index === sortedChildren.length - 1}
          key={childId}
          nodeId={childId}
        />
      ))}
    </TreeNodeWrapper>
  )
}
