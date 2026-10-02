/**
 * Topology Catalog
 *
 * 节点类型 → 视觉配置（图标、颜色、标签、默认端口数）
 * 边类型 → 视觉配置（颜色、dash、标签）
 * 设备 → 拓扑类型推导函数
 * 连接 → 默认边类型推导函数
 */

import {
  Anchor,
  Building2,
  Camera,
  Cpu,
  Globe,
  HardDrive,
  Layers,
  Lightbulb,
  Lock,
  Music,
  Network,
  Package,
  PlugZap,
  Radio,
  Router,
  Server,
  Shield,
  ToggleLeft,
  Wifi,
  Wind,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TopologyNodeType, TopologyEdgeType, NodeStatus, SceneDevice } from './types'

// ─── Node type config ─────────────────────────────────────────────────────────

export interface NodeTypeConfig {
  label: string
  icon: LucideIcon
  color: string
  /** 默认端口数（switch/gateway 显示多个底部 Handle） */
  defaultPortCount: number
  /** 所属层级，用于 dagre peer-group 检测 */
  tier: 'infra' | 'control' | 'device'
}

export const NODE_TYPE_CONFIG: Record<TopologyNodeType, NodeTypeConfig> = {
  // ── 网络基础设施层 ──────────────────────────────────────────────
  isp: {
    label: 'ISP光猫',
    icon: Globe,
    color: '#00d4ff',
    defaultPortCount: 1,
    tier: 'infra',
  },
  router: {
    label: '路由器',
    icon: Router,
    color: '#3b82f6',
    defaultPortCount: 4,
    tier: 'infra',
  },
  switch: {
    label: '交换机',
    icon: Network,
    color: '#10b981',
    defaultPortCount: 8,
    tier: 'infra',
  },
  ap: {
    label: '无线AP',
    icon: Wifi,
    color: '#06b6d4',
    defaultPortCount: 1,
    tier: 'infra',
  },
  nas: {
    label: 'NAS存储',
    icon: HardDrive,
    color: '#10b981',
    defaultPortCount: 1,
    tier: 'infra',
  },
  server: {
    label: '智能主机',
    icon: Server,
    color: '#a855f7',
    defaultPortCount: 2,
    tier: 'infra',
  },
  cpl: {
    label: '电力猫',
    icon: PlugZap,
    color: '#f59e0b',
    defaultPortCount: 1,
    tier: 'infra',
  },
  // ── 智能家居控制层 ──────────────────────────────────────────────
  gateway: {
    label: '智能网关',
    icon: Anchor,
    color: '#8b5cf6',
    defaultPortCount: 4,
    tier: 'control',
  },
  hub: {
    label: '协议Hub',
    icon: Radio,
    color: '#8b5cf6',
    defaultPortCount: 1,
    tier: 'control',
  },
  // ── 终端设备层 ─────────────────────────────────────────────────
  light: {
    label: '智能灯光',
    icon: Lightbulb,
    color: '#d4a853',
    defaultPortCount: 1,
    tier: 'device',
  },
  panel: {
    label: '面板/开关',
    icon: ToggleLeft,
    color: '#c8b8a0',
    defaultPortCount: 1,
    tier: 'device',
  },
  sensor: {
    label: '传感器',
    icon: Radio,
    color: '#4ade80',
    defaultPortCount: 1,
    tier: 'device',
  },
  curtain: {
    label: '窗帘电机',
    icon: Layers,
    color: '#3dd9b6',
    defaultPortCount: 1,
    tier: 'device',
  },
  hvac: {
    label: '暖通设备',
    icon: Wind,
    color: '#9b7bea',
    defaultPortCount: 1,
    tier: 'device',
  },
  camera: {
    label: '安防摄像头',
    icon: Camera,
    color: '#f59e0b',
    defaultPortCount: 1,
    tier: 'device',
  },
  av: {
    label: '影音设备',
    icon: Music,
    color: '#5ba0f5',
    defaultPortCount: 1,
    tier: 'device',
  },
  lock: {
    label: '智能门锁',
    icon: Lock,
    color: '#f59e0b',
    defaultPortCount: 1,
    tier: 'device',
  },
  generic: {
    label: '通用设备',
    icon: Cpu,
    color: '#8b949e',
    defaultPortCount: 1,
    tier: 'device',
  },
}

// ─── Edge type config ─────────────────────────────────────────────────────────

export interface EdgeTypeConfig {
  label: string
  color: string
  strokeWidth: number
  strokeDasharray?: string
  animationClass?: string
}

export const EDGE_TYPE_CONFIG: Record<TopologyEdgeType, EdgeTypeConfig> = {
  ethernet: {
    label: '以太网',
    color: '#3b82f6',
    strokeWidth: 2,
  },
  wifi: {
    label: 'WiFi',
    color: '#06b6d4',
    strokeWidth: 1.5,
    strokeDasharray: '6 3',
  },
  zigbee: {
    label: 'Zigbee',
    color: '#f59e0b',
    strokeWidth: 1.5,
    strokeDasharray: '2 4',
  },
  matter: {
    label: 'Matter',
    color: '#10b981',
    strokeWidth: 1.5,
    strokeDasharray: '3 3',
  },
  knx: {
    label: 'KNX',
    color: '#8b5cf6',
    strokeWidth: 2.5,
  },
  rs485: {
    label: 'RS485',
    color: '#f97316',
    strokeWidth: 2,
    strokeDasharray: '4 2',
  },
}

// ─── VLAN color palette (6 colors, cycles by vlanId) ─────────────────────────

const VLAN_COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f97316', '#f59e0b', '#ef4444']
export function getVlanColor(vlanId: number): string {
  return VLAN_COLORS[(vlanId - 1) % VLAN_COLORS.length] ?? '#3b82f6'
}

// ─── Status colors ────────────────────────────────────────────────────────────

export const STATUS_COLOR: Record<NodeStatus, string> = {
  online: '#10b981',
  offline: '#ef4444',
  pending: '#f59e0b',
  unknown: '#6b7280',
}

// ─── Type inference: SceneDevice → TopologyNodeType ───────────────────────────

export function deriveTopologyType(device: SceneDevice): TopologyNodeType {
  const rt = (device.renderType ?? '').toLowerCase()
  const sub = device.subsystem ?? ''
  const proto = (device.protocol ?? '').toLowerCase()

  // ── 网络/架构子系统 ─────────────────────────────────────────────
  if (sub === 'network' || sub === 'architecture') {
    if (rt.includes('isp') || rt.includes('modem') || rt.includes('onu')) return 'isp'
    if (rt.includes('router') || rt.includes('gateway-router')) return 'router'
    if (rt.includes('switch') || rt.includes('cabinet')) return 'switch'
    if (rt.includes('ap') || rt.includes('ceiling') || rt.includes('panel-ap')) return 'ap'
    if (rt.includes('nas')) return 'nas'
    if (rt.includes('cpl') || rt.includes('powerline')) return 'cpl'
    if (rt.includes('hub') || rt.includes('zigbee-hub') || rt.includes('z-wave')) return 'hub'
    if (rt.includes('gateway') || rt.includes('knx') || proto === 'knx') return 'gateway'
    if (rt.includes('host') || rt.includes('server') || rt.includes('smart')) return 'server'
    return 'server'
  }

  // ── 灯光 ────────────────────────────────────────────────────────
  if (sub === 'lighting') return 'light'

  // ── 面板 ────────────────────────────────────────────────────────
  if (sub === 'panel') return 'panel'

  // ── 传感器 ──────────────────────────────────────────────────────
  if (sub === 'sensor') {
    if (rt.includes('camera') || rt.includes('dome') || rt.includes('bullet')) return 'camera'
    return 'sensor'
  }

  // ── 窗帘 ────────────────────────────────────────────────────────
  if (sub === 'curtain') return 'curtain'

  // ── 暖通 ────────────────────────────────────────────────────────
  if (sub === 'hvac') return 'hvac'

  // ── 影音 ────────────────────────────────────────────────────────
  if (sub === 'av') return 'av'

  // ── 安防 ────────────────────────────────────────────────────────
  if (sub === 'security') {
    if (rt.includes('camera') || rt.includes('dome') || rt.includes('bullet')) return 'camera'
    if (rt.includes('lock')) return 'lock'
    return 'sensor'
  }

  return 'generic'
}

// ─── Edge inference: source + target type → default EdgeType ─────────────────

const INFRA_TYPES = new Set<TopologyNodeType>([
  'isp', 'router', 'switch', 'nas', 'server', 'cpl', 'gateway',
])

export function deriveDefaultEdgeType(
  sourceType: TopologyNodeType,
  targetType: TopologyNodeType,
  sourceProtocol?: string,
): TopologyEdgeType {
  const proto = (sourceProtocol ?? '').toLowerCase()

  // 协议优先
  if (proto === 'knx') return 'knx'
  if (proto === 'zigbee') return 'zigbee'
  if (proto === 'matter') return 'matter'
  if (proto === 'modbus' || proto === 'rs485') return 'rs485'

  // 网络基础设施之间 → ethernet
  if (INFRA_TYPES.has(sourceType) || INFRA_TYPES.has(targetType)) return 'ethernet'

  // AP ↔ 终端 → wifi
  if (sourceType === 'ap' || targetType === 'ap') return 'wifi'
  if (sourceType === 'hub' || targetType === 'hub') return 'zigbee'

  // IoT 设备到网关/hub → zigbee
  const iotTypes: TopologyNodeType[] = ['light', 'panel', 'sensor', 'curtain', 'hvac', 'lock']
  if (iotTypes.includes(sourceType) || iotTypes.includes(targetType)) return 'zigbee'

  // 摄像头 → 通常 ethernet 或 wifi
  if (sourceType === 'camera' || targetType === 'camera') return 'wifi'

  return 'ethernet'
}
