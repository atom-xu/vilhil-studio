# Sprint 3：智能场景 — 一键切换回家/影院/离家模式

**工期**：1 周  
**完成标准**：设计师在 ScenePanel 里创建"回家模式"，配置灯光状态；客户在展示模式点击场景卡片 → 多盏灯同时渐变到目标状态，窗帘动作

---

## BDD 验收场景

### 场景 1：设计师创建场景

```
Given 编辑模式，客厅已放 3 盏筒灯
When  设计师在右侧 ScenePanel 点击"新建场景"
      输入名称"回家模式"，选择图标
      为每盏灯配置状态：on=true, brightness=80, colorTemp=3000K
      点击保存
Then  场景保存到 SceneNode，左侧场景树出现"回家模式"
      展示模式的 SceneBar 出现"回家模式"卡片
```

### 场景 2：客户在展示模式触发场景

```
Given 展示模式，客厅 3 盏灯全灭
When  客户点击 SceneBar 里的"回家模式"卡片
Then  3 盏灯同时亮起（on=true），亮度 80%，色温 3000K（暖黄）
      光锥出现，场景卡片高亮显示"已激活"
```

### 场景 3：连续切换场景

```
Given 回家模式已激活（灯亮）
When  客户点击"影院模式"
Then  主灯熄灭（on=false），氛围灯亮度降到 20%，窗帘关闭
When  客户再点击"离家模式"
Then  所有灯熄灭，窗帘关闭
```

---

## 技术任务

| # | 任务 | 文件 | 验证标准 |
|---|------|------|---------|
| T0 | `applyScene` 工具函数 | smarthome/tools | `applyScene(id)` 批量 setDeviceState，Undo 一步还原 |
| T1 | `createScene / updateScene / deleteScene` | smarthome/tools | 场景 CRUD，写入 SceneNode，Undo/Redo 支持 |
| T2 | ScenePanel（设计师侧） | editor/panels | 右侧面板，列出/编辑/删除场景，配置设备状态 |
| T3 | SceneBar 接入 `applyScene` | editor/proposal | 点击场景卡片 → applyScene(id)，激活态高亮 |
| T4 | 窗帘场景联动 | smarthome/tools | SceneEffect 支持 curtain 设备 position 状态 |
| T5 | 场景激活状态追踪 | editor/proposal | 记录 activeSceneId，卡片高亮 |

---

## 架构决策

### SceneNode 存在哪？

场景数据作为 SceneNode 存在 scene store：

```typescript
interface SceneNode extends BaseNode {
  type: 'scene'
  name: string
  icon?: string   // emoji 或 icon 标识
  effects: SceneEffect[]
}

interface SceneEffect {
  deviceId: string
  delay: number    // 秒，支持时间线动画（S4）
  duration: number // 渐变时间（当前忽略，S4 实现）
  state: Record<string, unknown>  // 目标状态
}
```

### applyScene 执行架构

```
用户点击场景卡片
  → SceneBar onPress
  → applyScene(sceneId)
  → useScene.getState().nodes[sceneId] 取 SceneNode
  → 遍历 effects，对每个 effect 执行 setDeviceState(deviceId, state)
  → 所有设备状态批量更新（Zustand 批量写入）
  → DeviceRenderer 各自重渲染（useScene 直接订阅）
```

**Undo 策略**：`applyScene` 把所有 `setDeviceState` 批量在一个 Zundo checkpoint 里执行，Undo 一步还原所有设备到应用场景前的状态。

### 场景激活状态

场景激活状态存在 proposal UI 的本地 state（不写入 scene store）：
- 原因：场景激活是客户操控的临时状态，不需要持久化
- `activeSceneId: string | null` 在 `ProposalLayout` 或新建 `useSceneBar` hook 中

---

## 不做（留到 S4）

- 渐变/过渡动画（灯光 fade-in）
- 时间线编排（delay 执行）
- 场景缩略图预览
- 场景分享 URL

---

## 和 S2 的数据关系

S2 的面板联动（T5）已支持 `{ type: 'scene', sceneId }` 动作类型，S3 完成 applyScene 后，面板按键即可触发场景。
