# VilHil Studio — 开发规约

> 本文件在每次 AI 辅助开发会话开始时自动读入。所有规则 **必须遵守**。

---

## 项目定位

**VilHil Studio** — 基于 Pascal Editor 的智慧方案交付系统。设计师在 3D 空间里画户型、放设备、配场景，客户在同一个 3D 空间里点灯、按面板、拉窗帘，所见即所得。

**VilHil Studio 在平台中的位置**：

```
官网（嵌入 3D 演示）→ Studio（方案设计）→ 交付（施工）→ 实控（Home Assistant）
         ↑                                                    ↓
         └──────── 同一个 3D 场景，贯穿全链路 ─────────────────┘
```

**Studio 的两种模式**：
- **编辑模式**：设计师画墙放设备配场景（Pascal Editor + VilHil 智能家居层）
- **展示模式**：客户自由浏览方案，操控设备体验效果（Proposal UI）

**核心价值**：设计师说"你试试按一下这个面板"，客户按了，灯亮了，成交。

**未来扩展（当前不做，架构预留）**：
- 3D Viewer 独立嵌入官网
- Home Assistant WebSocket 对接，3D 操控 = 真实设备控制
- 设备状态双向同步（SimulateAdapter → HAAdapter 切换）
- AI 接口：自然语言生成方案 / 智能布点推荐 / 场景自动编排

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

### 动工前五步

1. **想清楚** — 这个功能解决用户什么问题？放在哪里合理？
2. **研究现有 UI** — Pascal Editor 现有的信息架构是什么？新功能放在哪个位置最自然？
3. **做规约** — 写 BDD 场景（Given/When/Then），定义完成标准
4. **做 Demo** — 先在隔离环境验证效果，不动主流程
5. **再集成** — Demo 通过后才合入主代码

### 功能归类原则（重要）

**Pascal Editor 的信息架构是有逻辑的，不要随意打破：**

| 分类 | 含义 | 包含什么 |
|------|------|---------|
| Structure（结构） | 建筑本身的组成部分 | 墙、楼板、天花、屋顶、楼梯、门、窗 |
| Furnish（家具） | 放在空间里的物品 | 桌椅沙发、电器、厨卫设备 |
| Zones（区域） | 空间的功能划分 | 客厅、卧室、厨房 |

**智能设备属于"放在空间里的物品"，不是"建筑结构"。**

所以：
- 灯具、面板、传感器、AP → 放在 **Furnish** 分类下，新增"智能"子分类（与家具/电器/厨卫并列）
- 窗帘电机 → 关联到 **Window**（窗户的附属设备）
- 门锁 → 关联到 **Door**（门的附属设备）
- 布线（如果做）→ 放在 **Structure**（属于建筑基础设施）

**实现方式**：S1 阶段在 Furnish 的分类列表里加一个"智能"分类。不另起独立 Tab 或独立阶段。等设备数量和复杂度增长后，再考虑是否需要独立出来。

**不合理的做法**：在 Structure 工具栏里硬塞一个"智能设备"按钮。用户画墙的时候不需要看到传感器。

### 功能描述格式

```
场景：设计师给客户演示灯光场景
Given 客户正在看客厅 3D 视图
When  设计师点击"回家模式"场景卡片
Then  筒灯渐亮到暖白 3000K，灯带亮起氛围光，窗帘缓缓关闭
      客户感受到"这就是我回家时的样子"
```

### 每个开发节点的交付物

1. **规约文档** — BDD 场景 + UI 位置说明 + 交互流程
2. **Demo 验证** — 隔离页面验证效果和交互
3. **架构设计** — 数据结构 + 组件关系 + 状态流
4. **代码实现** — 按规约开发
5. **用户验证** — 能给真实用户演示

---

## 开发规约

### 1. 功能即工具（最重要的原则）

**每个功能必须先是一个可独立调用的工具函数，再用 UI 包装。**
**注意：工具函数不是纯函数（它们会写入 Zustand store），但它们不依赖 React 组件、不依赖 DOM、可以被 AI / API / 测试脚本直接调用。**

```
❌ 错误：功能写在 React 组件里
const DevicePlacer = () => {
  const handleDrop = () => {
    // 100 行放置逻辑写在组件内
  }
}

✅ 正确：功能是独立工具函数，组件只是调用方
// packages/smarthome/src/tools/place-device.ts
export function placeDevice(roomId, deviceType, position, params) { ... }

// UI 组件调用
const DevicePlacer = () => {
  const handleDrop = () => placeDevice(roomId, type, pos, params)
}

// AI 也能调用同一个函数
await placeDevice('living-room', 'ceiling_light', [3,2.5,4], { beamAngle: 30 })
```

**工具函数存放位置**：`packages/smarthome/src/tools/`

| 工具 | 函数 | 未来 AI 用途 |
|------|------|------------|
| 放置设备 | `placeDevice()` | "帮我在客厅放 3 盏筒灯" |
| 删除设备 | `removeDevice()` | "把多余的传感器去掉" |
| 设置参数 | `setDeviceParams()` | "把灯光调到 3000K" |
| 创建场景 | `createScene()` | "创建一个回家模式" |
| 编排时间线 | `addSceneEffect()` | "灯先亮，2 秒后窗帘关" |
| 自动布点 | `autoPlaceDevices()` | "帮我自动布一套灯光方案" |
| 覆盖计算 | `calculateCoverage()` | "这个 AP 能覆盖多大" |
| 导出清单 | `exportDeviceList()` | "生成设备清单" |
| 应用场景 | `applyScene()` | "播放回家模式" |
| 切换设备 | `toggleDevice()` | "把客厅灯关了" |

**规则**：任何新功能开发，先在 `packages/smarthome/src/tools/` 写工具函数并测试通过，再做 UI。如果一个功能不能脱离 UI 独立运行，说明架构有问题。

### 2. 修改前必读
- 修改任何文件前先读它，了解上下文
- 涉及子系统分类时对照9分类表
- Pascal 核心代码（wall/slab/ceiling/roof）谨慎修改

### 3. 性能规则
- useFrame 内绝不触发 React re-render
- 动画用 ref 直接更新，不用 setState
- 新增 3D 组件必须考虑 geometry dispose
- 粒子系统优先用 shader 驱动（GPU 端），避免 JS 逐粒子更新

### 4. 状态管理
- 全局状态用 Zustand（useScene / useViewer / useDeviceState）
- 设备物理状态统一在 packages/smarthome/device-state.ts
- 不在组件内另立全局 state

### 5. 视觉规范
- 软边缘、自然写实、在空间内
- 不要硬边光圈、不要装饰性动画
- 每个视觉效果必须传递具体信息
- 设备本身变色表示选中，不额外加标记球

### 6. 节点类型
- 建筑节点：Wall / Door / Window / Slab / Ceiling / Roof / Stair / Zone
- 智能家居节点：Device / Scene（VilHil 新增）
- 所有节点用 Zod Schema 定义，存在 packages/core/src/schema/

### 7. UI 设计原则
- **尊重现有信息架构** — Pascal Editor 的 UI 布局是经过设计的，新功能要融入而不是硬塞
- **用户认知负荷** — 同一时刻不展示超过用户需要的信息
- **渐进式披露** — 常用功能一步到位，高级功能折叠/收起
- **位置合理性** — 新功能放在用户会自然寻找的位置，不需要学习
- **一致性** — 新增面板/工具的样式、交互模式与 Pascal 现有组件保持一致

### 8. 文件组织
- 建筑编辑相关 → packages/core + packages/viewer + packages/editor
- 智能家居相关 → packages/smarthome + packages/viewer/renderers/device
- 展示模式 UI → packages/editor/src/components/proposal/

---

---

## 账号体系（架构预留）

当前不做用户系统，但架构上预留三种角色：

| 角色 | 权限 | 场景 |
|------|------|------|
| 设计师 | 编辑模式全功能 | 画户型、放设备、配场景 |
| 客户 | 展示模式只读 + 操控 | 浏览方案、点灯按面板 |
| 管理员 | 设计师权限 + 账号管理 | 团队管理 |

**实现思路**：
- 编辑模式 = 设计师（需登录）
- 展示模式 = 客户（无需登录，通过分享链接进入）
- 分享链接的权限由 `readOnly` 字段控制
- Pascal 的 `useScene.readOnly` 已支持只读模式

**当前做法**：不做登录，所有人都能编辑。等 S5 做分享链接时再加权限控制。

---

## Pascal 上游更新策略

### Git 结构

```
origin    → github.com/atom-xu/vilhil-studio（我们的仓库）
upstream  → github.com/pascalorg/editor（Pascal 原始仓库）
```

### 合并上游更新的流程

```bash
# 1. 拉取上游最新代码
git fetch upstream

# 2. 查看上游有哪些新 commit
git log upstream/main --oneline -10

# 3. 合并到我们的 main（可能有冲突）
git merge upstream/main

# 4. 解决冲突（重点关注我们改过的文件）
# 5. 测试通过后推送
git push origin main
```

### 冲突风险评估

| 我们改过的区域 | 冲突风险 | 处理方式 |
|-------------|---------|---------|
| `apps/editor/app/layout.tsx` | 低 | 我们只删了 React Scan |
| `apps/editor/app/globals.css` | 中 | 我们改了 outline 和品牌色 |
| `apps/editor/next.config.ts` | 低 | 我们加了 reactStrictMode |
| `packages/editor/src/` 汉化 | 高 | 上游更新 UI 文本时会冲突，手动合并 |
| `packages/core/src/schema/` | 中 | 我们加了 Device/Scene，上游加新节点类型时可能冲突 |
| `packages/smarthome/` | 无 | 完全是我们的新包，上游不会动 |
| `packages/viewer/src/renderers/device/` | 无 | 完全是我们的新目录 |

### 合并频率建议

- **不要每次上游更新都合并** — 只在上游有重要功能/修复时才合
- 建议每 2-4 周检查一次上游更新
- 重大版本更新（如 Pascal 0.4.0）前做一次完整合并

### 降低冲突的原则

1. **VilHil 新代码尽量放在新文件/新目录里**，不改 Pascal 原有文件
2. 汉化是唯一大量改 Pascal 文件的操作，冲突时以我们的中文版为准
3. `packages/smarthome/` 是我们的独立包，永远不会跟上游冲突

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
