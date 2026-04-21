# VilHil 自动拓扑图谱架构（UniFi 风格，无连线）

> 目标：不画线，也能让用户一眼看懂“谁管谁、还能接多少、当前状态如何”。

## 1. 业务目标

1. 展示所有设备的层级关系（上级控制器 -> 子设备）。
2. 自动分配连接关系，避免手工拖线。
3. 用“容量槽位”表达接入能力（例如无线网关最多 32 个子设备）。
4. 保持编辑模式与展示模式一致的关系语义。

## 2. 非目标（本阶段不做）

1. 不做实时物理链路仿真（不算真实 RSSI/链路质量）。
2. 不做手工拉线编辑器。
3. 不做跨项目全局网络编排。

## 3. 核心概念

### 3.1 节点角色

1. `Controller`：可挂载子设备（网关、主机、AP、总线控制器）。
2. `Leaf`：被管理设备（传感器、灯具、面板、锁等）。
3. `VirtualSlot`：控制器内部虚拟接入口，不是实体端口。

### 3.2 容量模型

每个 `Controller` 定义容量规则：

- `capacity.maxChildren`: 最大子设备数（例：32）
- `capacity.strategy`: 分配策略（`balanced` / `first-fit` / `same-floor-first`）
- `capacity.allowedTypes`: 可接入设备类型白名单
- `capacity.protocol`: 协议标签（`zigbee` / `ble` / `knx` / `ip`）

### 3.3 连接结果（无画线）

系统输出的不是“线”，而是：

- 设备 `A` 的 `parentId = 网关-1`
- 设备 `A` 占用 `slotIndex = 7`
- 网关-1 目前 `used=19/32`

## 4. 数据与状态归属（对齐现有硬规则）

1. 运行时真值放 `useScene`（拓扑关系、槽位占用、在线状态）。
2. UI 偏好放 `useDeviceState`（折叠态、排序、筛选项）。
3. 工具函数先行：`packages/smarthome/src/tools/topology/**`。

## 5. 建议数据结构

```ts
export type TopologyControllerSpec = {
  deviceId: string
  protocol: 'zigbee' | 'ble' | 'knx' | 'ip' | 'matter'
  maxChildren: number
  allowedTypes?: string[]
  strategy?: 'balanced' | 'first-fit' | 'same-floor-first'
}

export type TopologyAssignment = {
  childId: string
  parentId: string
  slotIndex: number
  assignedAt: number
  reason: 'auto' | 'manual-lock'
}

export type TopologyState = {
  controllers: TopologyControllerSpec[]
  assignments: TopologyAssignment[]
  unassigned: string[]
}
```

## 6. 自动连接算法（核心）

### 6.1 触发时机

1. 新设备加入。
2. 控制器上下线或容量变更。
3. 设备楼层变化。
4. 用户执行“重新平衡”。

### 6.2 分配优先级（建议）

1. 协议匹配（必须）。
2. 同楼层优先。
3. 当前负载最低优先（`used/max` 最小）。
4. 距离最近优先（可选，未来增强）。

### 6.3 失败处理

1. 所有可用控制器满载 -> 设备进入 `unassigned`。
2. UI 显示“待接入设备 N 个”，并提示新增网关。

## 7. UI 形态（无连线图谱）

### 7.1 左侧拓扑面板

每个控制器卡片包含：

1. 控制器名称 + 协议标签。
2. 容量条（如 `19 / 32`）。
3. 槽位网格（32 个虚拟格，已占用显示设备头像/图标）。
4. 异常标识（离线、满载、协议不兼容）。

### 7.2 交互

1. 点击子设备 -> 高亮其父控制器卡片。
2. 点击控制器 -> 展示其子设备列表（按楼层/房间分组）。
3. “重新平衡”按钮 -> 触发自动重排（保留手动锁定项）。
4. 不提供连线拖拽。

### 7.3 视图过滤

1. 按楼层过滤：只看当前楼层设备，控制器显示该楼层占用统计。
2. 按协议过滤：仅看 Zigbee/KNX/IP 等。
3. 按状态过滤：在线/离线/未接入。

## 8. 工具函数设计（先工具，后 UI）

建议新增：`packages/smarthome/src/tools/topology/`

1. `buildTopology(scene): TopologyState`
2. `assignDeviceAuto(scene, childId): TopologyAssignment | null`
3. `assignBatchAuto(scene, childIds): TopologyAssignment[]`
4. `reassignByStrategy(scene, options): TopologyState`
5. `releaseAssignment(scene, childId): TopologyState`
6. `getControllerUsage(scene, controllerId): { used: number; max: number }`

## 9. BDD 验收场景（先验收再实现）

```gherkin
场景：无线网关自动接入子设备
Given 网关 G1 协议为 zigbee 且容量 32
And   当前已接入 31 个 zigbee 子设备
When  新增一个 zigbee 传感器 S32
Then  S32 自动分配到 G1 的第 32 个槽位
And   G1 显示 32/32 满载

场景：网关满载后新设备进入待接入
Given 网关 G1 已满载 32/32
When  新增 zigbee 设备 S33
Then  S33 显示为待接入
And   系统提示“新增网关以继续接入”

场景：同楼层优先分配
Given G1 在 1F，G2 在 2F，二者都可接入
When  在 2F 新增 zigbee 设备 S1
Then  S1 优先分配到 G2
```

## 10. 分阶段落地建议（增量，不大拆）

### Phase A（1 周）

1. 完成拓扑数据结构与工具函数。
2. 支持 `gateway/ap/host` 三类控制器。
3. 完成容量槽位自动分配与满载提示。

### Phase B（1 周）

1. 拓扑面板替换当前 Coming Soon。
2. 加入楼层过滤和协议过滤。
3. 增加“重新平衡”和“手动锁定”。

### Phase C（后续）

1. 加入信号质量估计（弱/中/强）。
2. 加入健康评分（离线率、过载率）。
3. 加入 Proposal 演示态的轻量拓扑卡片。

## 11. 对你这次需求的直接映射

你的描述可直接映射为：

1. “网关最多 32 个子设备” -> `maxChildren = 32`。
2. “自动做上下级连接” -> `assignDeviceAuto`。
3. “每接入一个设备就占一个虚拟隔断” -> `slotIndex` + 槽位网格。
4. “不用真的划线” -> UI 只显示归属与容量，不渲染边。

结论：你的需求完全可执行，且与当前项目架构兼容，不需要大范围重写。
