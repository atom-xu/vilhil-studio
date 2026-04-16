'use client'

import { type AnyNode, type GuideNode, type ScanNode, useScene } from '@pascal-app/core'
import { Box, Image as ImageIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import useEditor from '../../../store/use-editor'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { MetricControl } from '../controls/metric-control'
import { PanelSection } from '../controls/panel-section'
import { SliderControl } from '../controls/slider-control'
import { PanelWrapper } from './panel-wrapper'

type ReferenceNode = ScanNode | GuideNode

export function ReferencePanel() {
  const selectedReferenceId = useEditor((s) => s.selectedReferenceId)
  const setSelectedReferenceId = useEditor((s) => s.setSelectedReferenceId)
  const nodes = useScene((s) => s.nodes)
  const updateNode = useScene((s) => s.updateNode)

  const node = selectedReferenceId
    ? (nodes[selectedReferenceId as AnyNode['id']] as ReferenceNode | undefined)
    : undefined

  const handleUpdate = useCallback(
    (updates: Partial<ReferenceNode>) => {
      if (!selectedReferenceId) return
      updateNode(selectedReferenceId as AnyNode['id'], updates)
    },
    [selectedReferenceId, updateNode],
  )

  const handleClose = useCallback(() => {
    setSelectedReferenceId(null)
  }, [setSelectedReferenceId])

  if (!node || (node.type !== 'scan' && node.type !== 'guide')) return null

  const isScan = node.type === 'scan'

  return (
    <PanelWrapper
      icon={isScan ? undefined : undefined}
      onClose={handleClose}
      title={node.name || (isScan ? '3D 扫描' : '平面参考图')}
      width={300}
    >
      {/* 操作引导 + 标定入口 */}
      {!isScan && (
        <div className="border-b border-border/40 px-3 py-2.5">
          <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">操作步骤：</span>
            <br />1. 切到 2D 视图，画标定线设置比例
            <br />2. 拖拽底图对齐墙角到网格原点
            <br />3. 沿底图描摹画墙
          </p>
          <CalibrationButton guideNodeId={node.id} />
        </div>
      )}

      <PanelSection title="位置">
        <SliderControl
          label={
            <>
              X<sub className="ml-[1px] text-[11px] opacity-70">pos</sub>
            </>
          }
          max={50}
          min={-50}
          onChange={(value) => {
            const pos = [...node.position] as [number, number, number]
            pos[0] = value
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.position[0] * 100) / 100}
        />
        <SliderControl
          label={
            <>
              Y<sub className="ml-[1px] text-[11px] opacity-70">pos</sub>
            </>
          }
          max={50}
          min={-50}
          onChange={(value) => {
            const pos = [...node.position] as [number, number, number]
            pos[1] = value
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.position[1] * 100) / 100}
        />
        <SliderControl
          label={
            <>
              Z<sub className="ml-[1px] text-[11px] opacity-70">pos</sub>
            </>
          }
          max={50}
          min={-50}
          onChange={(value) => {
            const pos = [...node.position] as [number, number, number]
            pos[2] = value
            handleUpdate({ position: pos })
          }}
          precision={2}
          step={0.1}
          unit="m"
          value={Math.round(node.position[2] * 100) / 100}
        />
        <div className="flex gap-1.5 px-1 pt-2 pb-1">
          <ActionButton
            label="归零"
            onClick={() => handleUpdate({ position: [0, 0, 0] })}
          />
        </div>
      </PanelSection>

      <PanelSection title="旋转">
        <SliderControl
          label={
            <>
              Y<sub className="ml-[1px] text-[11px] opacity-70">rot</sub>
            </>
          }
          max={180}
          min={-180}
          onChange={(degrees) => {
            const radians = (degrees * Math.PI) / 180
            handleUpdate({
              rotation: [node.rotation[0], radians, node.rotation[2]],
            })
          }}
          precision={0}
          step={1}
          unit="°"
          value={Math.round((node.rotation[1] * 180) / Math.PI)}
        />
        <div className="flex gap-1.5 px-1 pt-2 pb-1">
          <ActionButton
            label="-45°"
            onClick={() =>
              handleUpdate({
                rotation: [node.rotation[0], node.rotation[1] - Math.PI / 4, node.rotation[2]],
              })
            }
          />
          <ActionButton
            label="+45°"
            onClick={() =>
              handleUpdate({
                rotation: [node.rotation[0], node.rotation[1] + Math.PI / 4, node.rotation[2]],
              })
            }
          />
        </div>
      </PanelSection>

      <PanelSection title="缩放">
        {/* 快速标定：输入图纸实际宽度 */}
        {!isScan && <QuickScaleInput currentScale={node.scale} onApply={(s) => handleUpdate({ scale: s })} />}

        <SliderControl
          label={
            <>
              XYZ<sub className="ml-[1px] text-[11px] opacity-70">scale</sub>
            </>
          }
          max={10}
          min={0.01}
          onChange={(value) => {
            if (value > 0) {
              handleUpdate({ scale: value })
            }
          }}
          precision={2}
          step={0.1}
          value={Math.round(node.scale * 100) / 100}
        />

        <SliderControl
          label="透明度"
          max={100}
          min={0}
          onChange={(v) => handleUpdate({ opacity: v })}
          precision={0}
          step={1}
          unit="%"
          value={node.opacity}
        />
      </PanelSection>
    </PanelWrapper>
  )
}

/**
 * QuickScaleInput — 输入图纸实际宽度 → 自动算 scale
 *
 * guide-renderer: scale=1 时平面宽 = 10m
 * 所以 new_scale = 实际宽度 / 10
 *
 * 划线标定在 2D floorplan 视图中完成（拖拽两点），
 * 这里提供备选的"输入宽度"方式。
 */
function CalibrationButton({ guideNodeId }: { guideNodeId: string }) {
  const isActive = useEditor((s) => s.calibration?.active && s.calibration.guideNodeId === guideNodeId)
  const startCalibration = useEditor((s) => s.startCalibration)
  const cancelCalibration = useEditor((s) => s.cancelCalibration)

  if (isActive) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5">
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="text-[11px] font-medium text-primary">在 2D 底图上点两个点</span>
        </div>
        <button
          className="text-[10px] text-muted-foreground hover:text-foreground"
          onClick={cancelCalibration}
          type="button"
        >
          取消
        </button>
      </div>
    )
  }

  return (
    <button
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
      onClick={() => {
        startCalibration(guideNodeId)
        // 自动切到 2D 视图
        useEditor.getState().setViewMode('2d')
      }}
      type="button"
    >
      画线标定比例
    </button>
  )
}

function QuickScaleInput({
  currentScale,
  onApply,
}: {
  currentScale: number
  onApply: (scale: number) => void
}) {
  const [value, setValue] = useState('')
  const currentWidthM = Math.round(currentScale * 10 * 100) / 100

  const handleApply = () => {
    const w = parseFloat(value)
    if (!w || w <= 0) return
    onApply(w / 10)
    setValue('')
  }

  return (
    <div className="flex flex-col gap-1.5 px-1 pb-2">
      <p className="text-[10px] text-muted-foreground">
        当前宽度 ≈ {currentWidthM}m。输入实际宽度可快速校准：
      </p>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            className="w-full rounded-md border border-border/50 bg-accent/20 px-2 py-1 pr-6 text-foreground text-xs outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleApply() }}
            placeholder="实际宽度"
            type="number"
            value={value}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">m</span>
        </div>
        <button
          className="shrink-0 rounded-md bg-primary/80 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!value || parseFloat(value) <= 0}
          onClick={handleApply}
          type="button"
        >
          应用
        </button>
      </div>
    </div>
  )
}
