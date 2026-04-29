'use client'

import { type AnyNode, type DeviceNode, useScene } from '@pascal-app/core'
import type { SceneNodeType } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { getDeviceDefinition, getSubsystemColor, getSubsystemLabel } from '@vilhil/smarthome'
import {
  type CircuitInfo,
  getCircuitNumber,
  getEffectiveCircuitId,
  getLightCircuits,
  listCircuitMembers,
  removeDevice,
  separateLightToOwnCircuit,
  setCircuitMeta,
  setDeviceParams,
  setDeviceState,
  setPanelKeyConfig,
  toggleDevice,
  type PanelKeyConfig,
} from '@vilhil/smarthome'
import useEditor from '../../../store/use-editor'
import { ChevronDown, Link2, Pencil, Sparkles, ToggleLeft, Trash2, Unlink, X, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../../lib/utils'
import { Button } from '../primitives/button'
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { PanelSection } from '../controls/panel-section'
import { SegmentedControl } from '../controls/segmented-control'
import { SliderControl } from '../controls/slider-control'
import { ToggleControl } from '../controls/toggle-control'
import { PanelWrapper } from './panel-wrapper'

// ─── 面板按键编辑器 ──────────────────────────────────────────────────────────

type ActionMode = 'toggle' | 'scene'
/** toggle 模式下的目标选择方式 —— 回路优先（推荐），fallback 手工勾灯。 */
type ToggleTarget = 'circuit' | 'devices'

interface PanelKeyEditorProps {
  panelNodeId: string
  keyIndex: number
  keyConfig: PanelKeyConfig | undefined
  lightingDevices: DeviceNode[]
  sceneNodes: SceneNodeType[]
  /** 面板所在楼层 —— 用于查回路列表（回路是 level-scoped） */
  circuits: CircuitInfo[]
}

function PanelKeyEditor({
  panelNodeId,
  keyIndex,
  keyConfig,
  lightingDevices,
  sceneNodes,
  circuits,
}: PanelKeyEditorProps) {
  const [expanded, setExpanded] = useState(false)

  // 当前动作类型
  const currentMode: ActionMode = useMemo(() => {
    if (!keyConfig) return 'toggle'
    return keyConfig.action.type === 'scene' ? 'scene' : 'toggle'
  }, [keyConfig])

  const [mode, setMode] = useState<ActionMode>(currentMode)

  // toggle 模式下的目标选择方式：按回路（有 circuitId）还是按设备（有 deviceIds）
  const currentTarget: ToggleTarget = useMemo(() => {
    if (!keyConfig) return 'circuit'
    const a = keyConfig.action
    if ((a.type === 'toggle' || a.type === 'set') && a.circuitId) return 'circuit'
    if ((a.type === 'toggle' || a.type === 'set') && (a.deviceIds?.length ?? 0) > 0) return 'devices'
    return 'circuit'
  }, [keyConfig])

  const [target, setTarget] = useState<ToggleTarget>(currentTarget)

  // 已绑回路 id（circuit 模式）
  const linkedCircuitId: string | null = useMemo(() => {
    if (!keyConfig) return null
    const a = keyConfig.action
    if ((a.type === 'toggle' || a.type === 'set') && a.circuitId) return a.circuitId
    return null
  }, [keyConfig])

  // 已联动的灯具 ID（devices 模式）
  const linkedLightIds: string[] = useMemo(() => {
    if (!keyConfig) return []
    const a = keyConfig.action
    if (a.type === 'toggle' || a.type === 'set') return a.deviceIds ?? []
    return []
  }, [keyConfig])

  // 已绑定的场景 ID（scene 模式）
  const linkedSceneId: string | null = useMemo(() => {
    if (!keyConfig || keyConfig.action.type !== 'scene') return null
    return keyConfig.action.sceneId
  }, [keyConfig])

  const isConfigured =
    (mode === 'toggle' && target === 'circuit' && linkedCircuitId !== null) ||
    (mode === 'toggle' && target === 'devices' && linkedLightIds.length > 0) ||
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

  // 回路模式：选一个回路作为按键目标。比手工勾灯语义更稳（回路增减灯不用改配置）。
  // deviceIds 传空数组 —— 运行时 `_resolveTargets` 见 circuitId 就忽略 deviceIds；
  // schema 的 deviceIds 有 .default([])，但类型层依然要求字段存在，显式传以避免 TS 噪音。
  const handleLinkCircuit = useCallback(
    (circuit: CircuitInfo) => {
      setPanelKeyConfig(panelNodeId, keyIndex, {
        label: keyConfig?.label || circuit.displayName,
        action: { type: 'toggle', circuitId: circuit.circuitId, deviceIds: [] },
      })
    },
    [panelNodeId, keyIndex, keyConfig],
  )

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

  const handleTargetSwitch = useCallback(
    (newTarget: ToggleTarget) => {
      setTarget(newTarget)
      // 回路 ↔ 设备 切换时清掉已有配置，避免一条按键同时挂 circuitId + deviceIds 歧义
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
    // toggle / set 分支：优先显示回路信息；否则设备数
    if (action.type === 'toggle' || action.type === 'set') {
      if (action.circuitId) {
        const c = circuits.find((x) => x.circuitId === action.circuitId)
        if (c) return `→ ${c.displayName}（${c.members.length} 盏）`
        return '→ 回路已失效'
      }
      const ids = action.deviceIds ?? []
      return `联动 ${ids.length} 个灯具`
    }
    return '未配置'
  }, [keyConfig, sceneNodes, circuits])

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-accent/10">
      {/* 按键头部 */}
      <Button variant="ghost"
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
      </Button>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-border/50 border-t px-2 py-2 space-y-2">
          {/* 模式切换 */}
          <div className="flex rounded-md border border-border/50 bg-accent/20 p-0.5">
            <Button variant="ghost"
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
            </Button>
            <Button variant="ghost"
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
            </Button>
          </div>

          {/* 切换灯光模式 */}
          {mode === 'toggle' && (
            <>
              {/* 目标选择：按回路（推荐） vs 按设备（手工勾选） */}
              <div className="flex rounded-md border border-border/50 bg-accent/10 p-0.5">
                <Button
                  variant="ghost"
                  className={cn(
                    'flex-1 rounded py-0.5 text-[10px] font-medium transition-all',
                    target === 'circuit'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => target !== 'circuit' && handleTargetSwitch('circuit')}
                  type="button"
                >
                  按回路
                </Button>
                <Button
                  variant="ghost"
                  className={cn(
                    'flex-1 rounded py-0.5 text-[10px] font-medium transition-all',
                    target === 'devices'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => target !== 'devices' && handleTargetSwitch('devices')}
                  type="button"
                >
                  按设备
                </Button>
              </div>

              {/* 回路选择 —— 一条按键挂一条回路；回路里增减灯不用改按键配置 */}
              {target === 'circuit' && (
                <>
                  {circuits.length === 0 ? (
                    <p className="py-1 text-center text-[10px] text-muted-foreground">
                      当前楼层没有回路（先在 2D 画几盏灯）
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {circuits.map((c) => {
                        const isSel = linkedCircuitId === c.circuitId
                        return (
                          <Button
                            variant="ghost"
                            className={cn(
                              'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors',
                              isSel
                                ? 'bg-primary/15 ring-1 ring-primary/40 text-foreground'
                                : 'text-muted-foreground hover:bg-accent/30',
                            )}
                            key={c.circuitId}
                            onClick={() => handleLinkCircuit(c)}
                            type="button"
                          >
                            <span
                              className={cn(
                                'flex h-5 min-w-[28px] items-center justify-center rounded px-1.5 text-[10px] font-bold',
                                isSel
                                  ? 'bg-primary text-white'
                                  : 'bg-accent text-muted-foreground',
                              )}
                            >
                              #{c.number}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[11px]">
                              {c.members.length} 盏灯
                              {c.isImplicit && (
                                <span className="ml-1 text-[9px] text-muted-foreground/70">
                                  （单灯）
                                </span>
                              )}
                            </span>
                            {isSel && <Zap className="h-3 w-3 shrink-0 text-primary" />}
                          </Button>
                        )
                      })}
                    </div>
                  )}
                  {isConfigured && target === 'circuit' && (
                    <Button
                      variant="ghost"
                      className="flex w-full items-center justify-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
                      onClick={handleClear}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                      解除绑定
                    </Button>
                  )}
                </>
              )}

              {target === 'devices' && lightingDevices.length === 0 ? (
                <p className="py-1 text-center text-[10px] text-muted-foreground">
                  场景中没有灯光设备
                </p>
              ) : target === 'devices' ? (
                <div className="space-y-1" data-devices-list>
                  {lightingDevices.map((device) => {
                    const isIncluded = linkedLightIds.includes(device.id)
                    return (
                      <Button variant="ghost"
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
                      </Button>
                    )
                  })}
                </div>
              ) : null}

              {target === 'devices' && lightingDevices.length > 0 && (
                <div className="flex items-center gap-1 pt-0.5">
                  <Button variant="ghost"
                    className="flex-1 rounded-md bg-accent/40 px-2 py-1 text-[10px] font-medium transition-colors hover:bg-accent"
                    onClick={handleLinkAllLights}
                    type="button"
                  >
                    全选
                  </Button>
                  {isConfigured && (
                    <Button variant="ghost"
                      className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
                      onClick={handleClear}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                      清除
                    </Button>
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
                      <Button variant="ghost"
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
                      </Button>
                    )
                  })}
                </div>
              )}
              {isConfigured && (
                <Button variant="ghost"
                  className="flex w-full items-center justify-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
                  onClick={handleClear}
                  type="button"
                >
                  <X className="h-3 w-3" />
                  解除绑定
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── DevicePanel 主组件 ───────────────────────────────────────────────────────

/**
 * 判断设备大类 —— subsystem + catalog 细分组合，用来决定显示哪些控件。
 *
 * subsystem 只有 9 个大类，细分产品（如"摄像头/门锁"都属 security、
 * "AP/路由器/机柜"都属 network）要靠 productId 或 deviceDef.type 分流。
 */
function classifyDevice(node: DeviceNode, def: ReturnType<typeof getDeviceDefinition>) {
  const sub = node.subsystem
  const pid = node.productId ?? ''
  const type = def?.type
  return {
    subsystem: sub,
    // lighting / panel 已有独立逻辑
    isLighting: sub === 'lighting',
    isPanel: sub === 'panel',
    // hvac
    isHvac: sub === 'hvac',
    isThermostat: sub === 'hvac' && type === 'panel',
    // curtain
    isCurtain: sub === 'curtain',
    // 用 renderType（运行时）判断百叶 —— 切换窗帘类型只改 renderType，
    // 不动 productId（保留出厂规格），所以判断必须基于 renderType 才能跟得上切换。
    isVenetian: (node.renderType ?? '').includes('venetian'),
    // security
    isLock: sub === 'security' && (type === 'lock' || pid.includes('DOOR-LOCK')),
    isCamera: sub === 'security' && (type === 'sensor' || pid.includes('CAMERA')),
    // sensor
    isSensor: sub === 'sensor',
    // av
    isAv: sub === 'av',
    // network
    isNetwork: sub === 'network',
    isAp: sub === 'network' && type === 'ap',
    // architecture
    isArchitecture: sub === 'architecture',
  }
}

type DeviceClass = ReturnType<typeof classifyDevice>

/** 决定某类设备是否应该显示"开关"控件（被动传感器/机柜这类没有 on 概念） */
function hasOnOff(c: DeviceClass): boolean {
  // 传感器、面板、机柜、路由器等没有用户可控的 on/off
  if (c.isPanel) return false
  if (c.isSensor) return false
  // 网络里的"AP / 路由器"有开关概念；机柜/交换机不强调
  if (c.isNetwork && !c.isAp) return false
  return true
}

/** 决定是否应该显示"朝向"（direction） */
function hasDirection(c: DeviceClass, node: DeviceNode): boolean {
  // 明确有方向的：摄像头、定向 AP、窗帘（朝向房间的方向）、壁灯、HVAC 出风口
  if (c.isCamera) return true
  if (c.isCurtain) return true
  if (c.isHvac && node.productId !== 'HVAC-THERMOSTAT') return true
  // 壁挂设备普遍有方向（背靠墙朝房间）
  if (node.mountType === 'wall' || node.mountType === 'wall_switch') return true
  return false
}

/** 决定是否显示"覆盖半径"（AP / PIR / Camera） */
function hasCoverage(c: DeviceClass): boolean {
  return c.isAp || c.isCamera || (c.isSensor && true)
}

// ─── 窗帘配置面板（类型切换 + 关联窗户）──────────────────────────────────────
//
// 窗帘和其它设备的关键差异：必须知道"装在哪扇窗"才能正确渲染——CurtainContainer
// 通过 params.openingId 找窗户/墙，没绑定就走 fallback 几何（位置不准）。
// 所以编辑器侧必须有：
//   1. 类型切换（4 类窗帘可互换）
//   2. 关联窗户（绑定 params.openingId）

const CURTAIN_TYPE_OPTIONS = [
  { label: '对开', value: 'curtain-side-open' as const },
  { label: '卷帘', value: 'curtain-roller' as const },
  { label: '百叶', value: 'curtain-venetian' as const },
  { label: '罗马', value: 'curtain-roman' as const },
]
type CurtainRenderType = (typeof CURTAIN_TYPE_OPTIONS)[number]['value']

function CurtainConfigPanel({ node }: { node: DeviceNode }) {
  const updateNode = useScene((s) => s.updateNode)
  const sceneNodes = useScene((s) => s.nodes)

  // 当前楼层（curtain 的 parentId 就是 level id）
  const levelId = node.parentId as string | null

  // 找当前楼层所有 window 节点：window.wallId → wall.parentId === levelId
  const windowsOnLevel = useScene((s) => {
    if (!levelId) return [] as Array<{ id: string; name: string; wallId: string }>
    const allNodes = Object.values(s.nodes)
    const wallsOnLevel = new Set<string>()
    for (const n of allNodes) {
      if ((n as { type?: string }).type === 'wall' && (n as { parentId?: string }).parentId === levelId) {
        wallsOnLevel.add((n as { id: string }).id)
      }
    }
    const out: Array<{ id: string; name: string; wallId: string }> = []
    for (const n of allNodes) {
      const nn = n as { type?: string; id?: string; name?: string; wallId?: string }
      if (nn.type !== 'window' || !nn.id || !nn.wallId) continue
      if (!wallsOnLevel.has(nn.wallId)) continue
      out.push({ id: nn.id, name: nn.name ?? `窗 ${nn.id.slice(-4)}`, wallId: nn.wallId })
    }
    return out
  })

  const currentType = (node.renderType ?? 'curtain-side-open') as CurtainRenderType
  const currentOpeningId = (node.params?.openingId as string | undefined) ?? null

  const handleChangeType = useCallback(
    (v: CurtainRenderType) => {
      updateNode(node.id as never, { renderType: v } as never)
    },
    [updateNode, node.id],
  )

  /**
   * 【硬绑定】绑窗户时同步：
   *   1. 写 params.openingId
   *   2. 把 curtain.position 移到窗户世界中心（解绑后位置一致，不会跳回最初点）
   *   3. 把 params.curtainWidth 锁到窗户宽度（unbind 后宽度也对）
   */
  const handleBindWindow = useCallback(
    (windowId: string | null) => {
      const nextParams = { ...(node.params ?? {}) } as Record<string, unknown>
      if (!windowId) {
        // 解绑：仅删 openingId，position/width 保留（用户可后续自调）
        delete nextParams.openingId
        setDeviceParams(node.id as never, nextParams as never)
        return
      }
      // 绑定：先算窗户世界中心 + 宽度
      const win = sceneNodes[windowId as keyof typeof sceneNodes] as
        | { type?: string; wallId?: string; position?: [number, number, number]; width?: number; height?: number }
        | undefined
      if (!win || win.type !== 'window' || !win.wallId) {
        // 数据异常 fallback：只写 openingId
        nextParams.openingId = windowId
        setDeviceParams(node.id as never, nextParams as never)
        return
      }
      const wall = sceneNodes[win.wallId as keyof typeof sceneNodes] as
        | { type?: string; start?: [number, number]; end?: [number, number] }
        | undefined
      if (!wall || wall.type !== 'wall' || !wall.start || !wall.end) {
        nextParams.openingId = windowId
        setDeviceParams(node.id as never, nextParams as never)
        return
      }
      // 沿墙距起点 (window.position[0]) → 世界 XZ 中心
      const [sx, sz] = wall.start
      const [ex, ez] = wall.end
      const wallLen = Math.hypot(ex - sx, ez - sz)
      const u = wallLen > 0.001 ? (win.position?.[0] ?? 0) / wallLen : 0
      const cx = sx + (ex - sx) * u
      const cz = sz + (ez - sz) * u
      const cy = win.position?.[1] ?? 1.2

      nextParams.openingId = windowId
      nextParams.curtainWidth = win.width ?? 1.8
      setDeviceParams(node.id as never, nextParams as never)
      // 同步位置 —— updateNode 会触发渲染重计算 + 持久化到 store
      updateNode(node.id as never, { position: [cx, cy, cz] } as never)
    },
    [sceneNodes, node.id, node.params, updateNode],
  )

  return (
    <>
      <PanelSection title="窗帘类型">
        <SegmentedControl
          value={currentType}
          onChange={handleChangeType}
          options={CURTAIN_TYPE_OPTIONS}
        />
      </PanelSection>

      <PanelSection title="关联窗户">
        {windowsOnLevel.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            当前楼层没有窗户。先去结构工具画一扇窗，再回来绑定。
          </p>
        ) : (
          <div className="space-y-1">
            {/* 解绑选项 —— 让用户能把窗帘"脱离"窗户回到原始位置 */}
            <Button
              variant="ghost"
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                !currentOpeningId
                  ? 'bg-accent/40 ring-1 ring-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/30',
              )}
              onClick={() => handleBindWindow(null)}
              type="button"
            >
              <Unlink className="h-3 w-3 shrink-0" />
              <span className="flex-1 truncate text-[11px] font-medium">未绑定</span>
            </Button>
            {windowsOnLevel.map((w) => {
              const isSelected = currentOpeningId === w.id
              return (
                <Button
                  variant="ghost"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    isSelected
                      ? 'bg-emerald-500/15 ring-1 ring-emerald-500/30 text-foreground'
                      : 'text-muted-foreground hover:bg-accent/30',
                  )}
                  key={w.id}
                  onClick={() => handleBindWindow(w.id)}
                  type="button"
                >
                  <Link2 className="h-3 w-3 shrink-0" />
                  <span className="flex-1 truncate text-[11px] font-medium">{w.name}</span>
                  {isSelected && <Zap className="h-3 w-3 shrink-0 text-emerald-400" />}
                </Button>
              )
            })}
          </div>
        )}
      </PanelSection>
    </>
  )
}

export function DevicePanel() {
  const selectedIds = useViewer((s: any) => s.selection.selectedIds)
  const setSelection = useViewer((s: any) => s.setSelection)
  const nodes = useScene((s) => s.nodes)
  const updateNode = useScene((s) => s.updateNode)

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

  // 修改安装高度（params.direction 以外的 position.y 没有专用工具函数，直接 updateNode）
  const handleHeightChange = useCallback(
    (y: number) => {
      if (!node) return
      updateNode(node.id, { position: [node.position[0], y, node.position[2]] } as any)
    },
    [node, updateNode],
  )

  if (!node) return null

  const state = (node.state as Record<string, unknown>) ?? {}
  const params = node.params ?? {}
  const klass = classifyDevice(node, deviceDef)
  // productMeta（品牌/型号/功耗/售价等）当前不展示，留在 deviceDef 里供未来 BOM 视图使用
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

  // 面板所在楼层的回路列表（按键的"按回路"模式用）
  // 面板 DeviceNode.parentId 就是 LevelNode.id。
  const panelLevelId = (node.parentId as string | null) ?? null
  const circuits = useMemo(
    () => getLightCircuits(panelLevelId),
    // 依赖 nodes 保证回路成员变化时重算（回路增减灯时 UI 的"K 盏"跟着变）
    [panelLevelId, nodes],
  )

  // 场景节点（供按键触发场景选择）
  const sceneNodes = Object.values(nodes).filter(
    (n): n is SceneNodeType => n?.type === 'scene',
  )

  // AP WiFi 参数（存在 params.custom.wifi；热力图已读这个字段）
  const wifi = ((params.custom as { wifi?: Record<string, unknown> } | undefined)?.wifi ?? {}) as {
    txPower?: number
    antennaGain?: number
    freq?: '2.4' | '5'
  }
  const setWifi = (patch: Partial<typeof wifi>) => {
    setDeviceParams(node.id, {
      custom: {
        ...((params.custom as Record<string, unknown>) ?? {}),
        wifi: { ...wifi, ...patch },
      },
    } as any)
  }

  const isOn = (state.on as boolean | undefined) ?? false
  const hasSubsystemState =
    klass.isLighting || klass.isHvac || klass.isCurtain || klass.isLock || klass.isAv ||
    klass.isSensor || hasOnOff(klass)

  return (
    <PanelWrapper
      icon="/icons/appliance.png"
      onClose={handleClose}
      title={node.productName ?? deviceDef?.name ?? '智能设备'}
      width={280}
    >
      {/* 类型 —— 和墙/门一样用一行简明描述来定位这件"家具" */}
      <PanelSection title="类型">
        <div className="flex items-center gap-2 px-1">
          <div
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: subsystemColor }}
          />
          <span className="text-foreground text-xs">{subsystemLabel}</span>
          <span className="ml-auto text-muted-foreground text-[10px] uppercase tracking-wider">{node.mountType}</span>
        </div>
        {deviceDef?.description && (
          <p className="px-1 pt-1 text-muted-foreground text-[11px] leading-relaxed">{deviceDef.description}</p>
        )}
      </PanelSection>

      {/* 状态 —— subsystem-aware */}
      {hasSubsystemState && (
        <PanelSection title="状态">
          {hasOnOff(klass) && (
            <ToggleControl
              label="开启"
              checked={isOn}
              onChange={() => toggleDevice(node.id)}
            />
          )}

          {klass.isLighting && (
            <>
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
            </>
          )}

          {klass.isHvac && (
            <div className="flex flex-col gap-2 px-1 pb-1">
              <div className="space-y-1">
                <span className="font-medium text-[10px] text-muted-foreground/80 uppercase tracking-wider">
                  模式
                </span>
                <SegmentedControl
                  value={((state.mode as string | undefined) ?? 'auto') as 'cool' | 'heat' | 'fan' | 'dry' | 'auto'}
                  onChange={(v) => setDeviceState(node.id, { mode: v })}
                  options={[
                    { label: '制冷', value: 'cool' },
                    { label: '制热', value: 'heat' },
                    { label: '送风', value: 'fan' },
                    { label: '除湿', value: 'dry' },
                    { label: '自动', value: 'auto' },
                  ]}
                />
              </div>
              <SliderControl
                label="目标温度"
                max={30}
                min={16}
                onChange={(v) => setDeviceState(node.id, { targetTemp: v })}
                precision={0}
                step={1}
                unit="°C"
                value={(state.targetTemp as number) ?? 24}
              />
              <div className="space-y-1">
                <span className="font-medium text-[10px] text-muted-foreground/80 uppercase tracking-wider">
                  风速
                </span>
                <SegmentedControl
                  value={((state.fanSpeed as string | undefined) ?? 'auto') as 'low' | 'medium' | 'high' | 'auto'}
                  onChange={(v) => setDeviceState(node.id, { fanSpeed: v })}
                  options={[
                    { label: '低', value: 'low' },
                    { label: '中', value: 'medium' },
                    { label: '高', value: 'high' },
                    { label: '自动', value: 'auto' },
                  ]}
                />
              </div>
            </div>
          )}

          {klass.isCurtain && (
            <>
              <SliderControl
                label="开合度"
                max={100}
                min={0}
                onChange={(v) => setDeviceState(node.id, { position: v })}
                precision={0}
                step={1}
                unit="%"
                value={(state.position as number) ?? 0}
              />
              {klass.isVenetian && (
                <SliderControl
                  label="叶片角度"
                  max={90}
                  min={0}
                  onChange={(v) => setDeviceState(node.id, { angle: v })}
                  precision={0}
                  step={5}
                  unit="°"
                  value={(state.angle as number) ?? 0}
                />
              )}
            </>
          )}

          {klass.isLock && (
            <ToggleControl
              label="锁定"
              checked={(state.locked as boolean | undefined) ?? true}
              onChange={(v) => setDeviceState(node.id, { locked: v })}
            />
          )}

          {klass.isAv && (
            <SliderControl
              label="音量"
              max={100}
              min={0}
              onChange={(v) => setDeviceState(node.id, { volume: v })}
              precision={0}
              step={5}
              unit="%"
              value={(state.volume as number) ?? 60}
            />
          )}

          {klass.isSensor && (
            <div
              className={cn(
                'flex h-10 w-full items-center justify-between rounded-lg border px-3 text-sm',
                (state.triggered as boolean | undefined)
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-border/50 bg-accent/70 text-muted-foreground',
              )}
            >
              <span>触发状态</span>
              <span className="text-xs font-medium">
                {(state.triggered as boolean | undefined) ? '触发中' : '静默'}
              </span>
            </div>
          )}
        </PanelSection>
      )}

      {/* 窗帘专用配置 —— 类型切换 + 关联窗户 */}
      {klass.isCurtain && <CurtainConfigPanel node={node} />}

      {/* 尺寸 —— 像墙/门那样用物理长度描述设备在空间中的占位 */}
      <PanelSection title="尺寸">
        <SliderControl
          label="安装高度"
          max={8}
          min={0}
          onChange={handleHeightChange}
          precision={2}
          step={0.05}
          unit="m"
          value={Math.round(node.position[1] * 100) / 100}
        />
        {klass.isLighting && (
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
        )}
        {hasCoverage(klass) && (
          <SliderControl
            label="覆盖半径"
            max={20}
            min={1}
            onChange={(v) => setDeviceParams(node.id, { coverageRadius: v })}
            precision={1}
            step={0.5}
            unit="m"
            value={(params.coverageRadius as number | undefined) ?? deviceDef?.coverageRadius ?? 5}
          />
        )}
        {klass.isCamera && (
          <SliderControl
            label="视场角"
            max={180}
            min={30}
            onChange={(v) => setDeviceParams(node.id, { coverageAngle: v })}
            precision={0}
            step={5}
            unit="°"
            value={(params.coverageAngle as number | undefined) ?? 90}
          />
        )}
        {klass.isCurtain && (
          <SliderControl
            label="窗帘宽度"
            max={5}
            min={0.6}
            onChange={(v) => setDeviceParams(node.id, { curtainWidth: v })}
            precision={2}
            step={0.1}
            unit="m"
            value={(params.curtainWidth as number | undefined) ?? 1.8}
          />
        )}
      </PanelSection>

      {/* 朝向 —— 仅对"有方向感"的设备显示（相机 / AP / 壁挂、HVAC 出风口、窗帘等） */}
      {hasDirection(klass, node) && (
        <PanelSection title="朝向">
          <SliderControl
            label="角度"
            max={360}
            min={-180}
            onChange={(v) => setDeviceParams(node.id, { direction: v })}
            precision={0}
            step={5}
            unit="°"
            value={Math.round((params.direction as number | undefined) ?? 0)}
          />
        </PanelSection>
      )}

      {/* 灯带发光朝向 —— 只对已画线的灯带显示。放完灯带后可以随时切 omni/down/up/wall，
          不用重画。渲染端 LightStripGeometry 立刻响应（useMemo 已依赖 emissionDirection）。
          AI 也可以直接调 setDeviceParams 写 emissionDirection 自动调整。*/}
      {klass.isLighting &&
        Array.isArray(params.path) &&
        (params.path as unknown[]).length >= 2 && (
          <PanelSection title="发光朝向">
            <SegmentedControl
              value={
                ((params.emissionDirection as string | undefined) ?? 'omni') as
                  | 'down'
                  | 'up'
                  | 'wall'
                  | 'omni'
              }
              onChange={(v) =>
                setDeviceParams(node.id, { emissionDirection: v })
              }
              options={[
                { label: '全向', value: 'omni' },
                { label: '向下', value: 'down' },
                { label: '向上', value: 'up' },
                { label: '洗墙', value: 'wall' },
              ]}
            />
          </PanelSection>
        )}

      {/* 频段（仅 AP） */}
      {klass.isAp && (
        <PanelSection title="频段">
          <SegmentedControl
            value={(wifi.freq ?? '5') as '2.4' | '5'}
            onChange={(v) => setWifi({ freq: v })}
            options={[
              { label: '2.4 GHz', value: '2.4' },
              { label: '5 GHz', value: '5' },
            ]}
          />
          <p className="px-1 pt-0.5 text-[10px] text-muted-foreground">
            2.4 GHz 穿墙更强但速率低，5 GHz 速度快但衰减快。
          </p>
        </PanelSection>
      )}

      {/* 按键（仅 panel 子系统） */}
      {klass.isPanel && (
        <PanelSection title="按键">
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: keyCount }).map((_, i) => {
              const keyConfig = panelKeys.find((k) => k.keyIndex === i)
              return (
                <PanelKeyEditor
                  key={i}
                  circuits={circuits}
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

      {/* 回路（仅灯光） —— 显示当前回路 + 同回路灯数 + 连接/独立操作 */}
      {klass.isLighting && (
        <CircuitSection node={node} />
      )}

      {/* 操作 —— 复用墙/门的 ActionGroup 风格 */}
      <PanelSection title="操作">
        <ActionGroup>
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

// ─── 回路 Section（仅 lighting 子系统）─────────────────────────────────────
//
// 设计意图：让设计师"一眼看见这盏灯属于哪条回路、回路里有几盏灯"，
// 然后两个动作搞定回路调整：
//   - 连接：选另一盏灯 → 两条回路合并
//   - 独立：把这盏灯从当前回路剥出来自成一回路
// ───────────────────────────────────────────────────────────────────────────
/** 回路徽章预设色 —— 默认 lighting 子系统色 + 7 个对比鲜明的辅助色 */
const CIRCUIT_COLOR_PALETTE: { color: string; label: string }[] = [
  { color: '#d4a853', label: '默认（黄）' }, // lighting 子系统色
  { color: '#f59e0b', label: '橙' },
  { color: '#ef4444', label: '红' },
  { color: '#8b5cf6', label: '紫' },
  { color: '#3b82f6', label: '蓝' },
  { color: '#10b981', label: '绿' },
  { color: '#ec4899', label: '粉' },
  { color: '#94a3b8', label: '灰' },
]

const DEFAULT_CIRCUIT_COLOR = '#d4a853' // lighting subsystem color

function CircuitSection({ node }: { node: DeviceNode }) {
  const setSelection = useViewer((s: any) => s.setSelection)
  const levelId = useViewer((s: any) => s.selection.levelId) as string | null
  // 订阅整个 nodes 触发重渲染（其它灯变更时本面板里的"回路 N"也要更新）
  useScene((s) => s.nodes)
  const linkSourceId = useEditor((s) => s.circuitLinkSourceId)
  const setCircuitLinkSourceId = useEditor((s) => s.setCircuitLinkSourceId)

  // 有效回路 id —— 没显式 circuitId 也用 device.id fallback
  // （正常情况楼层切换时已经被 assignMissingCircuitIds 回填了，fallback 是兜底）
  const effectiveCircuitId = getEffectiveCircuitId(node)
  const circuitNumber = getCircuitNumber(node.id, levelId)
  const members = useMemo(
    () => listCircuitMembers(effectiveCircuitId),
    [effectiveCircuitId],
  )
  const memberCount = members.length

  // 回路自定义元数据（name / color），从 LevelNode.circuitMeta 取
  const circuitInfo = useMemo(() => {
    const list = getLightCircuits(levelId)
    return list.find((c) => c.circuitId === effectiveCircuitId)
  }, [levelId, effectiveCircuitId])
  const customName = circuitInfo?.name ?? ''
  const customColor = circuitInfo?.color ?? DEFAULT_CIRCUIT_COLOR
  const fallbackName = circuitNumber !== null ? `回路 ${circuitNumber}` : '回路 —'

  // 重命名输入：本地 draft，blur / Enter 时落到 store —— 避免每个字符触发 update
  const [nameDraft, setNameDraft] = useState<string>(customName)
  // 切到另一条回路时同步外部值
  useEffect(() => {
    setNameDraft(customName)
  }, [customName, effectiveCircuitId])

  const commitName = useCallback(() => {
    if (!levelId) return
    const trimmed = nameDraft.trim()
    if (trimmed === customName) return
    setCircuitMeta(levelId, effectiveCircuitId, { name: trimmed })
  }, [levelId, effectiveCircuitId, nameDraft, customName])

  const handlePickColor = useCallback(
    (color: string) => {
      if (!levelId) return
      // 选默认色等于"清掉自定义色"，让回路徽章回到全局默认
      const normalized = color === DEFAULT_CIRCUIT_COLOR ? '' : color
      setCircuitMeta(levelId, effectiveCircuitId, { color: normalized })
    },
    [levelId, effectiveCircuitId],
  )

  const isLinkPicking = linkSourceId === node.id

  const handleStartLink = useCallback(() => {
    setCircuitLinkSourceId(node.id)
  }, [node.id, setCircuitLinkSourceId])

  const handleSeparate = useCallback(() => {
    separateLightToOwnCircuit(node.id)
  }, [node.id])

  return (
    <PanelSection title="回路">
      {/* 重命名行：颜色徽章（点开 popover 选色）+ 内联输入框 + 成员数 */}
      <div className="flex items-center gap-2 px-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/40 p-0 hover:scale-105 transition-transform"
              style={{ backgroundColor: customColor }}
              title={`回路颜色 · 点击修改`}
              type="button"
            >
              <span className="font-bold text-[10px] text-black/70">
                {circuitNumber ?? '–'}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <div className="grid grid-cols-4 gap-1.5">
              {CIRCUIT_COLOR_PALETTE.map((c) => {
                const isActive =
                  customColor.toLowerCase() === c.color.toLowerCase() ||
                  (c.color === DEFAULT_CIRCUIT_COLOR && !circuitInfo?.color)
                return (
                  <Button
                    variant="ghost"
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full p-0 transition-all hover:scale-110',
                      isActive && 'ring-2 ring-foreground/60 ring-offset-1 ring-offset-background',
                    )}
                    key={c.color}
                    onClick={() => handlePickColor(c.color)}
                    style={{ backgroundColor: c.color }}
                    title={c.label}
                    type="button"
                  />
                )
              })}
            </div>
          </PopoverContent>
        </Popover>

        <input
          aria-label="回路名"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-foreground hover:border-border/40 focus:border-border focus:bg-background focus:outline-none"
          onBlur={commitName}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              ;(e.target as HTMLInputElement).blur()
            } else if (e.key === 'Escape') {
              setNameDraft(customName)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          placeholder={fallbackName}
          type="text"
          value={nameDraft}
        />

        <span className="shrink-0 text-muted-foreground text-[10px]">
          {memberCount > 1 ? `${memberCount} 盏` : '1 盏'}
        </span>

        {memberCount > 1 && (
          <Button
            variant="ghost"
            className="h-6 shrink-0 rounded-md px-1.5 text-[10px] text-muted-foreground hover:bg-accent"
            onClick={() => {
              setSelection({ selectedIds: members.map((m) => m.id) })
            }}
            title="选中本回路全部灯具"
            type="button"
          >
            全选
          </Button>
        )}
      </div>

      {isLinkPicking && (
        <p className="mt-1 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
          点击另一盏灯合并回路 · 点空白取消
        </p>
      )}

      <ActionGroup className="mt-1">
        <ActionButton
          className={cn(isLinkPicking && 'ring-1 ring-amber-500/60 bg-amber-500/10')}
          icon={<Link2 className="h-3.5 w-3.5" />}
          label={isLinkPicking ? '点另一盏灯…' : '连接'}
          onClick={handleStartLink}
        />
        {memberCount > 1 && (
          <ActionButton
            icon={<Unlink className="h-3.5 w-3.5" />}
            label="独立"
            onClick={handleSeparate}
          />
        )}
      </ActionGroup>
    </PanelSection>
  )
}
