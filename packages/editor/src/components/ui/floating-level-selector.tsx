'use client'

import { type BuildingNode, type LevelNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '../../lib/utils'
import { Button } from './primitives/button'

function getLevelDisplayLabel(level: LevelNode) {
  return level.name || `Level ${level.level}`
}

export function FloatingLevelSelector() {
  const selectedBuildingId = useViewer((s) => s.selection.buildingId)
  const levelId = useViewer((s) => s.selection.levelId)
  const setSelection = useViewer((s) => s.setSelection)
  const updateNodes = useScene((s) => s.updateNodes)

  // Resolve the effective building ID — selected or first in scene
  const resolvedBuildingId = useScene((state) => {
    if (selectedBuildingId) return selectedBuildingId
    const first = Object.values(state.nodes).find((n) => n?.type === 'building') as
      | BuildingNode
      | undefined
    return first?.id ?? null
  })

  // Get levels for the resolved building, sorted ascending by `level` field
  // (levels[0] = lowest floor; levels[N-1] = highest floor)
  const levels = useScene(
    useShallow((state) => {
      if (!resolvedBuildingId) return [] as LevelNode[]
      const building = state.nodes[resolvedBuildingId]
      if (!building || building.type !== 'building') return [] as LevelNode[]
      return ((building as BuildingNode).children ?? [])
        .map((id) => state.nodes[id])
        .filter((node): node is LevelNode => node?.type === 'level')
        .sort((a, b) => a.level - b.level)
    }),
  )

  if (levels.length <= 1) return null

  // Display highest level at top, ground at bottom
  const reversedLevels = [...levels].reverse()

  /**
   * 楼层重排 —— 把 `levelId` 指定的层和相邻位置（up = 更高层 / down = 更低层）互换，
   * 然后把所有层的 `level` 字段**归一化**到 0..N-1。
   *
   * 为什么归一化而不是只 swap 两个值？
   *   - 万一历史数据有重复 level（早期 bug 或手工调过），纯 swap 可能是 no-op。
   *   - 归一化后每次都重写全部层的 level 字段，顺序永远唯一、连续，后续交互稳定。
   *   - updateNodes 批量提交 → 原子、单步 undo、无中间帧歧义。
   *
   * 只写真正变化的层（filter 跳过 level 已等于新值的条目）—— 减少无谓 re-render
   * 和 undo 栈里的"空变更"。
   */
  const moveLevel = (id: string, direction: 'up' | 'down') => {
    const currentIdx = levels.findIndex((l) => l.id === id)
    if (currentIdx === -1) return
    const targetIdx = direction === 'up' ? currentIdx + 1 : currentIdx - 1
    if (targetIdx < 0 || targetIdx >= levels.length) return

    const reordered = [...levels]
    const tmp = reordered[currentIdx]!
    reordered[currentIdx] = reordered[targetIdx]!
    reordered[targetIdx] = tmp

    const updates: { id: string; data: Partial<LevelNode> }[] = []
    for (let i = 0; i < reordered.length; i++) {
      const lv = reordered[i]!
      if (lv.level !== i) {
        updates.push({ id: lv.id, data: { level: i } as Partial<LevelNode> })
      }
    }
    if (updates.length > 0) {
      updateNodes(updates as Parameters<typeof updateNodes>[0])
    }
  }

  return (
    <div className="pointer-events-auto absolute top-14 left-3 z-20">
      <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur-xl">
        {reversedLevels.map((level, displayIndex) => {
          const isSelected = level.id === levelId
          // ascIndex = 在升序 levels 里的位置
          const ascIndex = levels.length - 1 - displayIndex
          const canMoveUp = ascIndex < levels.length - 1
          const canMoveDown = ascIndex > 0

          return (
            <div
              className="group flex items-center gap-1 pr-1"
              key={level.id}
            >
              {/* 楼层切换主按钮 —— 点击切到该层。整行大部分区域都能点 */}
              <button
                className={cn(
                  'flex-1 truncate rounded-lg px-2.5 py-1 text-left font-medium text-xs transition-colors',
                  isSelected
                    ? 'bg-white/10 text-foreground'
                    : 'text-muted-foreground/70 hover:bg-white/5 hover:text-foreground',
                )}
                onClick={() =>
                  setSelection(
                    resolvedBuildingId
                      ? { buildingId: resolvedBuildingId, levelId: level.id }
                      : { levelId: level.id },
                  )
                }
                title={getLevelDisplayLabel(level)}
                type="button"
              >
                <span className="truncate">{getLevelDisplayLabel(level)}</span>
              </button>

              {/* 上下调序 —— hover 整行时显示，减少视觉噪音 */}
              <div
                className={cn(
                  'flex items-center gap-px opacity-0 transition-opacity',
                  'group-hover:opacity-100',
                  isSelected && 'opacity-60',
                )}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    'size-5 p-0 text-muted-foreground hover:text-foreground',
                    !canMoveUp && 'pointer-events-none opacity-30',
                  )}
                  disabled={!canMoveUp}
                  onClick={(e) => {
                    e.stopPropagation()
                    moveLevel(level.id, 'up')
                  }}
                  title="上移（与上一层交换）"
                  type="button"
                >
                  <ChevronUp className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    'size-5 p-0 text-muted-foreground hover:text-foreground',
                    !canMoveDown && 'pointer-events-none opacity-30',
                  )}
                  disabled={!canMoveDown}
                  onClick={(e) => {
                    e.stopPropagation()
                    moveLevel(level.id, 'down')
                  }}
                  title="下移（与下一层交换）"
                  type="button"
                >
                  <ChevronDown className="size-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
