'use client'

import { type AnyNode, type DeviceNode, useScene } from '@pascal-app/core'
import type { SceneNodeType } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { getDeviceDefinition, getSubsystemColor, getSubsystemLabel } from '@vilhil/smarthome'
import {
  removeDevice,
  setDeviceParams,
  setDeviceState,
  setPanelKeyConfig,
  type PanelKeyConfig,
} from '@vilhil/smarthome'
import { ChevronDown, Sparkles, ToggleLeft, Trash2, X, Zap } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { cn } from '../../../lib/utils'
import { PanelSection } from '../controls/panel-section'
import { SliderControl } from '../controls/slider-control'
import { PanelWrapper } from './panel-wrapper'

// ─── 面板按键编辑器 ──────────────────────────────────────────────────────────

type ActionMode = 'toggle' | 'scene'

interface PanelKeyEditorProps {
  panelNodeId: string
  keyIndex: number
  keyConfig: PanelKeyConfig | undefined
  lightingDevices: DeviceNode[]
  sceneNodes: SceneNodeType[]
}

function PanelKeyEditor({
  panelNodeId,
  keyIndex,
  keyConfig,
  lightingDevices,
  sceneNodes,
}: PanelKeyEditorProps) {
  const [expanded, setExpanded] = useState(false)

  // 当前动作类型
  const currentMode: ActionMode = useMemo(() => {
    if (!keyConfig) return 'toggle'
    return keyConfig.action.type === 'scene' ? 'scene' : 'toggle'
  }, [keyConfig])

  const [mode, setMode] = useState<ActionMode>(currentMode)

  // 已联动的灯具 ID（toggle/set 模式）
  const linkedLightIds: string[] = useMemo(() => {
    if (!keyConfig) return []
    const a = keyConfig.action
    if (a.type === 'toggle' || a.type === 'set') return a.deviceIds
    return []
  }, [keyConfig])

  // 已绑定的场景 ID（scene 模式）
  const linkedSceneId: string | null = useMemo(() => {
    if (!keyConfig || keyConfig.action.type !== 'scene') return null
    return keyConfig.action.sceneId
  }, [keyConfig])

  const isConfigured =
    (mode === 'toggle' && linkedLightIds.length > 0) ||
    (mode === 'scene' && linkedSceneId !== null)

  // ── 处理器 ────────────────────────────────────────────────────

  const handleToggleDevice = useCallback(
    (deviceId: string, include: boolean) => {
      const newIds = include
        ? Array.from(new Set([...linkedLightIds, deviceId]))
        : linkedLightIds.filter((id) => id !== deviceId)

      if (newIds.length === 0) {
        setPanelKeyConfig(panelNodeId, keyIndex, null)
      } else {
        setPanelKeyConfig(panelNodeId, keyIndex, {
          label: keyConfig?.label || `按键 ${keyIndex + 1}`,
          action: { type: 'toggle', deviceIds: newIds },
        })
      }
    },
    [panelNodeId, keyIndex, keyConfig, linkedLightIds],
  )

  const handleLinkAllLights = useCallback(() => {
    setPanelKeyConfig(panelNodeId, keyIndex, {
      label: keyConfig?.label || `按键 ${keyIndex + 1}`,
      action: { type: 'toggle', deviceIds: lightingDevices.map((d) => d.id) },
    })
  }, [panelNodeId, keyIndex, keyConfig, lightingDevices])

  const handleSelectScene = useCallback(
    (sceneId: string, sceneName: string) => {
      setPanelKeyConfig(panelNodeId, keyIndex, {
        label: sceneName,
        action: { type: 'scene', sceneId },
      })
    },
    [panelNodeId, keyIndex],
  )

  const handleClear = useCallback(() => {
    setPanelKeyConfig(panelNodeId, keyIndex, null)
  }, [panelNodeId, keyIndex])

  const handleModeSwitch = useCallback(
    (newMode: ActionMode) => {
      setMode(newMode)
      // 切换模式时清除当前配置
      setPanelKeyConfig(panelNodeId, keyIndex, null)
    },
    [panelNodeId, keyIndex],
  )

  // ── 描述文本 ──────────────────────────────────────────────────

  const statusText = useMemo(() => {
    if (!keyConfig) return '未配置'
    const action = keyConfig.action
    if (action.type === 'scene') {
      const s = sceneNodes.find((n) => n.id === action.sceneId)
      return s ? `→ ${s.icon ?? ''} ${s.name}` : '→ 场景已删除'
    }
    const ids = (action as { deviceIds: string[] }).deviceIds
    return `联动 ${ids.length} 个灯具`
  }, [keyConfig, sceneNodes])

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-accent/10">
      {/* 按键头部 */}
      <button
        className={cn(
          'flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors',
          expanded ? 'bg-accent/30' : 'hover:bg-accent/20',
        )}
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <div
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold transition-colors',
            isConfigured ? 'bg-primary text-white' : 'bg-accent text-muted-foreground',
          )}
        >
          {keyIndex + 1}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-foreground">
            {keyConfig?.label || `按键 ${keyIndex + 1}`}
          </div>
          <div className="text-[10px] text-muted-foreground">{statusText}</div>
        </div>

        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-border/50 border-t px-2 py-2 space-y-2">
          {/* 模式切换 */}
          <div className="flex rounded-md border border-border/50 bg-accent/20 p-0.5">
            <button
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded py-1 text-[10px] font-medium transition-all',
                mode === 'toggle'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => mode !== 'toggle' && handleModeSwitch('toggle')}
              type="button"
            >
              <ToggleLeft className="h-3 w-3" />
              切换灯光
            </button>
            <button
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded py-1 text-[10px] font-medium transition-all',
                mode === 'scene'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => mode !== 'scene' && handleModeSwitch('scene')}
              type="button"
            >
              <Sparkles className="h-3 w-3" />
              触发场景
            </button>
          </div>

          {/* 切换灯光模式 */}
          {mode === 'toggle' && (
            <>
              {lightingDevices.length === 0 ? (
                <p className="py-1 text-center text-[10px] text-muted-foreground">
                  场景中没有灯光设备
                </p>
              ) : (
                <div className="space-y-1">
                  {lightingDevices.map((device) => {
                    const isIncluded = linkedLightIds.includes(device.id)
                    return (
                      <button
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors',
                          isIncluded
                            ? 'bg-primary/15 text-foreground'
                            : 'text-muted-foreground hover:bg-accent/30',
                        )}
                        key={device.id}
                        onClick={() => handleToggleDevice(device.id, !isIncluded)}
                        type="button"
                      >
                        <div
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all',
                            isIncluded ? 'border-primary bg-primary text-white' : 'border-border/60',
                          )}
                        >
                          {isIncluded && (
                            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
                              <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-[11px]">
                          {(device.productName as string | undefined) ?? device.productId}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {lightingDevices.length > 0 && (
                <div className="flex items-center gap-1 pt-0.5">
                  <button
                    className="flex-1 rounded-md bg-accent/40 px-2 py-1 text-[10px] font-medium transition-colors hover:bg-accent"
                    onClick={handleLinkAllLights}
                    type="button"
                  >
                    全选
                  </button>
                  {isConfigured && (
                    <button
                      className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
                      onClick={handleClear}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                      清除
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* 触发场景模式 */}
          {mode === 'scene' && (
            <>
              {sceneNodes.length === 0 ? (
                <p className="py-1 text-center text-[10px] text-muted-foreground">
                  还没有场景，请先在"场景"标签页创建
                </p>
              ) : (
                <div className="space-y-1">
                  {sceneNodes.map((scene) => {
                    const isSelected = linkedSceneId === scene.id
                    return (
                      <button
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                          isSelected
                            ? 'bg-violet-500/15 ring-1 ring-violet-500/30 text-foreground'
                            : 'text-muted-foreground hover:bg-accent/30',
                        )}
                        key={scene.id}
                        onClick={() => handleSelectScene(scene.id, scene.name)}
                        type="button"
                      >
                        <span className="shrink-0 rounded bg-accent/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{scene.icon || scene.name?.slice(0, 2) || '场景'}</span>
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                          {scene.name}
                        </span>
                        {isSelected && (
                          <Zap className="h-3 w-3 shrink-0 text-violet-400" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              {isConfigured && (
                <button
                  className="flex w-full items-center justify-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
                  onClick={handleClear}
                  type="button"
                >
                  <X className="h-3 w-3" />
                  解除绑定
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── DevicePanel 主组件 ───────────────────────────────────────────────────────

export function DevicePanel() {
  const selectedIds = useViewer((s: any) => s.selection.selectedIds)
  const setSelection = useViewer((s: any) => s.setSelection)
  const nodes = useScene((s) => s.nodes)

  const selectedId = selectedIds[0]
  const node = selectedId
    ? (nodes[selectedId as AnyNode['id']] as DeviceNode | undefined)
    : undefined

  const deviceDef = useMemo(
    () => (node?.productId ? getDeviceDefinition(node.productId) : undefined),
    [node?.productId],
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleDelete = useCallback(() => {
    if (!node) return
    removeDevice(node.id)
    setSelection({ selectedIds: [] })
  }, [node, setSelection])

  if (!node) return null

  const state = (node.state as Record<string, unknown>) ?? {}
  const params = node.params ?? {}
  const isLighting = node.subsystem === 'lighting'
  const isPanel = node.subsystem === 'panel'
  const subsystemColor = getSubsystemColor(node.subsystem)
  const subsystemLabel = getSubsystemLabel(node.subsystem)

  // 面板按键数量（根据 renderType 推断）
  const keyCount = (() => {
    if (node.renderType?.includes('1key')) return 1
    if (node.renderType?.includes('2key')) return 2
    if (node.renderType?.includes('3key')) return 3
    if (node.renderType?.includes('4key') || node.renderType?.includes('scene-4key')) return 4
    if (node.renderType?.includes('6key') || node.renderType?.includes('scene-6key')) return 6
    return 2
  })()

  const panelKeys = (params.panelKeys as PanelKeyConfig[] | undefined) ?? []

  // 场景中所有灯光设备（供按键联动选择）
  const lightingDevices = Object.values(nodes).filter(
    (n) => n?.type === 'device' && (n as DeviceNode).subsystem === 'lighting',
  ) as DeviceNode[]

  // 场景节点（供按键触发场景选择）
  const sceneNodes = Object.values(nodes).filter(
    (n): n is SceneNodeType => n?.type === 'scene',
  )

  return (
    <PanelWrapper
      onClose={handleClose}
      title={node.productName ?? deviceDef?.name ?? '智能设备'}
    >
      {/* 设备信息 */}
      <PanelSection title="设备信息">
        <div className="flex items-center gap-2 px-1 py-0.5">
          <div
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: subsystemColor }}
          />
          <span className="text-muted-foreground text-xs">{subsystemLabel}</span>
          <span className="ml-auto text-muted-foreground text-xs capitalize">{node.mountType}</span>
        </div>
        {deviceDef?.description && (
          <p className="px-1 text-muted-foreground text-xs">{deviceDef.description}</p>
        )}
      </PanelSection>

      {/* 灯光参数（仅 lighting 子系统） */}
      {isLighting && (
        <PanelSection title="灯光">
          <SliderControl
            label="亮度"
            max={100}
            min={0}
            onChange={(v) => setDeviceState(node.id, { brightness: v })}
            precision={0}
            step={1}
            unit="%"
            value={(state.brightness as number) ?? 100}
          />
          <SliderControl
            label="色温"
            max={6500}
            min={2700}
            onChange={(v) => setDeviceState(node.id, { colorTemp: v })}
            precision={0}
            step={100}
            unit="K"
            value={(state.colorTemp as number) ?? 4000}
          />
          <SliderControl
            label="光束角"
            max={120}
            min={5}
            onChange={(v) => setDeviceParams(node.id, { beamAngle: v })}
            precision={0}
            step={5}
            unit="°"
            value={(params.beamAngle as number) ?? 30}
          />
        </PanelSection>
      )}

      {/* 面板按键配置（仅 panel 子系统） */}
      {isPanel && (
        <PanelSection title="按键联动">
          <div className="space-y-1.5 px-1">
            {Array.from({ length: keyCount }).map((_, i) => {
              const keyConfig = panelKeys.find((k) => k.keyIndex === i)
              return (
                <PanelKeyEditor
                  key={i}
                  keyConfig={keyConfig}
                  keyIndex={i}
                  lightingDevices={lightingDevices}
                  panelNodeId={node.id}
                  sceneNodes={sceneNodes}
                />
              )
            })}
          </div>
        </PanelSection>
      )}

      {/* 操作 */}
      <PanelSection defaultExpanded={false} title="操作">
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-red-400 text-xs transition-colors hover:bg-red-500/10"
          onClick={handleDelete}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          删除设备
        </button>
      </PanelSection>
    </PanelWrapper>
  )
}
