'use client'

/**
 * SceneNodePanel — 右侧属性面板（选中场景节点时显示）
 *
 * 提供场景名称快捷编辑 + 一键应用预览场景效果
 */

import { type AnyNode, type DeviceNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  addSceneEffect,
  applyScene,
  deleteScene,
  removeSceneEffect,
  updateScene,
} from '@vilhil/smarthome'
import type { SceneNodeType } from '@pascal-app/core'
import { Play, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { PanelSection } from '../controls/panel-section'
import { PanelWrapper } from './panel-wrapper'

interface SceneNodePanelProps {
  sceneId: string
}

export function SceneNodePanel({ sceneId }: SceneNodePanelProps) {
  const setSelection = useViewer((s: any) => s.setSelection)
  const nodes = useScene((s) => s.nodes)

  const sceneNode = nodes[sceneId as AnyNode['id']] as SceneNodeType | undefined

  const [editName, setEditName] = useState(sceneNode?.name ?? '')

  const deviceNodes = useMemo(
    () =>
      Object.values(nodes).filter(
        (n): n is DeviceNode => n?.type === 'device',
      ),
    [nodes],
  )

  const effectMap = useMemo(() => {
    const m = new Map<string, { state: Record<string, unknown> }>()
    for (const e of sceneNode?.effects ?? []) {
      m.set(e.deviceId, { state: e.state })
    }
    return m
  }, [sceneNode?.effects])

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleDelete = useCallback(() => {
    deleteScene(sceneId)
    setSelection({ selectedIds: [] })
  }, [sceneId, setSelection])

  const handleApply = useCallback(() => {
    applyScene(sceneId)
  }, [sceneId])

  const handleNameBlur = useCallback(() => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== sceneNode?.name) {
      updateScene(sceneId, { name: trimmed })
    }
  }, [editName, sceneId, sceneNode?.name])

  if (!sceneNode) return null

  return (
    <PanelWrapper onClose={handleClose} title={sceneNode.icon ? `${sceneNode.icon} 场景` : '场景'}>
      {/* 场景信息 */}
      <PanelSection title="基本信息">
        <div className="px-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-muted-foreground text-xs">名称</span>
            <input
              className="flex-1 rounded border border-border/50 bg-accent/20 px-2 py-1 text-foreground text-xs outline-none focus:border-primary/60"
              onBlur={handleNameBlur}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameBlur()
              }}
              type="text"
              value={editName}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-muted-foreground text-xs">效果数</span>
            <span className="text-foreground text-xs">
              {sceneNode.effects.length} 个设备
            </span>
          </div>
        </div>
      </PanelSection>

      {/* 预览场景 */}
      <PanelSection title="预览">
        <button
          className="flex w-full items-center gap-2 rounded-lg bg-violet-500/15 px-3 py-2 text-violet-400 text-sm font-medium transition-colors hover:bg-violet-500/25"
          onClick={handleApply}
          type="button"
        >
          <Play className="h-4 w-4" />
          在编辑器中预览场景
        </button>
        <p className="px-1 text-[10px] text-muted-foreground">
          预览不影响 Undo 历史，可随时撤销
        </p>
      </PanelSection>

      {/* 设备效果列表 */}
      {sceneNode.effects.length > 0 && (
        <PanelSection title="设备效果">
          <div className="space-y-1 px-1">
            {sceneNode.effects.map((effect) => {
              const device = nodes[effect.deviceId as AnyNode['id']] as DeviceNode | undefined
              if (!device) return null
              return (
                <div
                  className="flex items-center gap-2 rounded-lg border border-border/30 bg-accent/10 px-2 py-1.5"
                  key={effect.deviceId}
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {(device.productName as string | undefined) ?? device.productId}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {effect.state.on === false
                      ? '关'
                      : typeof effect.state.brightness === 'number'
                        ? `${effect.state.brightness}%`
                        : '开'}
                  </span>
                  <button
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-red-400"
                    onClick={() => removeSceneEffect(sceneId, effect.deviceId)}
                    title="移除"
                    type="button"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </PanelSection>
      )}

      {/* 删除 */}
      <PanelSection defaultExpanded={false} title="操作">
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-red-400 text-xs transition-colors hover:bg-red-500/10"
          onClick={handleDelete}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          删除场景
        </button>
      </PanelSection>
    </PanelWrapper>
  )
}
