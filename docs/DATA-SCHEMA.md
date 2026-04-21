# VilHil Studio 数据契约（v1）

> 本文件定义业务层关键对象的最小稳定契约。
> 代码字段可扩展，但不得破坏以下核心语义。

## 1. 顶层对象

```ts
interface ProjectData {
  id: string
  name: string
  levels: Level[]
  scenes: SceneDef[]
  metadata?: Record<string, unknown>
}
```

## 2. 楼层对象

```ts
interface Level {
  id: string
  name: string
  elevation?: number
  devices: DeviceNode[]
}
```

约束：
1. `id` 全局唯一。
2. 面板与画布统一按 `level.id` 过滤。

## 3. 设备对象

```ts
type SubsystemKey =
  | 'architecture'
  | 'lighting'
  | 'panel'
  | 'sensor'
  | 'curtain'
  | 'hvac'
  | 'av'
  | 'security'
  | 'network'

interface DeviceNode {
  id: string
  name: string
  type: string
  subsystem: SubsystemKey
  levelId: string
  position?: [number, number, number]
  params?: Record<string, unknown>
  runtimeState?: Record<string, unknown>
}
```

约束：
1. 每个设备有且仅有一个 `subsystem`。
2. `runtimeState` 属于业务真值，不得在 UI 私存副本。
3. `levelId` 必须可回溯到有效楼层。

## 4. 场景对象

```ts
interface SceneEffect {
  deviceId: string
  nextState: Record<string, unknown>
  delayMs?: number
  durationMs?: number
}

interface SceneDef {
  id: string
  name: string
  levelId?: string
  effects: SceneEffect[]
}
```

约束：
1. `effects[].deviceId` 必须存在于项目设备集合。
2. `delayMs/durationMs` 为毫秒，缺省视为即时。
3. 同一场景执行时，状态机必须可观测（idle/running/active）。

## 5. 运行状态对象

```ts
type SceneRunStatus = 'idle' | 'running' | 'active'
```

约束：
1. UI 执行态展示必须绑定该状态。
2. 新场景触发默认可中断旧场景（后触发优先）。

## 6. 向后兼容

1. 新增字段允许可选。
2. 删除字段必须先经过迁移期，并更新工具函数适配层。
3. 破坏性变更必须更新本文件版本号（v1 -> v2）。

## 6. 后端数据模型（PostgreSQL）

### 6.1 projects 表

```ts
interface ProjectRow {
  id: string              // UUID
  owner_id: string | null // 关联 user.id，null = 匿名项目
  name: string
  slug: string            // 唯一短标识
  data: JSONB             // 场景图快照 { nodes, rootNodeIds }
  thumbnail?: string
  is_public: boolean
  created_at: Date
  updated_at: Date
}
```

约束：
1. `data` 存储完整场景图，前端通过 `setScene()` 直接加载。
2. `owner_id` 为 null 时，项目仅可通过 `share_links.token` 访问。
3. `slug` 由系统生成，用户不可自定义。

### 6.2 share_links 表

```ts
interface ShareLinkRow {
  id: string
  project_id: string      // -> projects.id (cascade)
  token: string           // 短链 token，如 "a1b2c3d4"
  permission: 'view' | 'operate'  // view=只读, operate=可操作设备
  expires_at?: Date
  password?: string       // bcrypt hash，可选
  view_count: number
  created_at: Date
}
```

约束：
1. `token` 全局唯一，10-12 位 nanoid。
2. `expires_at` 为 null 时永不过期。
3. 访问时自动递增 `view_count`。

### 6.3 project_members 表（预留）

```ts
interface ProjectMemberRow {
  id: string
  project_id: string
  user_id: string
  role: 'owner' | 'editor' | 'viewer'
  created_at: Date
}
```

## 7. 数据流

```
设计师编辑场景
    ↓
useScene (Zustand + IndexedDB) —— 前端实时状态
    ↓
点击"保存"/"分享"
    ↓
API: POST /api/project/save 或 POST /api/share
    ↓
PostgreSQL (projects / share_links)
    ↓
客户打开 /share/[token]
    ↓
API: GET /api/share/[token] → 返回 data
    ↓
useScene.setScene(nodes, rootNodeIds) → 渲染
```

## 8. 向后兼容

1. 新增字段允许可选。
2. 删除字段必须先经过迁移期，并更新工具函数适配层。
3. 破坏性变更必须更新本文件版本号（v1 -> v2）。

## 9. 变更记录

- 2026-04-20: 增加后端数据模型（projects / share_links / project_members）。
- 2026-04-17: 建立最小稳定数据契约（Project/Level/Device/Scene/RunStatus）。
