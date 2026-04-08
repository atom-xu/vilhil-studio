# VilHil Studio — 开发规约

> 本文件在每次 AI 辅助开发会话开始时自动读入。所有规则 **必须遵守**。

---

## 项目定位

**VilHil Studio** — 基于 Pascal Editor 的智慧方案交付系统。设计师在 3D 空间里画户型、放设备、配场景，客户在同一个 3D 空间里点灯、按面板、拉窗帘，所见即所得。

**两种模式**：
- **编辑模式**：设计师画墙放设备配场景（Pascal Editor + VilHil 智能家居层）
- **展示模式**：客户自由浏览方案，操控设备体验效果（Proposal UI）

**核心价值**：设计师说"你试试按一下这个面板"，客户按了，灯亮了，成交。

---

## 架构：Pascal Editor + VilHil 智能家居层

```
┌─────────────────────────────────────────────────┐
│                  apps/editor                     │ Next.js 16 应用
│  page.tsx（编辑模式）  proposal/page.tsx（展示模式）│
├─────────────────────────────────────────────────┤
│              packages/editor                     │ UI 组件 + 工具
│  ├─ tools/（画墙/放门窗/放设备）                   │
│  ├─ panels/（属性面板）                           │
│  ├─ proposal/（展示模式 UI）                      │
│  └─ device-catalog/（设备目录）                   │
├─────────────────────────────────────────────────┤
│              packages/viewer                     │ 3D 渲染层
│  ├─ renderers/（墙/楼板/门窗/设备）               │
│  ├─ effects/（动画效果）                          │
│  └─ post-processing/（SSGI/Outline）             │
├─────────────────────────────────────────────────┤
│              packages/core                       │ 数据 + 状态
│  ├─ schema/（节点类型定义：Wall/Door/Device/Scene）│
│  ├─ systems/（几何生成系统）                       │
│  └─ store/（Zustand 状态管理）                    │
├─────────────────────────────────────────────────┤
│            packages/smarthome                    │ 智能家居独立包
│  ├─ device-catalog.ts（设备产品目录）              │
│  ├─ device-state.ts（设备运行时状态）              │
│  └─ subsystem-meta.ts（9子系统元数据）            │
└─────────────────────────────────────────────────┘
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | React 19 + Next.js 16 |
| 构建 | Turborepo + Bun |
| 3D | Three.js 0.183 + R3F 9 + drei 10 |
| 渲染器 | WebGPU（THREE.WebGPURenderer）|
| 后处理 | SSGI + TRAA + Outline（WebGPU TSL）|
| 状态 | Zustand 5 + Zundo（undo/redo）|
| 几何 | three-bvh-csg（布尔运算）|
| CSS | Tailwind 4 + Radix UI |
| Schema | Zod 4 |

---

## 9 子系统（已锁定）

```
architecture  — 架构    #94a3b8
lighting      — 灯光    #d4a853
panel         — 面板    #c8b8a0
sensor        — 传感器  #4ade80
curtain       — 窗帘    #3dd9b6
hvac          — 暖通    #9b7bea
av            — 影音    #5ba0f5
security      — 安防    #f59e0b
network       — 网络    #60a5fa
```

品牌主色：`#2D7FF9`

---

## 四层交互体系

| 层级 | 名称 | 交互方式 | 优先级 |
|------|------|---------|--------|
| L1 | 常驻可视化 | 无交互，设备自己活着 | P0 |
| L2 | 设备直接操控 | 点击/拖拽设备 | P1 |
| L3 | 场景联动 | 点击场景卡片 | P2 |
| L4 | 设备详情 | 查看参数规格 | P3 |

---

## BDD 开发原则

### 从用户行为出发

每个功能先描述"用户做了什么 → 看到什么 → 感受到什么"，再写代码。

### 动工前三问

1. 这个功能解决用户的什么问题？
2. 用户操作时的理想体验是什么？
3. 做完之后，用户会不会自然地说"好用"？

### 功能描述格式

```
场景：设计师给客户演示灯光场景
Given 客户正在看客厅 3D 视图
When  设计师点击"回家模式"场景卡片
Then  筒灯渐亮到暖白 3000K，灯带亮起氛围光，窗帘缓缓关闭
      客户感受到"这就是我回家时的样子"
```

---

## 开发规约

### 1. 修改前必读
- 修改任何文件前先读它，了解上下文
- 涉及子系统分类时对照9分类表
- Pascal 核心代码（wall/slab/ceiling/roof）谨慎修改

### 2. 性能规则
- useFrame 内绝不触发 React re-render
- 动画用 ref 直接更新，不用 setState
- 新增 3D 组件必须考虑 geometry dispose
- 粒子系统优先用 shader 驱动（GPU 端），避免 JS 逐粒子更新

### 3. 状态管理
- 全局状态用 Zustand（useScene / useViewer / useDeviceState）
- 设备物理状态统一在 packages/smarthome/device-state.ts
- 不在组件内另立全局 state

### 4. 视觉规范
- 软边缘、自然写实、在空间内
- 不要硬边光圈、不要装饰性动画
- 每个视觉效果必须传递具体信息
- 设备本身变色表示选中，不额外加标记球

### 5. 节点类型
- 建筑节点：Wall / Door / Window / Slab / Ceiling / Roof / Stair / Zone
- 智能家居节点：Device / Scene（VilHil 新增）
- 所有节点用 Zod Schema 定义，存在 packages/core/src/schema/

### 6. 文件组织
- 建筑编辑相关 → packages/core + packages/viewer + packages/editor
- 智能家居相关 → packages/smarthome + packages/viewer/renderers/device
- 展示模式 UI → packages/editor/src/components/proposal/

---

## 关键决策历史

| 决策 | 原因 |
|------|------|
| Fork Pascal Editor 做底座 | 建筑编辑能力完善，技术栈一致 |
| 不做酷家乐导入 | Pascal Editor 自己画，不依赖第三方 |
| 不做 KNX 布线工具 | 施工图的事，不是方案展示 |
| WebGPU 不做降级 | 主流浏览器已支持，遇到问题再处理 |
| reactStrictMode: false | R3F Canvas context 在严格模式下有兼容问题 |
| 品牌色 #2D7FF9 | 科技蓝，干净明亮 |
| 不用 i18n 框架 | 直接搜索替换英文为中文，简单直接 |
