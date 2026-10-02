/**
 * VilHil Topology Types
 *
 * 参考 homelable-hacs 的节点/边分类体系，结合 VilHil 智能家居业务场景扩展：
 * - 网络基础设施层：isp / router / switch / ap / nas / server / cpl
 * - 智能家居控制层：gateway / hub
 * - 终端设备层：light / panel / sensor / curtain / hvac / camera / av / lock
 * - 兜底：generic
 *
 * 边类型从"有线/无线"升级为协议级别（以太网/WiFi/Zigbee/Matter/KNX/RS485），
 * 更准确地反映智能家居实际接线方式。
 */

// ─── Node types ──────────────────────────────────────────────────────────────

/** 18 种拓扑节点类型 */
export type TopologyNodeType =
  // 网络基础设施
  | 'isp'      // ISP光猫/Modem
  | 'router'   // 路由器
  | 'switch'   // 交换机
  | 'ap'       // 无线接入点
  | 'nas'      // NAS存储/媒体服务器
  | 'server'   // 智能主机/服务器
  | 'cpl'      // 电力猫/Powerline
  // 智能家居控制
  | 'gateway'  // KNX/Matter/Zigbee网关
  | 'hub'      // 协议集线器（Zigbee Hub / Z-Wave Hub）
  // 终端设备
  | 'light'    // 智能灯光
  | 'panel'    // 面板/开关
  | 'sensor'   // 传感器
  | 'curtain'  // 窗帘电机
  | 'hvac'     // 暖通设备
  | 'camera'   // 安防摄像头
  | 'av'       // 影音设备
  | 'lock'     // 智能门锁
  | 'generic'  // 通用/未分类

// ─── Edge types ──────────────────────────────────────────────────────────────

/** 6 种协议级别的连接类型 */
export type TopologyEdgeType =
  | 'ethernet' // 有线以太网（实线蓝色）
  | 'wifi'     // 无线WiFi（虚线青色）
  | 'zigbee'   // Zigbee无线（点线琥珀色）
  | 'matter'   // Matter协议（点线绿色）
  | 'knx'      // KNX总线（实线紫色）
  | 'rs485'    // RS485/Modbus（粗实线橙色）

// ─── Node status ──────────────────────────────────────────────────────────────

/** 节点在线状态 — 虚拟模式下默认 unknown，后期可接真实设备 */
export type NodeStatus = 'online' | 'offline' | 'pending' | 'unknown'

// ─── RF node / edge data payloads ─────────────────────────────────────────────

export interface SceneDevice {
  id: string
  name: string
  brand: string
  subsystem: string
  levelId: string | null
  protocol: string
  renderType: string
  mountType: string
}

export interface DeviceNodeData extends Record<string, unknown> {
  device: SceneDevice
  topoType: TopologyNodeType
  status: NodeStatus
  portCount?: number   // 交换机/网关可配置端口数（影响底部 Handle 数量）
  ip?: string          // 可选 IP 地址（虚拟或手动填入）
  hostname?: string    // 可选主机名
  notes?: string       // 备注
  // 由 topology enrichment 注入：
  controller?: import('../topology-workspace').ApiTopologyController
  assignment?: import('../topology-workspace').ApiTopologyAssignment
  parentName?: string
}

export interface VilHilEdgeData extends Record<string, unknown> {
  edgeType: TopologyEdgeType
  animated: boolean
  speed?: string   // "100M" | "1G" | "10G" | "2.4G" | "5G" 等
  vlanId?: number  // VLAN ID（ethernet 类型时生效，影响颜色）
  label?: string   // 自定义标签
}

export type HistoryEntry = {
  nodes: import('@xyflow/react').Node<DeviceNodeData>[]
  edges: import('@xyflow/react').Edge<VilHilEdgeData>[]
}
