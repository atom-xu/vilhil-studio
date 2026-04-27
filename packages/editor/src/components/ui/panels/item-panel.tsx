'use client'

import { type AnyNode, getScaledDimensions, ItemNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Copy, Link, Link2Off, Move, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { cn } from '../../../lib/utils'
import useEditor from '../../../store/use-editor'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { PanelSection } from '../controls/panel-section'
import { Button } from '../primitives/button'
import { SliderControl } from '../controls/slider-control'
import { CollectionsPopover } from './collections/collections-popover'
import { PanelWrapper } from './panel-wrapper'

export function ItemPanel() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const setSelection = useViewer((s) => s.setSelection)
  const nodes = useScene((s) => s.nodes)
  const updateNode = useScene((s) => s.updateNode)
  const deleteNode = useScene((s) => s.deleteNode)
  const setMovingNode = useEditor((s) => s.setMovingNode)

  const selectedId = selectedIds[0]
  const node = selectedId ? (nodes[selectedId as AnyNode['id']] as ItemNode | undefined) : undefined

  const [showPerAxis, setShowPerAxis] = useState(false)

  const handleUpdate = useCallback(
    (updates: Partial<ItemNode>) => {
      if (!(selectedId && node)) return
      updateNode(selectedId as AnyNode['id'], updates)

      if (node.asset.attachTo === 'wall' && node.parentId) {
        requestAnimationFrame(() => {
          useScene.getState().dirtyNodes.add(node.parentId as AnyNode['id'])
        })
      }
    },
    [selectedId, node, updateNode],
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleMove = useCallback(() => {
    if (node) {
      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(node)
      setSelection({ selectedIds: [] })
    }
  }, [node, setMovingNode, setSelection])

  const handleDuplicate = useCallback(() => {
    if (!node) return
    sfxEmitter.emit('sfx:item-pick')
    const proto = ItemNode.parse({
      position: [...node.position] as [number, number, number],
      rotation: [...node.rotation] as [number, number, number],
      name: node.name,
      asset: node.asset,
      parentId: node.parentId,
      side: node.side,
      metadata: { isNew: true },
    })
    setMovingNode(proto)
    setSelection({ selectedIds: [] })
  }, [node, setMovingNode, setSelection])

  const handleDelete = useCallback(() => {
    if (!selectedId) return
    sfxEmitter.emit('sfx:item-delete')
    deleteNode(selectedId as AnyNode['id'])
    setSelection({ selectedIds: [] })
  }, [selectedId, deleteNode, setSelection])

  const handleRotate = useCallback(
    (delta: number) => {
      if (!node) return
      sfxEmitter.emit('sfx:item-rotate')
      const currentDeg = (node.rotation[1] * 180) / Math.PI
      const radians = ((currentDeg + delta) * Math.PI) / 180
      handleUpdate({ rotation: [node.rotation[0], radians, node.rotation[2]] })
    },
    [node, handleUpdate],
  )

  const handleResetRotation = useCallback(() => {
    if (!node) return
    handleUpdate({ rotation: [0, 0, 0] })
  }, [node, handleUpdate])

  if (!node || node.type !== 'item' || selectedIds.length !== 1) return null

  const isCamera = node.asset.tags?.includes('security')
  const currentRotDeg = Math.round((node.rotation[1] * 180) / Math.PI)
  const normalizedDeg = ((currentRotDeg % 360) + 360) % 360

  return (
    <PanelWrapper
      icon={node.asset.thumbnail || '/icons/furniture.png'}
      onClose={handleClose}
      title={node.name || node.asset.name}
      width={300}
    >
      {/* 摄像头参数（仅安防摄像头） */}
      {isCamera && (
        <PanelSection title="摄像头">
          <SliderControl
            label="朝向"
            max={180}
            min={-180}
            onChange={(degrees) =>
              handleUpdate({
                cameraParams: {
                  fov: node.cameraParams?.fov ?? 60,
                  range: node.cameraParams?.range ?? 8,
                  yaw: degrees,
                },
              })
            }
            precision={0}
            step={1}
            unit="°"
            value={node.cameraParams?.yaw ?? 0}
          />
          <SliderControl
            label="照射角度"
            max={160}
            min={30}
            onChange={(value) =>
              handleUpdate({
                cameraParams: { yaw: node.cameraParams?.yaw ?? 0, range: node.cameraParams?.range ?? 8, fov: value },
              })
            }
            precision={0}
            step={5}
            unit="°"
            value={node.cameraParams?.fov ?? 60}
          />
          <SliderControl
            label="覆盖距离"
            max={50}
            min={1}
            onChange={(value) =>
              handleUpdate({ cameraParams: { yaw: node.cameraParams?.yaw ?? 0, fov: node.cameraParams?.fov ?? 60, range: value } })
            }
            precision={1}
            step={0.5}
            unit="m"
            value={node.cameraParams?.range ?? 8}
          />
        </PanelSection>
      )}

      {/* 旋转 — 快捷按钮，避免相对滑块的范围困扰 */}
      <PanelSection title="旋转">
        <div className="flex items-center gap-1 px-1 pb-1">
          {([-90, -45, 45, 90] as const).map((delta) => (
            <button
              className="flex flex-1 items-center justify-center rounded-md border border-border/50 bg-accent/40 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
              key={delta}
              onClick={() => handleRotate(delta)}
              type="button"
            >
              {delta > 0 ? `+${delta}°` : `${delta}°`}
            </button>
          ))}
          <button
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-border/50 bg-accent/40 text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
            onClick={handleResetRotation}
            title="归零"
            type="button"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="px-2 pb-1 text-center font-mono text-[11px] text-muted-foreground">
          {normalizedDeg}°
        </p>
      </PanelSection>

      {/* 高度 — 仅调整离地高度，水平位置通过拖拽移动 */}
      <PanelSection title="高度">
        <SliderControl
          label="离地高度"
          max={5}
          min={0}
          onChange={(value) =>
            handleUpdate({ position: [node.position[0], value, node.position[2]] })
          }
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(node.position[1] * 100) / 100}
        />
      </PanelSection>

      {/* 缩放 — 默认等比，可切换为分轴 */}
      <PanelSection title="缩放">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="font-medium text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            等比缩放
          </span>
          <Button
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground',
              !showPerAxis ? 'bg-accent' : 'bg-accent/70 hover:bg-accent',
            )}
            onClick={() => setShowPerAxis((v) => !v)}
            title={showPerAxis ? '切换为等比' : '分轴调整'}
            type="button"
            variant="ghost"
          >
            {!showPerAxis ? <Link className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {!showPerAxis ? (
          <SliderControl
            label="大小"
            max={5}
            min={0.1}
            onChange={(value) => {
              const v = Math.max(0.1, value)
              handleUpdate({ scale: [v, v, v] })
            }}
            precision={2}
            step={0.05}
            value={Math.round(node.scale[0] * 100) / 100}
          />
        ) : (
          <>
            <SliderControl
              label={<>X<sub className="ml-[1px] text-[11px] opacity-70">宽</sub></>}
              max={10}
              min={0.01}
              onChange={(value) =>
                handleUpdate({ scale: [Math.max(0.01, value), node.scale[1], node.scale[2]] })
              }
              precision={2}
              step={0.05}
              value={Math.round(node.scale[0] * 100) / 100}
            />
            <SliderControl
              label={<>Y<sub className="ml-[1px] text-[11px] opacity-70">高</sub></>}
              max={10}
              min={0.01}
              onChange={(value) =>
                handleUpdate({ scale: [node.scale[0], Math.max(0.01, value), node.scale[2]] })
              }
              precision={2}
              step={0.05}
              value={Math.round(node.scale[1] * 100) / 100}
            />
            <SliderControl
              label={<>Z<sub className="ml-[1px] text-[11px] opacity-70">深</sub></>}
              max={10}
              min={0.01}
              onChange={(value) =>
                handleUpdate({ scale: [node.scale[0], node.scale[1], Math.max(0.01, value)] })
              }
              precision={2}
              step={0.05}
              value={Math.round(node.scale[2] * 100) / 100}
            />
          </>
        )}
      </PanelSection>

      {/* 信息 */}
      <PanelSection title="信息">
        <div className="flex items-center justify-between px-2 py-1 text-sm text-muted-foreground">
          <span>尺寸</span>
          {(() => {
            const [w, h, d] = getScaledDimensions(node)
            return (
              <span className="font-mono text-foreground">
                {Math.round(w * 100) / 100}×{Math.round(h * 100) / 100}×{Math.round(d * 100) / 100}
              </span>
            )
          })()}
        </div>
      </PanelSection>

      {/* 集合 */}
      <PanelSection title="集合">
        <ActionGroup>
          <CollectionsPopover
            collectionIds={node.collectionIds}
            nodeId={selectedId as AnyNode['id']}
          >
            <ActionButton label="管理集合…" />
          </CollectionsPopover>
        </ActionGroup>
      </PanelSection>

      {/* 操作 */}
      <PanelSection title="操作">
        <ActionGroup>
          <ActionButton icon={<Move className="h-3.5 w-3.5" />} label="移动" onClick={handleMove} />
          <ActionButton icon={<Copy className="h-3.5 w-3.5" />} label="复制" onClick={handleDuplicate} />
          <ActionButton
            className="hover:bg-red-500/20"
            icon={<Trash2 className="h-3.5 w-3.5 text-red-400" />}
            label="删除"
            onClick={handleDelete}
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}
