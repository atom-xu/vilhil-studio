# Sprint 1 详细规划：设计师能画一个房间并放一盏灯

> 预计周期：1 周
> 完成标准：设计师画 4 面墙 → 从目录拖一盏灯到天花 → 切展示模式看到光锥

---

## BDD 场景（验收标准）

```
场景 1：放置灯具
Given 设计师画好了一个房间（4 面墙）
When  他点击 Furnish → 智能 → 灯光 → 筒灯
      他在 3D 场景中点击天花板位置
Then  一盏筒灯出现在天花板上
      灯具颜色为灯光子系统色 #d4a853
      灯具自动吸附天花板高度

场景 2：调整灯具参数
Given 设计师选中了刚放的筒灯
When  右侧属性面板弹出
      他拖动亮度滑块到 80%
      他拖动色温滑块到 3000K
Then  3D 中 PointLight 亮度同步变化
      光锥颜色变成暖黄色

场景 3：查看展示效果
Given 设计师放好了灯并调好了参数
When  他点击顶栏的 Preview 按钮
Then  编辑 UI 隐藏
      3D 场景全屏展示
      灯具发出可见光锥，地面有光斑
      他觉得"这就是我想给客户展示的效果"

场景 4：撤销/重做
Given 设计师放了一盏灯
When  他按 Cmd+Z
Then  灯消失了
When  他按 Cmd+Shift+Z
Then  灯恢复了

场景 5：保存/刷新
Given 设计师放了一盏灯并调了参数
When  他刷新页面
Then  灯还在，参数没丢
```

---

## 已有代码盘点（Kimi 已写的骨架）

| 模块 | 文件 | 行数 | 状态 | 需要改什么 |
|------|------|------|------|----------|
| Device Schema | `core/schema/nodes/device.ts` | 131 | ✅ 可用 | 确认已注册到节点系统 |
| 设备目录数据 | `smarthome/src/device-catalog.ts` | 433 | ✅ 可用 | 确认按子系统分类导出 |
| 设备状态管理 | `smarthome/src/device-state.ts` | 205 | ⚠️ 需检查 | 确认跟 Pascal useScene 联动 |
| 设备目录 UI | `editor/ui/device-catalog/device-catalog.tsx` | 119 | ⚠️ 需接入 | 还没挂到 Furnish 工具栏 |
| 设备放置工具 | `editor/tools/device/device-tool.tsx` | 110 | ⚠️ 需完善 | 只有地面放置，缺天花/墙面 |
| 设备渲染器 | `viewer/renderers/device/device-renderer.tsx` | 110 | ⚠️ 需检查 | 确认能渲染 device 节点 |
| 设备几何体 | `viewer/renderers/device/device-geometry.tsx` | 268 | ✅ 可用 | |
| 灯光效果 | `viewer/renderers/device/device-light.tsx` | 104 | ⚠️ 需检查 | 确认 PointLight + 光锥 |
| 光锥动画 | `viewer/renderers/device/animations/light-cone.tsx` | 127 | ✅ 可用 | 从 3Dhouse Demo 迁移的 |
| Proposal 布局 | `editor/proposal/proposal-layout.tsx` | 137 | ✅ 骨架有 | Preview 按钮接入 |

---

## 任务拆解（按执行顺序）

### Task 0：工具函数（1 天）

**位置**：`packages/smarthome/src/tools/`（新建目录）

```typescript
// place-device.ts
export function placeDevice(
  levelId: string,
  catalogId: string, 
  position: [number, number, number],
  params?: Partial<DeviceParams>
): string  // 返回新设备的 nodeId

// remove-device.ts
export function removeDevice(deviceId: string): void

// set-device-params.ts
export function setDeviceParams(
  deviceId: string, 
  params: Partial<DeviceParams>
): void
```

**验证**：在浏览器 console 里调用 `placeDevice('level-0', 'DL-01', [0, 2.5, 0])`，3D 中出现灯具。

**复用 Pascal**：内部调用 `useScene.getState().createNode()` / `updateNode()` / `deleteNode()`。自动获得 Undo/Redo + 持久化。

---

### Task 1：设备目录接入 Furnish（1 天）

**目标**：在 Furnish 工具栏的分类列表里加一个"智能"分类。

**改什么**：
- `packages/editor/src/components/ui/action-menu/furnish-tools.tsx` — 加"智能"分类按钮
- 点击"智能"后左侧栏显示 `DeviceCatalog` 组件（Kimi 已写好）
- `DeviceCatalog` 里 9 个子系统的 chip 筛选 → 设备列表 → 点击选中

**不做**：不另起独立 Tab。就是 Furnish 下面多一个分类。

**复用 Pascal**：完全复用 Furnish 的 UI 模式（分类按钮 → 物品列表 → 点击选中 → 放到场景）。

---

### Task 2：设备放置到 3D 场景（1-2 天）

**目标**：从目录选灯具 → 在 3D 场景中点击天花板 → 灯具出现。

**改什么**：
- `packages/editor/src/components/tools/device/device-tool.tsx` — 完善放置逻辑
  - Kimi 已有基础版（地面放置 + 网格吸附）
  - 需要加：天花板吸附（`mountType: 'ceiling'` 的设备自动放到天花高度）
  - 需要加：墙面吸附（`mountType: 'wall'` 的设备贴墙 + wallId 关联）

**复用 Pascal**：参考 `tools/item/placement-strategies.ts` 的 `ceilingStrategy` 和 `wallStrategy`，不重写。

**验证**：选筒灯 → 点天花板 → 灯具出现在 2.5m 高度。选面板 → 点墙面 → 面板贴墙。

---

### Task 3：设备渲染器验证（1 天）

**目标**：放置的设备在 3D 中可见，有正确的颜色和形状。

**检查项**：
- Device 节点能被 `SceneRenderer` 识别并分发到 `DeviceRenderer`
- 渲染简单几何体（筒灯=圆柱、面板=方块、AP=圆盘）
- 颜色 = 子系统色
- Lighting 子系统设备附带 PointLight（`device-light.tsx`）
- 光锥效果生效（`animations/light-cone.tsx`）

**可能需要改**：
- `packages/viewer/src/components/viewer/index.tsx` — 确认 `DeviceRenderer` 被引入
- `packages/viewer/src/components/renderers/scene-renderer.tsx` — 确认有 `case 'device'` 分支

---

### Task 4：设备属性面板（1 天）

**目标**：选中灯具 → 右侧面板显示亮度/色温/光束角滑块 → 拖滑块 3D 同步变化。

**改什么**：
- `packages/editor/src/components/ui/panels/panel-manager.tsx` — 加 `case 'device': return <DevicePanel />`
- 新建 `packages/editor/src/components/ui/panels/device-panel.tsx`
  - 基础信息：产品名称、子系统、安装类型
  - 灯光参数（仅 lighting 子系统）：亮度滑块、色温滑块、光束角滑块
  - 通用参数：方向角度、覆盖范围
  - 操作按钮：移动、复制、删除

**复用 Pascal**：完全复用 `PanelSection` + `MetricControl` + `SliderControl` 组件。样式自动一致。

**验证**：选灯 → 拖亮度到 50% → 3D 中灯变暗。拖色温到 2700K → 灯变暖黄。

---

### Task 5：展示模式入口（0.5 天）

**目标**：点击 Preview 按钮 → 隐藏编辑 UI → 全屏 3D → 设备动画效果可见。

**改什么**：
- Pascal 已有 Preview 模式（`isPreviewMode` + `readOnly`）
- 确认 Preview 模式下设备动画（光锥呼吸等 L1 效果）正常运行
- Kimi 的 `proposal-layout.tsx` 如果需要可以作为 Preview 模式的 UI 覆盖层

**复用 Pascal**：Preview 按钮和 readOnly 切换已有。

**验证**：编辑模式放灯 → 点 Preview → 全屏看到光锥 → 点返回回到编辑。

---

### Task 6：端到端测试（0.5 天）

走通完整流程，逐条验证 BDD 场景 1-5：
1. 画 4 面墙
2. Furnish → 智能 → 灯光 → 筒灯 → 点天花放置
3. 选中 → 属性面板 → 调亮度/色温
4. Preview 模式 → 看到光锥
5. Cmd+Z 撤销 → 灯消失 → Cmd+Shift+Z 恢复
6. 刷新页面 → 灯还在

---

## 工作量估算

| Task | 工作量 | 说明 |
|------|--------|------|
| T0 工具函数 | 1 天 | 三个函数 + console 验证 |
| T1 目录接入 | 1 天 | Furnish 加分类 + DeviceCatalog 挂载 |
| T2 设备放置 | 1-2 天 | 天花/墙面吸附 + 复用 placement-strategies |
| T3 渲染器验证 | 1 天 | 接入 SceneRenderer + 检查光效 |
| T4 属性面板 | 1 天 | DevicePanel + 滑块联动 |
| T5 展示入口 | 0.5 天 | Preview 模式验证 |
| T6 端到端 | 0.5 天 | 跑通 5 个 BDD 场景 |
| **合计** | **5-6 天** | |

---

## 不做（明确排除）

| 功能 | 原因 | 哪个 Sprint |
|------|------|------------|
| 设备点击开关灯（L2） | S1 只做 L1 常驻可视化 | S2 |
| 面板按键联动 | 需要场景系统 | S2 |
| 场景编辑器 | 需要时间线 UI | S3 |
| 窗帘/传感器/暖通动画 | S1 只做灯光 | S3 |
| 多 AP 覆盖 | 需要信号计算 | S4 |
| 导出 Excel/PDF | 需要导出系统 | S4 |
| 分享链接 | 需要后端 | S5 |

---

## 风险

| 风险 | 概率 | 对策 |
|------|------|------|
| DeviceNode 未注册到 Pascal 节点系统 | 高 | T0 第一件事检查 `schema/index.ts` |
| SceneRenderer 没有 device 分支 | 高 | T3 检查并添加 |
| 天花吸附高度不对 | 中 | 复用 Pascal 的 ceilingStrategy |
| Preview 模式下动画不渲染 | 中 | T5 确认 useFrame 在 readOnly 下仍运行 |
| Kimi 骨架代码有编译错误 | 中 | T0 先跑 `bun dev` 确认无报错 |
