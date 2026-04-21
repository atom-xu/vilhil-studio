# 设备通用定义模块（DeviceSpec）— 交接 Brief

> 本文档是给**下一个接手的 AI / 开发者**的冷启动说明，不依赖任何此前的对话上下文。
> 目的：确立"每个智能设备 = 一份声明式规格文件（DeviceSpec）"这个架构方向，并划定下一阶段调研范围。
> 创建日期：2026-04-21

---

## 1. 背景与问题陈述

### 1.1 现状观察

项目已经走到一个关键节点：

- 基础设施层（建筑/户型编辑、展示页、昼夜滑块、场景按钮、账号体系、分享链接、云端持久化）**已基本到位**。
- 设备系统底层（8 个工具函数、useScene 真值、光锥与地面光斑效果、设备目录 1300+ 行 metadata）**已能跑**。
- 但左侧 9 个子系统入口**点下去没有详情页**；设备目录条目虽多，却**没有统一的"展示 / 详情 / 参数 / 交互"规范**。

### 1.2 问题

每加一个新设备或新子系统，开发者需要同时触碰：

- 3D 几何体渲染代码
- 光效 / 检测锥 / 信号覆盖等效果代码
- 详情面板 UI
- 参数滑块组件
- 点击 / 场景响应行为
- 工具函数调用

**这些改动散落在 5~6 个包里，没有统一入口。结果是：子系统越多，维护成本越大，项目越做越慢。**

### 1.3 目标

建立一个 **DeviceSpec** 抽象：每个设备由**一份声明式规格文件**定义。添加新设备 = 写一份新 Spec；扩展新子系统 = 写若干份 Spec。渲染器、面板、工具函数**从 Spec 读取**，不针对具体设备写代码。

---

## 2. 当前代码现状（已盘点）

### 2.1 可直接拼入 DeviceSpec 的已有资产

| 能力 | 文件 | 备注 |
|------|------|------|
| 设备 Schema 定义 | `packages/core/schema/nodes/device.ts` | 节点类型已注册到 Pascal 节点系统 |
| 设备目录 metadata | `packages/smarthome/src/device-catalog.ts` | 1300+ 行，9 个子系统分类 |
| 设备状态存储 | `packages/smarthome/src/device-state.ts` | UI 偏好层，和 useScene 已联动 |
| 设备工具函数 | `packages/smarthome/src/tools/*.ts` | place/remove/setParams/toggle/panel-action/scene-tools/topology-tools/export-device-list |
| 3D 几何体渲染 | `packages/viewer/src/components/renderers/device/device-geometry.tsx` | 268 行，子系统分色 |
| 灯光效果（光锥 + 光斑） | `packages/viewer/src/components/renderers/device/device-light.tsx` + `animations/light-cone.tsx` | PointLight + 圆锥几何体 + falloff 贴图 |
| 设备渲染器主入口 | `packages/viewer/src/components/renderers/device/device-renderer.tsx` | 订阅 useScene.nodes 自动 re-render |
| 设备详情面板 | `packages/editor/src/components/ui/panels/device-panel.tsx` | 亮度 / 色温 / 光束角滑块已联动 3D |
| 展示模式设备信息卡 | `packages/editor/src/components/proposal/device-info-card.tsx` | 实时读取设备状态 |
| 设备放置工具 | `packages/editor/src/components/tools/device/device-tool.tsx` | **只支持地面放置，缺天花/墙面吸附** |

### 2.2 缺失但必需的能力

- **子系统详情页**：`/subsystem/[id]` 路由不存在，左侧按钮仅切换本地 state。
- **天花 / 墙面吸附**：device-tool 只实现地面放置。
- **非灯光子系统的效果层**：检测锥（PIR）、信号覆盖（WiFi/AP）、气流粒子（暖通）、开合动画（窗帘）、FOV 锥（摄像头）—— 几何体有，动态效果几乎没开工。
- **设备详情卡的"功能细节"**：客户在展示模式点一盏灯，看到的是亮度滑块，不是"这盏灯属于哪些场景、最近被谁触发、可控制项有哪些"。

### 2.3 不要重建的部分

- Better Auth / PostgreSQL / 分享链接 — 已完整。
- 昼夜滑块、场景按钮、DIGITAL TWIN 卡 — 已是真功能。
- 光锥与光斑 — 已能跑，**作为"效果层"的样板**。

---

## 3. DeviceSpec 六层定义

DeviceSpec 是一份 TypeScript 声明对象（可能配合少量注册制策略函数），覆盖以下六层：

### 第 1 层：身份层（Identity）

- `id` / `catalogId` / `displayName` / `subsystem` / `category`
- 品牌、型号、SKU（对接未来的真实产品库）
- 规格参数（功率 / 尺寸 / 色温范围 / 电压 / 协议等）

### 第 2 层：物理层（Physical）

- `mountType`: `'ceiling' | 'wall' | 'floor' | 'recessed' | 'surface-mount' | 'in-wall'`
- `occupies`: 占位尺寸 `{ width, depth, height }`
- 吸附规则：允许的放置面、偏移量、自动朝向逻辑
- 与墙/门/窗的关联关系（例如窗帘电机关联 windowId）

### 第 3 层：3D 呈现层（Geometry）

- 几何体定义（复用 / 引用 `device-geometry.tsx` 的现有形状库）
- 材质、贴图、子系统色
- 选中态 / 悬停态 / 禁用态的视觉反馈

### 第 4 层：效果层（Effect）

这是 Demo 体验的核心，也是目前最不标准化的部分。候选效果类型（可插拔）：

- `light-cone`：光锥 + 地面光斑（灯光）— 已实现
- `detection-cone`：检测锥（PIR、雷达）— 几何体有，效果未做
- `fov-cone`：视野锥（摄像头）— 几何体有，效果未做
- `signal-coverage`：信号覆盖（WiFi/AP/Zigbee 网关）— 未做
- `airflow-particles`：气流粒子（暖通出风口）— 未做
- `curtain-animation`：开合动画（窗帘）— 未做
- `indicator-light`：状态指示灯（门锁、烟感）— 未做

**每个 DeviceSpec 声明自己挂哪几种 effect 及其参数**。效果实现作为独立模块（类似 plugin）注册。

### 第 5 层：UI 展示层（Presentation）

- `icon`：目录列表图标
- `previewImage`：目录卡预览图
- `listCard`：目录中的紧凑卡片 UI
- `detailPanel`：展示模式点击设备后弹出的详情卡（客户视角）
- `editorPanel`：编辑模式右侧属性面板（设计师视角）
- `parameterControls`：声明式的滑块 / 开关 / 枚举选择器列表（含单位 / 量程 / 步长）

### 第 6 层：交互层（Interaction）

按 `docs/BDD-REQUIREMENTS.md` 和 ROADMAP 中的 L1/L2/L3 分级：

- **L1 常驻可视化**：设备一放下就自动呈现的"活着"的效果（呼吸光、气流粒子等）
- **L2 直接操控**：展示模式下客户点击设备触发的行为（开关灯、开合窗帘）
- **L3 场景响应**：被场景系统（回家 / 观影 / 离家）编排时如何响应参数变化
- `defaultState`：初始状态
- `capabilities`: `['dimmable', 'color-tunable', 'scene-controllable', ...]` — 声明设备支持哪些能力，用于自动生成 UI 控件

---

## 4. 悬而未决的方向问题

以下三个问题必须**先由项目负责人定性**，然后再进入架构设计。调研阶段不需要给答案，但要把每个选项的代价 / 收益算清楚。

### 4.1 垂直打穿 vs 横向铺平？

- **A. 垂直打穿灯光子系统**：把灯光作为完整样板，6 层全部做到位；其他 8 个子系统后续照着做。
- **B. 横向先铺 DeviceSpec 框架**：先定义接口、9 个子系统各写骨架、再逐步填充细节。

### 4.2 "设备的细节和功能"指哪一层？

- **视觉细节**：设备自身造型、品牌 logo、选中高亮、动态反馈。
- **功能细节**：当前状态、所在场景、可控制项、历史触发记录、与其他设备的联动关系。

### 4.3 DeviceSpec 是纯声明还是声明 + 策略函数混合？

- **纯声明**（TS 数据对象）：易维护、易校验、难表达复杂行为。
- **混合**：基础属性声明式、复杂效果走注册制策略函数。

---

## 5. 给 Claude Code 的调研任务清单

> **重要：这一阶段只做调研，不做实现。**
> 负责人要基于调研结果决定第 4 节那三个方向问题的答案，再进入设计 / 编码。

### 调研 1：六层现状摸底

对六层中的每一层，回答：

1. 当前代码里已经有哪些文件 / 数据 / 逻辑承担这一层的职责？
2. 承担得是否集中（一个入口）还是分散（多处）？
3. 每种设备都在重复写，还是已经有了共用抽象？
4. 如果要从"命令式代码"迁移到"声明式 Spec"，迁移成本大致如何？

**输出**：六层各一小节，每节 200-400 字。

### 调研 2：灯光子系统深度剖析

灯光已经是最完整的子系统。调研：

1. 从 `device-catalog.ts` 的筒灯 / 灯带 / 吊灯 / 壁灯四项入手，列出每项当前"分散在多少个文件"里才能完整定义。
2. 如果要把这 4 项改写成 DeviceSpec，每份 Spec 大概要写哪些字段？
3. `device-light.tsx` + `light-cone.tsx` 的效果如何抽象成可复用的 `light-cone` effect 模块？接口怎么设计？

**输出**：一份灯光子系统的"Spec 化迁移可行性报告"。

### 调研 3：效果层的可插拔性

逐一评估第 3 节列出的 7 种 effect 类型：

1. 哪些已有代码可复用？
2. 哪些完全要新写？
3. 它们有没有共同的"接口形状"（例如：输入 device 状态 + 场景环境光，输出 3D 节点 / 动画帧）？
4. 是否值得抽象一个 `EffectPlugin` 基础接口？

**输出**：7 种 effect 的对照表 + 是否需要统一基础接口的判断。

### 调研 4：UI 展示层的自动生成可行性

1. 如果 DeviceSpec 第 5 层提供 `parameterControls` 声明，能否自动渲染出现有 `device-panel.tsx` 中的滑块 UI？
2. 现有 `MetricControl` / `SliderControl` / `PanelSection` 是否足以支撑声明式渲染？还是需要包一层 `<ParameterControl spec={...} />`？
3. 展示模式的详情卡（客户视角）和编辑模式的属性面板（设计师视角）能否共用同一套声明？

**输出**：一份"UI 声明式渲染"的可行性判断。

### 调研 5：子系统详情页路由设计

1. 左侧 9 个子系统按钮目前点击行为是什么（只切 state 还是跳路由）？
2. 如果要做 `/subsystem/[id]` 详情页，这些页面内容是否可以**完全由属于该子系统的 DeviceSpec 列表驱动**？
3. 编辑模式（放设备）和展示模式（看设备状态）共用这个页面结构吗？

**输出**：子系统详情页的信息架构草图。

---

## 6. 明确不做的事

- **不实现代码**。本阶段输出 = 调研报告 + 方向判断依据。
- **不重建已经能跑的东西**（账号、分享、昼夜、场景按钮、光锥）。
- **不扩展到"可操控的真实 IoT 联动"**。当前目标仍是"方案展示"，不是"实控"。
- **不纠结真实产品库对接**。Spec 先留接口字段，数据怎么来是后续议题。
- **不做天花 / 墙面吸附的实现**。虽然是缺口，但本阶段属于调研范围外；等 DeviceSpec 框架出来再决定怎么做。

---

## 7. 交接检查清单

下一个接手的人（AI 或开发者）应该：

- [ ] 读完本 Brief
- [ ] 读 `docs/ROADMAP-BDD.md` 确认 Sprint 目标没变
- [ ] 读 `docs/BDD-REQUIREMENTS.md` 确认 L1/L2/L3 分级定义
- [ ] 读 `docs/STATE-FLOW.md` 和 `docs/DATA-SCHEMA.md` 确认真值边界（useScene vs useDeviceState）
- [ ] 完成第 5 节的 5 项调研
- [ ] 把调研结论汇总给项目负责人
- [ ] 等负责人回答第 4 节三个方向问题后，再进入 DeviceSpec 的接口设计

**不要跳过任何一步。**
