'use client'

/**
 * SceneFlowEditor — React Flow 场景可视化编辑器
 *
 * 用节点图的方式展示和编辑场景的设备动作序列：
 *   触发器 → 设备动作 → 延时 → 设备动作 → ...
 *
 * 全屏遮罩覆盖在编辑器上方，保存后回写到 useScene store。
 */

import type { DeviceNode, SceneEffect, SceneNodeType } from '@pascal-app/core'
import { updateScene } from '@vilhil/smarthome'
import { getSubsystemColor, getSubsystemLabel } from '@vilhil/smarthome'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type { Connection, Edge, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Save, Timer, X, Zap } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { cn } from '../../../../../lib/utils'

// ═══════════════════════════════════════════════════════════════
// 节点数据类型
// ═══════════════════════════════════════════════════════════════

interface TriggerData extends Record<string, unknown> {
  name: string
  icon: string
}

interface DeviceData extends Record<string, unknown> {
  deviceId: string
  deviceName: string
  subsystem: string
  action: Record<string, unknown>
}

interface DelayData extends Record<string, unknown> {
  delayMs: number
}

type FlowNode =
  | Node<TriggerData, 'sceneTrigger'>
  | Node<DeviceData, 'deviceAction'>
  | Node<DelayData, 'delayControl'>

// ═══════════════════════════════════════════════════════════════
// 子系统颜色辅助
// ═══════════════════════════════════════════════════════════════

function subsystemStyle(subsystem: string) {
  const color = getSubsystemColor(subsystem as any) ?? '#94a3b8'
  return { borderColor: color, color }
}

// ═══════════════════════════════════════════════════════════════
// 节点组件
// ═══════════════════════════════════════════════════════════════

function SceneTriggerNode({ data, selected }: NodeProps<Node<TriggerData>>) {
  return (
    <div
      className={cn(
        'w-44 rounded-lg border-2 bg-[#0f1520] px-3 py-2.5 shadow-lg transition-shadow',
        selected ? 'shadow-[0_0_0_3px_rgba(45,127,249,0.35)]' : '',
      )}
      style={{ borderColor: '#2D7FF9' }}
    >
      <Handle
        position={Position.Left}
        style={{ opacity: 0 }}
        type="target"
      />
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
          style={{ background: 'rgba(45,127,249,0.18)', color: '#2D7FF9' }}
        >
          {data.icon ? data.icon.slice(0, 2) : <Zap size={13} />}
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold text-white text-xs leading-tight">
            {data.name || '场景'}
          </div>
          <div className="text-[10px]" style={{ color: '#2D7FF9' }}>
            场景触发器
          </div>
        </div>
      </div>
      <Handle
        position={Position.Right}
        style={{ background: '#2D7FF9', width: 8, height: 8 }}
        type="source"
      />
    </div>
  )
}

function DeviceActionNode({ data, selected }: NodeProps<Node<DeviceData>>) {
  const { borderColor, color } = subsystemStyle(data.subsystem)
  const subsystemLabel = getSubsystemLabel(data.subsystem as any)

  const actionParts: string[] = []
  const action = data.action
  if (action.on !== undefined) actionParts.push(action.on ? '开' : '关')
  if (typeof action.brightness === 'number') actionParts.push(`亮度 ${action.brightness}%`)
  if (typeof action.colorTemp === 'number') actionParts.push(`${action.colorTemp}K`)
  if (typeof action.position === 'number') actionParts.push(`开合 ${action.position}%`)

  return (
    <div
      className={cn(
        'w-44 rounded-lg border-2 bg-[#0f1520] px-3 py-2.5 shadow-lg transition-shadow',
        selected ? 'shadow-[0_0_0_3px_rgba(255,255,255,0.12)]' : '',
      )}
      style={{ borderColor: selected ? borderColor : 'rgba(255,255,255,0.12)' }}
    >
      <Handle
        position={Position.Left}
        style={{ background: borderColor, width: 8, height: 8 }}
        type="target"
      />
      <div className="truncate font-semibold text-white text-xs leading-tight">
        {data.deviceName}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          className="rounded px-1 py-0.5 text-[9px] font-medium"
          style={{ background: `${color}22`, color }}
        >
          {subsystemLabel}
        </span>
        {actionParts.length > 0 && (
          <span className="truncate text-[10px] text-white/50">
            {actionParts.join(' · ')}
          </span>
        )}
      </div>
      <Handle
        position={Position.Right}
        style={{ background: borderColor, width: 8, height: 8 }}
        type="source"
      />
    </div>
  )
}

function DelayControlNode({ data, selected }: NodeProps<Node<DelayData>>) {
  const seconds = ((data.delayMs ?? 1000) / 1000).toFixed(1).replace(/\.0$/, '')
  return (
    <div
      className={cn(
        'w-32 rounded-lg border-2 bg-[#0f1520] px-3 py-2 text-center shadow-lg',
        selected
          ? 'border-white/40 shadow-[0_0_0_3px_rgba(255,255,255,0.1)]'
          : 'border-white/15',
      )}
    >
      <Handle
        position={Position.Left}
        style={{ background: '#64748b', width: 8, height: 8 }}
        type="target"
      />
      <div className="flex items-center justify-center gap-1.5 text-white/50">
        <Timer size={12} />
        <span className="text-[11px] font-medium text-white/60">
          延时 {seconds}s
        </span>
      </div>
      <Handle
        position={Position.Right}
        style={{ background: '#64748b', width: 8, height: 8 }}
        type="source"
      />
    </div>
  )
}

const NODE_TYPES = {
  sceneTrigger: SceneTriggerNode,
  deviceAction: DeviceActionNode,
  delayControl: DelayControlNode,
} as const

// ═══════════════════════════════════════════════════════════════
// 转换：SceneEffect[] ↔ React Flow nodes/edges
// ═══════════════════════════════════════════════════════════════

function effectsToFlow(
  scene: SceneNodeType,
  devices: DeviceNode[],
): { nodes: FlowNode[]; edges: Edge[] } {
  const deviceById = new Map(devices.map((d) => [d.id, d]))
  const nodes: FlowNode[] = []
  const edges: Edge[] = []

  const triggerId = `trigger-${scene.id}`
  nodes.push({
    id: triggerId,
    type: 'sceneTrigger',
    position: { x: 0, y: 0 },
    data: { name: scene.name, icon: scene.icon ?? '' },
  } as Node<TriggerData, 'sceneTrigger'>)

  let prevId = triggerId
  let xOffset = 220

  for (let i = 0; i < scene.effects.length; i++) {
    const effect = scene.effects[i]!
    const device = deviceById.get(effect.deviceId as `device_${string}`)

    // 如果有延时（>0），先插入延时节点
    if (effect.delay > 0) {
      const delayId = `delay-${scene.id}-${i}`
      nodes.push({
        id: delayId,
        type: 'delayControl',
        position: { x: xOffset, y: 0 },
        data: { delayMs: effect.delay * 1000 },
      } as Node<DelayData, 'delayControl'>)
      edges.push({
        id: `e-${prevId}-${delayId}`,
        source: prevId,
        target: delayId,
        animated: true,
        style: { stroke: '#334155', strokeWidth: 2 },
      })
      prevId = delayId
      xOffset += 170
    }

    const actionId = `action-${scene.id}-${i}`
    nodes.push({
      id: actionId,
      type: 'deviceAction',
      position: { x: xOffset, y: 0 },
      data: {
        deviceId: effect.deviceId,
        deviceName:
          (device?.productName as string | undefined) ?? device?.productId ?? effect.deviceId,
        subsystem: device?.subsystem ?? 'architecture',
        action: (effect.state as Record<string, unknown>) ?? {},
      },
    } as Node<DeviceData, 'deviceAction'>)

    edges.push({
      id: `e-${prevId}-${actionId}`,
      source: prevId,
      target: actionId,
      animated: true,
      style: { stroke: '#334155', strokeWidth: 2 },
    })

    prevId = actionId
    xOffset += 210
  }

  return { nodes, edges }
}

function flowToEffects(nodes: FlowNode[], edges: Edge[]): SceneEffect[] {
  const trigger = nodes.find((n) => n.type === 'sceneTrigger')
  if (!trigger) return []

  const effects: SceneEffect[] = []
  const visited = new Set<string>()
  let currentId: string | null = trigger.id
  let pendingDelayMs = 0

  while (currentId) {
    const outEdge = edges.find((e) => e.source === currentId)
    if (!outEdge) break

    const next = nodes.find((n) => n.id === outEdge.target)
    if (!next || visited.has(next.id)) break
    visited.add(next.id)

    if (next.type === 'delayControl') {
      const delayNode = next as Node<DelayData, 'delayControl'>
      pendingDelayMs += delayNode.data.delayMs ?? 1000
    } else if (next.type === 'deviceAction') {
      const deviceNode = next as Node<DeviceData, 'deviceAction'>
      effects.push({
        deviceId: deviceNode.data.deviceId,
        state: deviceNode.data.action,
        delay: pendingDelayMs > 0 ? pendingDelayMs / 1000 : 0,
        duration: 0,
      })
      pendingDelayMs = 0
    }

    currentId = next.id
  }

  return effects
}

// ═══════════════════════════════════════════════════════════════
// 节点配置面板
// ═══════════════════════════════════════════════════════════════

const SCENE_ICONS = ['回家', '离家', '影院', '晨间', '睡眠', '会客', '阅读', '派对', '节能']

interface NodeConfigPanelProps {
  node: FlowNode
  devices: DeviceNode[]
  onChange: (data: Partial<Record<string, unknown>>) => void
}

function NodeConfigPanel({ node, devices, onChange }: NodeConfigPanelProps) {
  if (node.type === 'sceneTrigger') {
    const data = node.data as TriggerData
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">场景触发器</p>

        <div>
          <label className="mb-1.5 block text-[11px] text-white/50">场景名称</label>
          <input
            className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#2D7FF9]/60 focus:ring-1 focus:ring-[#2D7FF9]/30"
            onChange={(e) => onChange({ name: e.target.value })}
            type="text"
            value={data.name}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] text-white/50">场景类型</label>
          <div className="flex flex-wrap gap-1">
            {SCENE_ICONS.map((label) => (
              <button
                className={cn(
                  'rounded px-2 py-1 text-[11px] font-medium transition-all',
                  data.icon === label
                    ? 'bg-[#2D7FF9]/20 text-[#2D7FF9] ring-1 ring-[#2D7FF9]/40'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80',
                )}
                key={label}
                onClick={() => onChange({ icon: label })}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (node.type === 'deviceAction') {
    const data = node.data as DeviceData
    const action = data.action

    return (
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">设备动作</p>

        <div>
          <label className="mb-1.5 block text-[11px] text-white/50">设备</label>
          <select
            className="w-full rounded-md border border-white/10 bg-[#0f1520] px-2.5 py-1.5 text-sm text-white outline-none focus:border-[#2D7FF9]/60"
            onChange={(e) => {
              const device = devices.find((d) => d.id === e.target.value)
              if (!device) return
              onChange({
                deviceId: device.id,
                deviceName:
                  (device.productName as string | undefined) ?? device.productId,
                subsystem: device.subsystem,
              })
            }}
            value={data.deviceId}
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {(d.productName as string | undefined) ?? d.productId}
              </option>
            ))}
          </select>
        </div>

        {/* On/Off */}
        <div>
          <label className="mb-1.5 block text-[11px] text-white/50">开关</label>
          <div className="flex gap-1.5">
            {([true, false] as const).map((val) => (
              <button
                className={cn(
                  'flex-1 rounded-md py-1.5 text-xs font-medium transition-all',
                  action.on === val
                    ? 'bg-[#2D7FF9]/80 text-white'
                    : 'bg-white/5 text-white/40 hover:bg-white/10',
                )}
                key={String(val)}
                onClick={() => onChange({ action: { ...action, on: val } })}
                type="button"
              >
                {val ? '开' : '关'}
              </button>
            ))}
          </div>
        </div>

        {/* Brightness */}
        {typeof action.brightness === 'number' && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] text-white/50">亮度</label>
              <span className="text-[11px] tabular-nums text-white/60">{action.brightness}%</span>
            </div>
            <input
              className="h-1.5 w-full appearance-none rounded-full bg-white/10 accent-[#2D7FF9]"
              max={100}
              min={0}
              onChange={(e) =>
                onChange({ action: { ...action, brightness: Number(e.target.value) } })
              }
              step={5}
              type="range"
              value={action.brightness as number}
            />
          </div>
        )}

        {/* Color Temp */}
        {typeof action.colorTemp === 'number' && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] text-white/50">色温</label>
              <span className="text-[11px] tabular-nums text-white/60">{action.colorTemp}K</span>
            </div>
            <input
              className="h-1.5 w-full appearance-none rounded-full"
              max={6500}
              min={2700}
              onChange={(e) =>
                onChange({ action: { ...action, colorTemp: Number(e.target.value) } })
              }
              step={100}
              style={{ background: 'linear-gradient(to right, #ffb347, #fff5e0, #cceeff)' }}
              type="range"
              value={action.colorTemp as number}
            />
          </div>
        )}

        {/* Curtain position */}
        {typeof action.position === 'number' && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] text-white/50">开合度</label>
              <span className="text-[11px] tabular-nums text-white/60">{action.position}%</span>
            </div>
            <input
              className="h-1.5 w-full appearance-none rounded-full bg-white/10 accent-[#3dd9b6]"
              max={100}
              min={0}
              onChange={(e) =>
                onChange({ action: { ...action, position: Number(e.target.value) } })
              }
              step={5}
              type="range"
              value={action.position as number}
            />
          </div>
        )}
      </div>
    )
  }

  if (node.type === 'delayControl') {
    const data = node.data as DelayData
    const seconds = (data.delayMs ?? 1000) / 1000

    return (
      <div className="flex flex-col gap-3">
        <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">延时控制</p>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[11px] text-white/50">延时</label>
            <span className="text-[11px] tabular-nums text-white/60">{seconds}s</span>
          </div>
          <input
            className="h-1.5 w-full appearance-none rounded-full bg-white/10 accent-[#64748b]"
            max={30000}
            min={500}
            onChange={(e) => onChange({ delayMs: Number(e.target.value) })}
            step={500}
            type="range"
            value={data.delayMs ?? 1000}
          />
          <div className="mt-1 flex justify-between text-[10px] text-white/30">
            <span>0.5s</span>
            <span>30s</span>
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ═══════════════════════════════════════════════════════════════
// 拖拽工具条
// ═══════════════════════════════════════════════════════════════

function DragItem({
  type,
  label,
  icon,
}: {
  type: string
  label: string
  icon: React.ReactNode
}) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow', type)
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <div
      className="flex cursor-grab items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 active:cursor-grabbing"
      draggable
      onDragStart={onDragStart}
    >
      {icon}
      <span>{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════

interface SceneFlowEditorProps {
  scene: SceneNodeType
  devices: DeviceNode[]
  onClose: () => void
}

export function SceneFlowEditor({ scene, devices, onClose }: SceneFlowEditorProps) {
  const initial = useMemo(() => effectsToFlow(scene, devices), [scene, devices])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, animated: true, style: { stroke: '#334155', strokeWidth: 2 } }, eds),
      ),
    [setEdges],
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => setSelectedNodeId(null), [])

  // 拖放：添加新节点
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData('application/reactflow')
      if (!type) return

      const bounds = reactFlowWrapper.current?.getBoundingClientRect()
      const position = bounds
        ? { x: e.clientX - bounds.left - 80, y: e.clientY - bounds.top - 30 }
        : { x: 300, y: 100 }

      if (type === 'sceneTrigger') {
        setNodes((nds) => [
          ...nds,
          {
            id: `trigger-${Date.now()}`,
            type: 'sceneTrigger',
            position,
            data: { name: '新场景', icon: '' },
          } as Node<TriggerData, 'sceneTrigger'>,
        ])
      } else if (type === 'delayControl') {
        setNodes((nds) => [
          ...nds,
          {
            id: `delay-${Date.now()}`,
            type: 'delayControl',
            position,
            data: { delayMs: 2000 },
          } as Node<DelayData, 'delayControl'>,
        ])
      }
    },
    [setNodes],
  )

  // 从设备列表添加设备节点
  const addDeviceNode = useCallback(
    (device: DeviceNode) => {
      const isLighting = device.subsystem === 'lighting'
      const isCurtain = device.subsystem === 'curtain'

      setNodes((nds) => [
        ...nds,
        {
          id: `device-${Date.now()}`,
          type: 'deviceAction',
          position: { x: 300 + nds.length * 40, y: 100 + nds.length * 20 },
          data: {
            deviceId: device.id,
            deviceName:
              (device.productName as string | undefined) ?? device.productId ?? device.id,
            subsystem: device.subsystem,
            action: {
              on: true,
              ...(isLighting ? { brightness: 80, colorTemp: 3000 } : {}),
              ...(isCurtain ? { position: 100 } : {}),
            },
          },
        } as Node<DeviceData, 'deviceAction'>,
      ])
    },
    [setNodes],
  )

  // 更新选中节点的数据
  const onNodeDataChange = useCallback(
    (data: Partial<Record<string, unknown>>) => {
      if (!selectedNodeId) return
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId ? ({ ...n, data: { ...n.data, ...data } } as FlowNode) : n,
        ),
      )
    },
    [selectedNodeId, setNodes],
  )

  // 保存
  const handleSave = useCallback(() => {
    const trigger = nodes.find((n) => n.type === 'sceneTrigger') as
      | Node<TriggerData, 'sceneTrigger'>
      | undefined

    const newEffects = flowToEffects(nodes as FlowNode[], edges)
    updateScene(scene.id, {
      name: trigger?.data.name ?? scene.name,
      icon: trigger?.data.icon ?? scene.icon,
      effects: newEffects,
    })
    onClose()
  }, [nodes, edges, scene.id, scene.name, scene.icon, onClose])

  // 删除选中节点
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId))
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId),
    )
    setSelectedNodeId(null)
  }, [selectedNodeId, setNodes, setEdges])

  return (
    <div className="dark fixed inset-0 z-[200] flex flex-col bg-[#080c12]">
      {/* 顶栏 */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 bg-[#0d1117] px-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-6 items-center rounded px-2 text-[11px] font-semibold"
            style={{ background: 'rgba(45,127,249,0.18)', color: '#2D7FF9' }}
          >
            {scene.icon || '场景'}
          </div>
          <span className="font-semibold text-white text-sm">{scene.name}</span>
          <span className="text-white/30 text-xs">— 场景流程编辑</span>
        </div>

        <div className="flex items-center gap-2">
          {selectedNode && (
            <button
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-red-400 text-xs transition-colors hover:bg-red-500/20"
              onClick={deleteSelectedNode}
              type="button"
            >
              删除节点
            </button>
          )}
          <button
            className="flex items-center gap-1.5 rounded-lg bg-[#2D7FF9] px-3 py-1.5 text-white text-xs font-medium transition-colors hover:bg-[#2D7FF9]/90"
            onClick={handleSave}
            type="button"
          >
            <Save size={13} />
            保存
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/8 hover:text-white/80"
            onClick={onClose}
            type="button"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* 主体 */}
      <div className="flex flex-1 overflow-hidden">
        {/* React Flow 画布 */}
        <div className="relative flex-1" onDragOver={onDragOver} onDrop={onDrop} ref={reactFlowWrapper}>
          <ReactFlow
            className="scene-flow-canvas"
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            nodeTypes={NODE_TYPES}
            nodes={nodes}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodesChange={onNodesChange}
            onPaneClick={onPaneClick}
            proOptions={{ hideAttribution: true }}
            style={{ background: '#080c12' }}
          >
            <Background color="#1e2633" gap={20} size={1} />
            <Controls
              className="!bg-[#0d1117] !border-white/10"
              showInteractive={false}
            />
            <MiniMap
              maskColor="rgba(8,12,18,0.7)"
              nodeColor={(n) => {
                if (n.type === 'sceneTrigger') return '#2D7FF9'
                if (n.type === 'delayControl') return '#334155'
                const d = n.data as DeviceData
                return getSubsystemColor(d.subsystem as any) ?? '#94a3b8'
              }}
              style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
            />

            {/* 空状态提示 */}
            {nodes.length <= 1 && (
              <Panel position="top-center">
                <div className="mt-4 rounded-lg border border-white/8 bg-[#0d1117] px-4 py-3 text-center text-white/40 text-xs">
                  从底部拖入节点，或点击设备快速添加动作
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* 右侧配置面板 */}
        {selectedNode && (
          <div className="w-60 shrink-0 overflow-y-auto border-l border-white/8 bg-[#0d1117] p-4">
            <NodeConfigPanel
              devices={devices}
              node={selectedNode as FlowNode}
              onChange={onNodeDataChange}
            />
          </div>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-t border-white/8 bg-[#0d1117] px-4">
        <span className="mr-1 text-[11px] text-white/30">拖入：</span>
        <DragItem
          icon={<Zap size={12} />}
          label="触发器"
          type="sceneTrigger"
        />
        <DragItem
          icon={<Timer size={12} />}
          label="延时"
          type="delayControl"
        />

        <div className="mx-2 h-5 w-px bg-white/10" />

        <span className="text-[11px] text-white/30">点击添加设备：</span>
        <div className="flex gap-1.5 overflow-x-auto">
          {devices.slice(0, 10).map((device) => {
            const color = getSubsystemColor(device.subsystem as any) ?? '#94a3b8'
            return (
              <button
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white/90"
                key={device.id}
                onClick={() => addDeviceNode(device)}
                type="button"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                {(device.productName as string | undefined) ??
                  device.productId ??
                  device.id}
              </button>
            )
          })}
          {devices.length > 10 && (
            <span className="flex shrink-0 items-center px-1 text-[11px] text-white/25">
              +{devices.length - 10} 个设备
            </span>
          )}
        </div>

        {devices.length === 0 && (
          <span className="text-[11px] text-white/30">当前楼层没有设备，请先放置设备</span>
        )}
      </div>
    </div>
  )
}
