'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type MaterialSchema,
  type RoofSegmentNode,
  RoofSegmentNode as RoofSegmentNodeSchema,
  type RoofType,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Copy, Move, Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import { sfxEmitter } from '../../../lib/sfx-bus'
import useEditor from '../../../store/use-editor'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { MaterialPicker } from '../controls/material-picker'
import { MetricControl } from '../controls/metric-control'
import { PanelSection } from '../controls/panel-section'
import { SegmentedControl } from '../controls/segmented-control'
import { SliderControl } from '../controls/slider-control'
import { PanelWrapper } from './panel-wrapper'

const ROOF_TYPE_OPTIONS: { label: string; value: RoofType }[] = [
  { label: '四坡顶', value: 'hip' },
  { label: '人字顶', value: 'gable' },
  { label: '单坡顶', value: 'shed' },
  { label: '平顶', value: 'flat' },
]

const ROOF_TYPE_OPTIONS_2: { label: string; value: RoofType }[] = [
  { label: '谷仓顶', value: 'gambrel' },
  { label: '荷兰顶', value: 'dutch' },
  { label: '孟莎顶', value: 'mansard' },
]

export function RoofSegmentPanel() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const setSelection = useViewer((s) => s.setSelection)
  const nodes = useScene((s) => s.nodes)
  const updateNode = useScene((s) => s.updateNode)
  const setMovingNode = useEditor((s) => s.setMovingNode)

  const selectedId = selectedIds[0]
  const node = selectedId
    ? (nodes[selectedId as AnyNode['id']] as RoofSegmentNode | undefined)
    : undefined

  const handleUpdate = useCallback(
    (updates: Partial<RoofSegmentNode>) => {
      if (!selectedId) return
      updateNode(selectedId as AnyNode['id'], updates)
    },
    [selectedId, updateNode],
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleBack = useCallback(() => {
    if (node?.parentId) {
      setSelection({ selectedIds: [node.parentId] })
    }
  }, [node?.parentId, setSelection])

  const handleDuplicate = useCallback(() => {
    if (!node?.parentId) return
    sfxEmitter.emit('sfx:item-pick')

    let duplicateInfo = structuredClone(node) as any
    delete duplicateInfo.id
    duplicateInfo.metadata = { ...duplicateInfo.metadata, isNew: true }
    // Offset slightly so it's visible
    duplicateInfo.position = [
      duplicateInfo.position[0] + 1,
      duplicateInfo.position[1],
      duplicateInfo.position[2] + 1,
    ]

    try {
      const duplicate = RoofSegmentNodeSchema.parse(duplicateInfo)
      useScene.getState().createNode(duplicate, duplicate.parentId as AnyNodeId)
      setSelection({ selectedIds: [] })
      setMovingNode(duplicate)
    } catch (e) {
      console.error('Failed to duplicate roof segment', e)
    }
  }, [node, setSelection, setMovingNode])

  const handleMove = useCallback(() => {
    if (node) {
      sfxEmitter.emit('sfx:item-pick')
      setMovingNode(node)
      setSelection({ selectedIds: [] })
    }
  }, [node, setMovingNode, setSelection])

  const handleDelete = useCallback(() => {
    if (!(selectedId && node)) return
    sfxEmitter.emit('sfx:item-delete')
    const parentId = node.parentId
    useScene.getState().deleteNode(selectedId as AnyNodeId)
    if (parentId) {
      useScene.getState().dirtyNodes.add(parentId as AnyNodeId)
      setSelection({ selectedIds: [parentId] })
    } else {
      setSelection({ selectedIds: [] })
    }
  }, [selectedId, node, setSelection])

  const handleMaterialChange = useCallback((material: MaterialSchema) => {
    handleUpdate({ material })
  }, [handleUpdate])

  if (!node || node.type !== 'roof-segment' || selectedIds.length !== 1) return null

  return (
    <PanelWrapper
      icon="/icons/roof.png"
      onBack={handleBack}
      onClose={handleClose}
      title={node.name || '屋顶段'}
      width={300}
    >
      <PanelSection title="屋顶类型">
        <SegmentedControl
          onChange={(v) => handleUpdate({ roofType: v })}
          options={ROOF_TYPE_OPTIONS}
          value={node.roofType}
        />
        <SegmentedControl
          onChange={(v) => handleUpdate({ roofType: v })}
          options={ROOF_TYPE_OPTIONS_2}
          value={node.roofType}
        />
      </PanelSection>

      <PanelSection title="占地面积">
        <SliderControl
          label="宽度"
          max={25}
          min={0.5}
          onChange={(v) => handleUpdate({ width: v })}
          precision={2}
          step={0.5}
          unit="m"
          value={Math.round(node.width * 100) / 100}
        />
        <SliderControl
          label="深度"
          max={25}
          min={0.5}
          onChange={(v) => handleUpdate({ depth: v })}
          precision={2}
          step={0.5}
          unit="m"
          value={Math.round(node.depth * 100) / 100}
        />
      </PanelSection>

      <PanelSection title="高度">
        <SliderControl
          label="墙体"
          max={5}
          min={0}
          onChange={(v) => handleUpdate({ wallHeight: v })}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.wallHeight * 100) / 100}
        />
        <SliderControl
          label="屋顶"
          max={15}
          min={0}
          onChange={(v) => handleUpdate({ roofHeight: v })}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.roofHeight * 100) / 100}
        />
      </PanelSection>

      <PanelSection title="结构">
        <SliderControl
          label="墙厚"
          max={1}
          min={0.05}
          onChange={(v) => handleUpdate({ wallThickness: v })}
          precision={2}
          step={0.05}
          unit="m"
          value={Math.round(node.wallThickness * 100) / 100}
        />
        <SliderControl
          label="屋面厚"
          max={0.3}
          min={0.04}
          onChange={(v) => handleUpdate({ deckThickness: v })}
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(node.deckThickness * 100) / 100}
        />
        <SliderControl
          label="挑檐"
          max={1}
          min={0}
          onChange={(v) => handleUpdate({ overhang: v })}
          precision={2}
          step={0.05}
          unit="m"
          value={Math.round(node.overhang * 100) / 100}
        />
        <SliderControl
          label="瓦片厚"
          max={0.3}
          min={0.02}
          onChange={(v) => handleUpdate({ shingleThickness: v })}
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(node.shingleThickness * 100) / 100}
        />
      </PanelSection>

      <PanelSection title="位置">
        <MetricControl
          label="X"
          max={50}
          min={-50}
          onChange={(v) => {
            const pos = [...node.position] as [number, number, number]
            pos[0] = v
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.05}
          unit="m"
          value={Math.round(node.position[0] * 100) / 100}
        />
        <MetricControl
          label="Y"
          max={50}
          min={-50}
          onChange={(v) => {
            const pos = [...node.position] as [number, number, number]
            pos[1] = v
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.05}
          unit="m"
          value={Math.round(node.position[1] * 100) / 100}
        />
        <MetricControl
          label="Z"
          max={50}
          min={-50}
          onChange={(v) => {
            const pos = [...node.position] as [number, number, number]
            pos[2] = v
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.05}
          unit="m"
          value={Math.round(node.position[2] * 100) / 100}
        />
        <SliderControl
          label="旋转"
          max={180}
          min={-180}
          onChange={(degrees) => {
            handleUpdate({ rotation: (degrees * Math.PI) / 180 })
          }}
          precision={0}
          step={1}
          unit="°"
          value={Math.round((node.rotation * 180) / Math.PI)}
        />
        <div className="flex gap-1.5 px-1 pt-2 pb-1">
          <ActionButton
            label="-45°"
            onClick={() => {
              sfxEmitter.emit('sfx:item-rotate')
              handleUpdate({ rotation: node.rotation - Math.PI / 4 })
            }}
          />
          <ActionButton
            label="+45°"
            onClick={() => {
              sfxEmitter.emit('sfx:item-rotate')
              handleUpdate({ rotation: node.rotation + Math.PI / 4 })
            }}
          />
        </div>
      </PanelSection>

      <PanelSection title="材质">
        <MaterialPicker
          onChange={handleMaterialChange}
          value={node.material}
        />
      </PanelSection>

      <PanelSection title="操作">
        <ActionGroup>
          <ActionButton icon={<Move className="h-3.5 w-3.5" />} label="移动" onClick={handleMove} />
          <ActionButton
            icon={<Copy className="h-3.5 w-3.5" />}
            label="复制"
            onClick={handleDuplicate}
          />
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
