# Kimi 3D 组件集成规约

> 本文档说明 Kimi 开发的 3D 设备模型组件与 VilHil Studio 系统的接口规范。

---

## 整体架构

```
packages/viewer/src/components/renderers/device/
  └─ device-renderer.tsx          ← 主渲染器（我们维护）
       ├─ useRegistry(node.id, 'device', ref)    — 注册到空间查询
       ├─ useNodeEvents(node, 'device')           — 统一事件发射
       ├─ useScene(state.nodes[id].state)         — 直接订阅设备状态
       └─ <DeviceGeometry>                        ← 这里接 Kimi 的 3D 模型

packages/smarthome/src/components/
  ├─ device-mesh.tsx               ← Kimi 的视觉组件（接受 DeviceVisualState）
  ├─ device-animator.tsx           ← Kimi 的动画组件
  └─ device-interaction.tsx        ← ⚠️ 见下方「事件处理」章节
```

---

## 1. 事件处理（重要：避免双重事件）

### ✅ 正确做法：使用 emitter 监听事件

我们的 `DeviceRenderer` 已经在外层 `<group>` 上挂载了 `useNodeEvents`，它会自动向 emitter 发射所有交互事件。

**Kimi 的组件应该监听 emitter，而不是在 3D mesh 上直接绑定 R3F 事件：**

```typescript
// ✅ 正确：在 hook 或组件外层监听 emitter
import { emitter } from '@pascal-app/core'

useEffect(() => {
  emitter.on('device:click', (event) => {
    // event.node.id — 被点击设备的 ID
  })
  emitter.on('device:enter', (event) => { /* 悬停进入 */ })
  emitter.on('device:leave', (event) => { /* 悬停离开 */ })
  return () => {
    emitter.off('device:click', ...)
    emitter.off('device:enter', ...)
    emitter.off('device:leave', ...)
  }
}, [])
```

**已支持的所有 device 事件**（由 `useNodeEvents` 自动发射）：
| 事件 | 触发时机 |
|------|---------|
| `device:click` | 点击释放（左键） |
| `device:double-click` | 双击 |
| `device:pointerdown` | 按下 |
| `device:pointerup` | 释放 |
| `device:enter` | 悬停进入 |
| `device:leave` | 悬停离开 |
| `device:move` | 悬停移动 |
| `device:context-menu` | 右键菜单 |

### ⚠️ 关于 DeviceInteractionZone

`DeviceInteractionZone` 当前使用 R3F 的 `onClick` 并调用 `e.stopPropagation()`，这会阻断外层 `group` 的事件传播，导致 emitter 无法收到事件。

**建议**：
- 如果需要更大的点击区域，可以保留 `DeviceInteractionZone` 但 **不要 `stopPropagation`**，改为让事件穿透到外层 group
- 或者移除 `DeviceInteractionZone`，在 `DeviceMesh` 上直接调整 geometry 大小来扩大点击区域

---

## 2. 状态驱动（DeviceVisualState）

### 当前支持的状态字段（已在 DeviceRenderer 中可用）

```typescript
interface DeviceVisualState {
  // ──── 已支持 ────
  on: boolean           // 开关状态（DeviceRenderer 中 isOn）
  brightness: number    // 0-100，灯光亮度
  color: string         // hex，灯光颜色
  colorTemp: number     // 2700-6500K，色温
  position: string      // 'open' | 'closed'，窗帘位置（当前用字符串）

  // ──── 待扩展（S2 后续） ────
  angle: number         // 百叶角度 0-90
  locked: boolean       // 门锁状态
  triggered: boolean    // 传感器触发状态
}
```

### 如何在 Kimi 的组件中获取状态

**方案 A（推荐）：props 传入**

`DeviceRenderer` 把 `deviceState` 作为 props 传给 `<DeviceGeometry>`（或 Kimi 的组件）：

```tsx
// 在 DeviceRenderer 中
<DeviceGeometry
  mountType={node.mountType}
  renderType={node.renderType}
  subsystem={node.subsystem}
  visualState={{
    on: isOn,
    brightness: (deviceState?.brightness as number) ?? 100,
    color: (deviceState?.color as string) ?? '#ffffff',
    colorTemp: deviceState?.colorTemp as number,
    triggered: (deviceState?.triggered as boolean) ?? false,
    locked: (deviceState?.locked as boolean) ?? false,
    angle: (deviceState?.angle as number) ?? 0,
  }}
/>
```

**方案 B：直接订阅（性能稍差，但独立性更高）**

```typescript
// 在 Kimi 的组件内
const deviceState = useScene((state) => {
  const node = state.nodes[nodeId] as DeviceNode | undefined
  return node?.state as DeviceVisualState | undefined
})
```

---

## 3. 放置策略（PlacementCallbacks）

### 当前实现

放置逻辑在 `packages/editor/src/components/tools/device/device-tool.tsx`，三种表面：

| 表面 | 触发条件 | 吸附逻辑 |
|------|---------|---------|
| 地板 | `mountType` 不在 ceiling/wall 集合中 | `snapHalf(x)`, `snapHalf(z)`, `defaultH` |
| 天花板 | `mountType` in `['ceiling', 'ceiling_suspended', 'hidden']` | 吸附到天花板底面 Y |
| 墙面 | `mountType` in `['wall', 'wall_switch', 'wall_panel', 'wall_side']` | 法线计算旋转角 |

### Kimi 需要的接口（待实现，S3 优先级）

```typescript
interface PlacementCallbacks {
  // 放置前预览：返回是否合法
  onPlacementPreview: (
    position: [number, number, number],
    normal: [number, number, number] | undefined
  ) => 'valid' | 'invalid'

  // 放置后确认：写入 Zustand
  onPlacementCommit: (
    position: [number, number, number],
    rotation: number,        // Y 轴旋转弧度
    levelId: string
  ) => void

  // 自动吸附：返回吸附后的变换
  getSnappedTransform: (
    rawPosition: [number, number, number],
    surfaceNormal: [number, number, number] | undefined
  ) => {
    position: [number, number, number]
    rotation: number
  }
}
```

**当前状态**：这些逻辑已在 `device-tool.tsx` 中实现，但未抽象成可回调的接口。等 Kimi 3D 模型接入后，按需重构。

---

## 4. 集成步骤（当 Kimi 的 3D 模型准备好后）

1. Kimi 在 `packages/smarthome/src/models/` 下完成设备模型定义
2. 我们修改 `DeviceGeometry`（`packages/viewer/src/components/renderers/device/device-geometry.tsx`），根据 `renderType` 选择渲染 Kimi 的模型还是现有几何体
3. Kimi 的模型组件接受 `DeviceVisualState` props，纯响应状态，不处理交互
4. 所有交互（点击/悬停/放置）保持由我们的系统统一管理

---

## 5. 分工边界

| 职责 | 谁来做 |
|------|--------|
| 事件发射（click/hover/etc.） | 我们（useNodeEvents + emitter） |
| 设备状态管理（Zustand store） | 我们（setDeviceState/toggleDevice） |
| 3D 视觉形态（几何体/材质/动画） | Kimi |
| 放置策略（吸附/旋转/预览） | 我们（device-tool.tsx） |
| 覆盖范围可视化（AP/PIR） | 我们（APCoverage/PIRCoverage） |
| 光效（光锥/光源） | 我们（DeviceLight/LightCone） |
| 状态指示器（亮/暗 halo） | 我们（DeviceIndicator） |
