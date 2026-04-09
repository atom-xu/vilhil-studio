# Sprint 2：客户能在展示模式里开关灯

**工期**：1 周  
**完成标准**：客户打开展示链接 → 点击天花板灯 → 灯亮/灭，光锥出现/消失；设计师拖亮度滑块 → 3D 实时变暗

---

## BDD 验收场景

### 场景 1：客户点灯（L2 直接操控）

```
Given 展示模式，3D 客厅，天花板有 3 盏筒灯（默认亮）
When  客户点击其中一盏灯
Then  该灯变暗，光锥消失
      再点击 → 灯重新亮起，光锥出现
      其他灯不受影响
```

### 场景 2：设计师调光（实时参数同步）

```
Given 编辑模式，选中一盏筒灯，右侧 DevicePanel 显示
When  设计师拖亮度滑块到 50%
Then  3D 中该灯光变暗（intensity 从 2 降到 1）
When  设计师拖色温滑块到 2700K
Then  灯光变成暖黄色
When  设计师拖光束角到 60°
Then  光锥变宽
```

### 场景 3：面板联动（Panel → Light）

```
Given 客厅有 3 盏筒灯 + 1 个 4 键面板
When  客户点击面板第 1 键（配置为"全开"）
Then  3 盏灯全部亮起
When  客户点击第 2 键（配置为"全关"）
Then  3 盏灯全部熄灭
```

---

## 技术任务

| # | 任务 | 文件 | 验证标准 |
|---|------|------|---------|
| T0 | 修复 DeviceRenderer 直接 state 订阅 | viewer/renderers/device | 亮度变化立即响应，不依赖父组件 re-render |
| T1 | `toggleDevice` 工具函数 | smarthome/tools | `toggleDevice(id)` 翻转 `state.on`，Undo/Redo 自动支持 |
| T2 | L2 点击交互：`useDeviceInteraction` hook | editor/hooks | 点击设备 → 切换 on/off（编辑+展示双模式） |
| T3 | 实时参数同步验证 | viewer/renderers/device | 拖亮度滑块 → DeviceLight intensity 实时变化 |
| T4 | 展示模式优化 | editor/proposal | Preview 模式下隐藏编辑 UI，设备可点击 |
| T5 | 面板联动（PanelConfig） | smarthome/tools + editor/panels | 面板按键配置关联灯 ID，点击触发批量 toggle |

---

## 架构决策

### 设备状态存在哪？

**当前**：状态在 `DeviceNode.state`（Zustand scene store，自动 Undo/Redo + 持久化）  
**展示模式**：客户操控的状态也写入 scene store（同一个来源）  
**HA 集成预留**：将来替换 `SimulateAdapter → HAAdapter` 时，只改工具函数实现，UI 不变

### L2 交互架构

```
用户点击 3D 设备
  → R3F onPointerUp
  → useNodeEvents → emitter.emit('device:click', event)
  → useDeviceInteraction (全局 hook，注册一次)
  → toggleDevice(event.node.id)
  → useScene.getState().updateNode(id, { state: { on: !current } })
  → DeviceRenderer 重新渲染（useScene 直接订阅）
  → 光锥显示/隐藏
```

### 面板联动数据模型

```typescript
// 面板按键配置
interface PanelKeyConfig {
  keyIndex: number       // 0-3 (4键面板)
  label: string          // "全开" / "影院" / etc.
  action: PanelAction
}

type PanelAction =
  | { type: 'toggle'; deviceIds: string[] }          // 切换指定设备
  | { type: 'set'; deviceIds: string[]; state: object } // 设置指定状态
  | { type: 'scene'; sceneId: string }                // 触发场景（S3）
```

---

## 不做（留到 S3）

- 场景编辑器（回家模式 / 影院模式）
- 场景时间线动画
- 窗帘设备交互
- 暖通控制面板
- 分享链接
