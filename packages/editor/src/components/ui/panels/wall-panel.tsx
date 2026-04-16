'use client'

import { type AnyNode, type AnyNodeId, type MaterialSchema, useScene, type WallNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Trash2 } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { cn } from '../../../lib/utils'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { DEFAULT_WALL_TYPE, WALL_TYPES, WALL_TYPE_BY_ID, type WallType } from '../../tools/wall/wall-types'
import { MaterialPicker } from '../controls/material-picker'
import { PanelSection } from '../controls/panel-section'
import { SliderControl } from '../controls/slider-control'
import { PanelWrapper } from './panel-wrapper'

export function WallPanel() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const setSelection = useViewer((s) => s.setSelection)
  const nodes = useScene((s) => s.nodes)
  const updateNode = useScene((s) => s.updateNode)

  // 多选：找出所有被选中的墙节点
  const selectedWalls = useMemo(() => {
    return selectedIds
      .map((id) => nodes[id as AnyNode['id']])
      .filter((n): n is WallNode => !!n && n.type === 'wall')
  }, [selectedIds, nodes])

  const selectedId = selectedIds[0]
  const node = selectedId ? (nodes[selectedId as AnyNode['id']] as WallNode | undefined) : undefined

  const handleUpdate = useCallback(
    (updates: Partial<WallNode>) => {
      if (!selectedId) return
      updateNode(selectedId as AnyNode['id'], updates)
      useScene.getState().dirtyNodes.add(selectedId as AnyNodeId)
    },
    [selectedId, updateNode],
  )

  const handleUpdateLength = useCallback((newLength: number) => {
    if (!node || newLength <= 0) return

    const dx = node.end[0] - node.start[0]
    const dz = node.end[1] - node.start[1]
    const currentLength = Math.sqrt(dx * dx + dz * dz)

    if (currentLength === 0) return

    const dirX = dx / currentLength
    const dirZ = dz / currentLength

    const newEnd: [number, number] = [
      node.start[0] + dirX * newLength,
      node.start[1] + dirZ * newLength
    ]

    handleUpdate({ end: newEnd })
  }, [node, handleUpdate])

  const handleMaterialChange = useCallback((material: MaterialSchema) => {
    handleUpdate({ material })
  }, [handleUpdate])

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleDelete = useCallback(() => {
    const ids = selectedWalls.map((w) => w.id as AnyNodeId)
    if (ids.length === 0) return
    sfxEmitter.emit('sfx:structure-delete')
    useScene.getState().deleteNodes(ids)
    setSelection({ selectedIds: [] })
  }, [selectedWalls, setSelection])

  // 切换墙种类 —— 同时更新 thickness 和 metadata.wallType
  // 支持单选和多选：多选时对所有选中的墙一起应用
  const handleChangeWallType = useCallback(
    (newTypeId: WallType) => {
      if (selectedWalls.length === 0) return
      const def = WALL_TYPE_BY_ID[newTypeId]
      if (!def) return
      const sceneState = useScene.getState()
      for (const wall of selectedWalls) {
        const existingMeta = (typeof wall.metadata === 'object' && wall.metadata !== null) ? wall.metadata as Record<string, unknown> : {}
        sceneState.updateNode(wall.id, {
          thickness: def.thickness,
          metadata: { ...existingMeta, wallType: newTypeId },
        } as Partial<WallNode>)
        sceneState.dirtyNodes.add(wall.id as AnyNodeId)
      }
    },
    [selectedWalls],
  )

  // 当前所有选中墙的种类：如果一致就显示对应 id，不一致（mixed）返回 null
  const currentWallTypeId: WallType | null = useMemo(() => {
    if (selectedWalls.length === 0) return null
    const types = selectedWalls.map(
      (w) => ((w.metadata as { wallType?: WallType } | undefined)?.wallType ?? DEFAULT_WALL_TYPE) as WallType,
    )
    return types.every((t) => t === types[0]) ? (types[0] ?? null) : null
  }, [selectedWalls])

  // 多选多墙：只显示「墙种类」切换面板，其他尺寸/材质不做批量编辑
  if (selectedWalls.length > 1) {
    return (
      <PanelWrapper
        icon="/icons/wall.png"
        onClose={handleClose}
        title={`${selectedWalls.length} 面墙`}
        width={280}
      >
        <PanelSection title="墙种类">
          <WallTypeSwitcher
            currentTypeId={currentWallTypeId}
            onChange={handleChangeWallType}
          />
        </PanelSection>
        <DeleteFooter onDelete={handleDelete} label={`删除 ${selectedWalls.length} 面墙`} />
      </PanelWrapper>
    )
  }

  if (!node || node.type !== 'wall' || selectedIds.length !== 1) return null

  const dx = node.end[0] - node.start[0]
  const dz = node.end[1] - node.start[1]
  const length = Math.sqrt(dx * dx + dz * dz)

  const height = node.height ?? 2.5
  const thickness = node.thickness ?? 0.1

  return (
    <PanelWrapper
      icon="/icons/wall.png"
      onClose={handleClose}
      title={node.name || '墙体'}
      width={280}
    >
      <PanelSection title="墙种类">
        <WallTypeSwitcher
          currentTypeId={currentWallTypeId}
          onChange={handleChangeWallType}
        />
      </PanelSection>

      <PanelSection title="尺寸">
        <SliderControl
          label="长度"
          max={20}
          min={0.1}
          onChange={handleUpdateLength}
          precision={2}
          step={0.01}
          unit="m"
          value={length}
        />
        <SliderControl
          label="高度"
          max={6}
          min={0.1}
          onChange={(v) => handleUpdate({ height: Math.max(0.1, v) })}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(height * 100) / 100}
        />
        <SliderControl
          label="厚度"
          max={1}
          min={0.05}
          onChange={(v) => handleUpdate({ thickness: Math.max(0.05, v) })}
          precision={3}
          step={0.01}
          unit="m"
          value={Math.round(thickness * 1000) / 1000}
        />
      </PanelSection>

      <PanelSection title="对齐">
        <div className="flex flex-col gap-1.5 px-1">
          <p className="text-[10px] text-muted-foreground">
            描摹底图时墙体对不齐？点击翻转让墙向对面偏移一个墙厚。
          </p>
          <div className="flex gap-1.5">
            <button
              className="flex-1 rounded-md bg-accent/60 px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
              onClick={() => {
                // 将墙中心线沿法线方向偏移一个墙厚
                const t = thickness
                const len = Math.sqrt(dx * dx + dz * dz)
                if (len < 1e-9) return
                const nx = -dz / len  // 左侧法线
                const nz = dx / len
                handleUpdate({
                  start: [node.start[0] + nx * t, node.start[1] + nz * t],
                  end: [node.end[0] + nx * t, node.end[1] + nz * t],
                })
              }}
              type="button"
            >
              向左偏移
            </button>
            <button
              className="flex-1 rounded-md bg-accent/60 px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
              onClick={() => {
                const t = thickness
                const len = Math.sqrt(dx * dx + dz * dz)
                if (len < 1e-9) return
                const nx = dz / len   // 右侧法线
                const nz = -dx / len
                handleUpdate({
                  start: [node.start[0] + nx * t, node.start[1] + nz * t],
                  end: [node.end[0] + nx * t, node.end[1] + nz * t],
                })
              }}
              type="button"
            >
              向右偏移
            </button>
          </div>
        </div>
      </PanelSection>

      <PanelSection title="材质">
        <MaterialPicker
          onChange={handleMaterialChange}
          value={node.material}
        />
      </PanelSection>
      <DeleteFooter onDelete={handleDelete} label="删除墙体" />
    </PanelWrapper>
  )
}

/** 面板底部的红色删除按钮 */
function DeleteFooter({ onDelete, label }: { onDelete: () => void; label: string }) {
  return (
    <div className="border-border/30 border-t px-3 py-2">
      <button
        className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10"
        onClick={onDelete}
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {label}
        <span className="ml-1 rounded bg-white/5 px-1 py-0.5 font-mono text-[10px] text-muted-foreground">⌫</span>
      </button>
    </div>
  )
}

/**
 * 墙种类切换器 —— 复用 StructureTools 中 WallThicknessSelector 的视觉，
 * 但这里是「作用在已有墙上」而不是「设置默认种类」。
 */
function WallTypeSwitcher({
  currentTypeId,
  onChange,
}: {
  currentTypeId: WallType | null
  onChange: (typeId: WallType) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <div className="grid grid-cols-5 gap-1">
        {WALL_TYPES.map((t) => {
          const isActive = currentTypeId === t.id
          return (
            <button
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 transition-all',
                isActive
                  ? 'bg-accent ring-1 ring-primary/60'
                  : 'bg-accent/30 hover:bg-accent/60',
              )}
              key={t.id}
              onClick={() => onChange(t.id)}
              title={t.description}
              type="button"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: t.color,
                  boxShadow: isActive ? `0 0 6px ${t.color}` : 'none',
                }}
              />
              <span
                className={cn(
                  'text-[10px] font-medium leading-none',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {t.label}
              </span>
              <span
                className={cn(
                  'text-[8px] leading-none',
                  isActive ? 'text-foreground/70' : 'text-muted-foreground/60',
                )}
              >
                {(t.thickness * 1000).toFixed(0)}
              </span>
            </button>
          )
        })}
      </div>
      {currentTypeId === null && (
        <p className="text-[10px] text-muted-foreground">
          选中的墙种类不一致 — 点击任一种类将批量应用到所有选中墙
        </p>
      )}
    </div>
  )
}
