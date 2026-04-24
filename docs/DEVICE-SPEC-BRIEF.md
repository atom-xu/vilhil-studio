# 设备通用定义模块（DeviceSpec）— 交接 Brief

> 本文档是给**下一个接手的 AI / 开发者**的冷启动说明，不依赖任何此前的对话上下文。
> 目的：确立"每个智能设备 = 一份声明式规格文件（DeviceSpec）"这个架构方向，并划定下一阶段**决策**范围。
>
> **当前版本：v2（2026-04-23）**
> **v2 变更概要**：v1 假设 effect 层基本没开工、需要先调研摸底。实际上在 v1 发布（4-21）到 v2 修订（4-23）之间，Claude Code 跳过调研直接实现了 7 种 effect 的参数化组件（约 2100 行动画代码），并自行引入了 editor/demo 渲染分离、9 子系统大 switch 分发器等架构决策。本 v2 基于新代码现状，把原来的"摸底调研"改为"评估 + 决策"，缩小后续工作面。

---

## 1. 背景与问题陈述（v1 未变更）

### 1.1 现状观察

项目已经走到一个关键节点：

- 基础设施层（建筑/户型编辑、展示页、昼夜滑块、场景按钮、账号体系、分享链接、云端持久化）**已基本到位**。
- 设备系统底层（8 个工具函数、useScene 真值、设备目录 1300+ 行 metadata）**已能跑**。
- **v2 补充**：设备的 3D 效果层（光锥 / 检测锥 / FOV / WiFi 热力 / 气流 / 窗帘动画 / 指示灯）**也都能跑**，但都是以"一个 effect 一个独立组件 + 大 switch 分发"的方式实现，没有统一 Spec 抽象。

### 1.2 问题（v2 修订）

每加一个新设备或新子系统，开发者需要同时触碰：

- 3D 几何体渲染代码（device-geometry.tsx 里加 renderType case）
- effect 组件（animations/ 下新建或修改）
- effect 分发器（device-effects.tsx 里加 switch 分支）
- 详情面板 UI（device-info-card 里加硬编码判断）
- 参数滑块组件
- 点击 / 场景响应行为
- 工具函数调用

**已有实现缓解了一部分问题（不再需要每加一个 effect 从零写动画），但"加设备仍然要跨多个文件手工改"的痛点没有根治。switch-case 模式能撑到 15 个设备左右，超过就会崩盘。**

### 1.3 目标（v2 修订）

**短期**：评估当前命令式（switch + 组件）实现是否可接受，界定它的可维护性上限。

**中期**：如有必要，抽象一个 **DeviceSpec** 声明式规格：每个设备由一份数据文件定义身份 / 物理 / 几何 / 效果 / UI / 交互。渲染器、面板、工具函数**从 Spec 读取**，不针对具体设备写代码。

**非目标**：推翻当前已能跑的实现。如果 switch 模式在可维护性评估里证明够用，就接受它作为中间态，不做"架构洁癖式"重写。

---

## 2. 当前代码现状（v2 重写）

### 2.1 v1 → v2 的关键变化

v1 说"效果层几乎没开工（除灯光）"——**已过时**。截至 2026-04-23：

- **7/7 种 effect 全部实现**（含参数化）
- **引入了编辑器 / 演示页渲染双轨**（`device-render-mode.tsx`）
- **引入了 9 子系统大 switch 分发器**（`device-effects.tsx`）
- **device-catalog 扩展了窗帘 4 种、网络 4 种设备**
- **schema 扩展了 `CurtainLayerSchema` + `layers` + `buttonCount`**
- **`proposal-demo/page.tsx` 拆分为 `_modules/` 下 8 个文件**

### 2.2 设备系统资产清单（v2）

#### 渲染层

| 能力 | 文件 | 状态 |
|------|------|------|
| Schema 定义 | `packages/core/src/schema/nodes/device.ts` | ✅ 已扩展 layers/buttonCount |
| 渲染模式上下文 | `packages/viewer/src/components/renderers/device/device-render-mode.tsx` | ✅ **新增**，分 `base`/`demo` 两模式 |
| 渲染主入口（演示页） | `packages/viewer/src/components/renderers/device/device-renderer.tsx` | ✅ 已 refactor |
| 编辑器 2D 投影 | `packages/viewer/src/components/renderers/device/editor-device-indicator.*` | ✅ 已分离 |
| 几何体分发 | `packages/viewer/src/components/renderers/device/device-geometry.tsx` | ✅ 20+ renderType case |
| 效果层分发器 | `packages/viewer/src/components/renderers/device/device-effects.tsx` | ⚠️ **大 switch-case（174 行 / 9 子系统）** |

#### 效果实现（已全部实现）

| Effect 类型 | 实现文件 | 行数 | 参数化 |
|------|------|------|------|
| light-cone | `animations/light-cone.tsx` | 143 | 中 |
| detection-cone（激光扫描） | `animations/laser-scan-cone.tsx` | 175 | 高 |
| fov-cone（摄像头） | `animations/camera-fov.tsx` | 106 | 高 |
| signal-coverage（WiFi 热力） | `animations/wifi-heatmap.tsx` | 233 | 高（Shader） |
| signal-coverage（网络覆盖） | `animations/network-heatmap-overlay.tsx` | 115 | 高 |
| airflow-particles | `animations/hvac-airflow.tsx` + `hvac-ribbon-flow.tsx` | 131 + 356 | 高 |
| curtain-animation | `animations/curtain-panel.tsx` + `curtain/` 4 文件 | 109 + … | 高 |
| indicator-light | 嵌入 `device-geometry.tsx` 的 PanelGeometry | — | 低 |
| architecture-hub（总线节点） | `animations/architecture-hub.tsx` | 89 | 高 |
| bus-visualizer（总线数据流） | `animations/bus-visualizer.tsx` | 201 | 高 |
| particle-coverage（PIR） | `animations/particle-coverage.tsx` | 214 | 高 |
| speaker-waves | `animations/speaker-waves.tsx` | 90 | 高 |
| xray-overlay（X 射线透视） | `animations/xray-overlay.tsx` | 137 | 低 |

**关键观察**：每个 effect 都有自己的 `Props` 接口形状，**彼此不兼容**——`HvacAirflow` 接 `mode/intensity/height`，`CameraFOV` 接 `fov/range/direction`，`WifiHeatmap` 接 Shader uniforms。所以 `device-effects.tsx` 必须手工处理每种情况。

#### 设备目录与工具

| 能力 | 文件 | 状态 |
|------|------|------|
| 设备目录 metadata | `packages/smarthome/src/device-catalog.ts` | ✅ 已扩展窗帘 4 + 网络 4 |
| 设备工具函数 | `packages/smarthome/src/tools/*.ts` | ✅ 8 个函数（v1 未变） |
| 设备状态存储 | `packages/smarthome/src/device-state.ts` | ✅ v1 未变 |

#### UI 与展示

| 能力 | 文件 | 状态 |
|------|------|------|
| 编辑器详情面板 | `packages/editor/src/components/ui/panels/device-panel.tsx` | ✅ v1 未变 |
| 展示模式设备信息卡 | `packages/editor/src/components/proposal/device-info-card.tsx` | ⚠️ **硬编码各子系统 UI**（窗帘层控制 / HVAC 冷热 / 百叶角度各自独立分支） |
| 展示页模块化 | `apps/editor/app/proposal-demo/_modules/` | ✅ **新增** 8 个模块（camera/geometry/hud/items/lighting/render-presets/structure/types） |

#### 未完成能力

- ❌ **统一 Effect 接口**——每个 effect 的 Props 形状不同，没有共同签名
- ❌ **声明式 DeviceSpec 数据文件**——所有设备元信息散落在 device-catalog、device-geometry、device-effects 的 switch 分支里
- ❌ **子系统详情页路由**（`/subsystem/[id]`）——v1 第 5 节调研 5 至今仍未做
- ❌ **天花板 / 墙面吸附**（device-tool 只支持地面）
- ❌ **自动生成的参数 UI**——device-info-card 全是手写

### 2.3 不要重建的部分

- Better Auth / PostgreSQL / 分享链接 / 昼夜 / 场景按钮 / 光锥 / 光斑（v1 已说明）
- **v2 补充**：已实现的 13 个动画组件不要丢——它们作为"effect 实现"这一层是合格的，值得保留作为未来 EffectPlugin 的具体实现。要重构的是**分发层**（device-effects.tsx）和**接口**，不是这些组件。

---

## 3. DeviceSpec 六层定义（v2 小改，标注已实现部分）

DeviceSpec 是一份 TypeScript 声明对象（可能配合少量注册制策略函数），覆盖以下六层：

### 第 1 层：身份层（Identity） ✅ 部分已实现

- `id` / `catalogId` / `displayName` / `subsystem` / `category`
- 品牌、型号、SKU
- 规格参数（功率 / 尺寸 / 色温范围 / 电压 / 协议等）
- **现状**：`device-catalog.ts` 已有基础字段。缺：品牌 / SKU / 协议类型未规范化。

### 第 2 层：物理层（Physical） ⚠️ 部分已实现

- `mountType`: `'ceiling' | 'wall' | 'floor' | 'recessed' | 'surface-mount' | 'in-wall'`
- `occupies`: 占位尺寸
- 吸附规则
- 与墙/门/窗的关联关系
- **现状**：`CurtainLayerSchema` / `layers` / `buttonCount` 新增。缺：吸附策略仍只支持地面；`mountType` 字段未贯穿。

### 第 3 层：3D 呈现层（Geometry） ✅ 已实现

- 几何体定义：`device-geometry.tsx` 20+ renderType case
- 材质、贴图、子系统色
- **现状**：命令式 switch-case 模式，加新设备要改主文件。

### 第 4 层：效果层（Effect） ✅ 已实现（但需重新评估接口）

- **7/7 种 effect 类型全部落地**（见第 2.2 节）
- 每个 effect 组件参数化良好，能被状态驱动
- **缺口**：没有统一 EffectPlugin 接口；`device-effects.tsx` 通过 switch-case 手工分发

### 第 5 层：UI 展示层（Presentation） ⚠️ 硬编码

- `icon` / `previewImage` / `listCard` / `detailPanel` / `editorPanel`
- `parameterControls`：声明式的滑块 / 开关 / 枚举选择器
- **现状**：`device-info-card.tsx` 硬编码各子系统 UI 分支。没有声明式生成。

### 第 6 层：交互层（Interaction） ✅ 已实现

- L1 常驻可视化：所有 13 个 effect 组件都是 L1
- L2 直接操控：scene-bar 的场景按钮能批量 `setDeviceState`
- L3 场景响应：scene-tools 引擎完整
- `defaultState` / `capabilities`：未规范化

---

## 4. 已被 Claude Code 隐性回答的方向问题（v2 重写）

v1 的三个方向问题原本由项目负责人定性。实际情况是 Claude Code 在 v1 发布到 v2 修订之间**跳过调研直接实现**，对这三个问题做了临时决策。你需要**验证 / 确认 / 翻盘** 这些决策。

### 4.1 垂直打穿 vs 横向铺平？

- **Claude Code 的实际选择**：**横向先铺**。一次性实现了 9 个子系统的 effect 组件，没有选一个子系统作为完整样板。
- **带来的结果**：广度有了，深度不均——灯光有光锥但 UI 面板没升级；窗帘有 4 种动画但没做分享给客户的详情卡。
- **你需要决定**：接受当前的"横向铺开但每个都浅"，还是补一次"垂直打穿"把灯光作为完整样板？

### 4.2 视觉细节 vs 功能细节？

- **Claude Code 的实际选择**：**以视觉细节为主，附带部分功能细节**。
  - 视觉：13 个动画组件、LED 闪烁、按键反馈、HVAC 风场
  - 功能：窗帘层数、HVAC 冷热模式、百叶角度
  - 缺失：设备所在场景、被谁触发、联动关系、历史状态
- **你需要决定**：当前深度够不够？如果要补"功能细节"层，加在哪——设备信息卡？独立浮层？

### 4.3 纯声明 vs 声明 + 策略混合？

- **Claude Code 的实际选择**：**策略为主，没走声明式路径**。Props 接口参数化了每个 effect 组件，但 `device-effects.tsx` 是命令式大 switch，`device-info-card.tsx` 也是命令式分支。
- **带来的结果**：能跑、改单个 effect 不难，但加新子系统要改 switch；并且每个 effect 的 Props 不兼容，没法用同一套元数据描述。
- **你需要决定**：接受命令式实现作为中间态？还是现在就抽 `EffectPlugin` 统一接口？成本收益怎么算？

---

## 5. 新的调研任务（v2 重写：从"摸底"变成"评估决策"）

> **v1 的 5 项摸底调研基本已被代码隐性回答**（因为 effect 都实现了、渲染分离也做了、设备目录扩展也做了）。v2 的调研任务转向"评估当前实现 + 决定是否抽象"。
> **调研阶段不写代码，产出决策依据。**

### 调研 1：switch-case 模式的可维护性上限

- 当前 `device-effects.tsx` 174 行管 9 个子系统。
- 现在有多少个 renderType / effect 分支？
- 如果再加 10 种设备（同 + 异新子系统各半），switch 分支要增多少？文件会变多长？
- 何时到临界点（负责人读不懂 / 改一个 case 会误改其他 / merge 冲突频繁）？
- 当前 `device-info-card.tsx` 的硬编码 UI 分支有同样问题吗？

**输出**：一份"当前 switch-case 规模 + 增速推演 + 临界点估算"。

### 调研 2：EffectPlugin 接口是否值得抽？

13 个 effect 组件的 Props 形状不一样。评估：

- 能不能抽出一个共同的 `EffectPlugin` 接口（形如 `{ apply(node, ctx): ReactNode }`）而不破坏已有实现？
- 抽象的代价：改多少行、风险点在哪？
- 抽象的收益：新增 effect 的边际成本降低多少？消除 switch-case 的好处有多大？

**输出**：一份"抽 vs 不抽"的成本收益表。

### 调研 3：editor / demo 渲染分离策略是否保留？

`device-render-mode.tsx` 是 Claude Code 自作决策。评估：

- 这个分离在性能上有实际价值吗（编辑器是不是真的因此快了）？
- 它增加了多少心智负担（开发者要理解两套渲染路径）？
- 如果保留，是否应该写进 CLAUDE.md 作为官方架构决策？
- 如果废除，能否合并回单一渲染路径？

**输出**：一份"保留 / 废除 / 改名"的推荐。

### 调研 4：子系统详情页路由的信息架构

v1 的第 5 节调研 5 至今未完成，依然需要。问题：

- 左侧 9 个子系统按钮目前点击行为是什么？
- `/subsystem/[id]` 详情页内容能否**完全由属于该子系统的 DeviceSpec 列表驱动**？
- 编辑模式（放设备）和展示模式（看设备状态）共用这个页面结构吗？
- 现有 `proposal-demo/_modules/hud.tsx` 里有相关代码可复用吗？

**输出**：子系统详情页的信息架构草图。

### 调研 5：light-cone 样板如何反向对齐

`light-cone.tsx` 是最早的 effect 组件，其 Props 接口跟后来的 12 个组件**不是同一种风格**。评估：

- 要不要让 light-cone 反过来对齐新风格？
- 如果将来抽 EffectPlugin，light-cone 会是最小改动还是最大改动？

**输出**：一份 light-cone 对齐方案或"不动"的理由。

---

## 6. 明确不做的事（v2 小改）

- **不实现代码**。本阶段输出 = 评估报告 + 方向判断依据。
- **不重建已经能跑的东西**（账号 / 分享 / 昼夜 / 场景按钮 / 光锥 / 13 个 effect 组件）。
- **不扩展到"可操控的真实 IoT 联动"**。当前目标仍是"方案展示"，不是"实控"。
- **不纠结真实产品库对接**。Spec 先留接口字段，数据怎么来是后续议题。
- **不做天花 / 墙面吸附的实现**。依然属于调研范围外；等 DeviceSpec 框架出来再决定怎么做。
- **v2 新增**：**不要重写或废弃 13 个已有的 effect 组件**。它们是合格的实现，重构只涉及分发层和接口层。
- **v2 新增**：**不要在没有数据的情况下推翻 Claude Code 的 editor/demo 分离**。调研 3 的结论出来之前保留现状。

---

## 7. 交接检查清单（v2）

下一个接手的人应该：

- [ ] 读完本 Brief（特别是 v2 变更概要和第 4 节的"隐性决策"）
- [ ] 读 `docs/ROADMAP-BDD.md` 确认 Sprint 目标没变
- [ ] 读 `docs/BDD-REQUIREMENTS.md` 确认 L1/L2/L3 分级定义
- [ ] 读 `docs/STATE-FLOW.md` 和 `docs/DATA-SCHEMA.md` 确认真值边界
- [ ] **完成第 5 节的 5 项评估调研**（不是 v1 的摸底任务）
- [ ] 把调研结论汇总给项目负责人
- [ ] 等负责人回答第 4 节三个隐性决策的取舍后，再进入 DeviceSpec 接口设计

**不要跳过任何一步。特别是不要再发生"跳过调研直接实现"的情况——v1 就是这样被推翻的。**

---

## 8. 变更历史

- **v2 (2026-04-23)**：基于 Claude Code 在 v1 发布后的实际实现状态修订。重写第 2、4、5 节；小改第 1、3、6 节；新增第 8 节。核心变化：从"摸底调研"转为"评估决策"，承认 effect 层已实现的事实，把方向问题从"待定"变成"已被 Claude Code 隐性回答、需要负责人确认或翻盘"。
- **v1 (2026-04-21)**：初版。基于当时"effect 层几乎没开工"的认知，设计 5 项摸底调研任务。
