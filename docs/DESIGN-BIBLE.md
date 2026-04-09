# VilHil Studio 设计圣经

> 从 3Dhouse 项目继承的所有设计要求、视觉规范、交互样板。
> 任何新功能开发前必须先对照本文件，确保不违反已锁定的设计决策。

---

## 一、视觉规范

### 不是两种渲染风格，是同一套渲染的不同视角

Pascal 已有 `wallMode`（up/cutaway/down）和 `levelMode`（stacked/exploded/solo）。利用这些切换实现内外视角：

| 视角 | wallMode | levelMode | 用户看到什么 |
|------|----------|-----------|------------|
| 外部 | up | stacked | 完整建筑外立面，有屋顶有外墙 |
| 内部 | cutaway | solo | 开顶沙盘，面对相机的外墙自动隐藏 |

**展示模式流程**：
1. 默认外部视角 → 用户看到建筑全貌
2. 用户点击某楼层 → 切到内部视角，该楼层的设备和动画效果可见
3. 用户点"返回外观" → 切回外部视角

**核心概念：同一个 3D 模型，用 wallMode/levelMode 控制看什么。**

| 元素 | 颜色/材质 | 参数 |
|------|----------|------|
| 墙体 | `#e8e6e0` 暖灰白 | roughness 0.92, metalness 0, 不透明 |
| 地面 | `#2a2a2e` 深灰 | roughness 0.85, 接收阴影和光斑 |
| 家具 | `#3a3a3e` 中性灰 | 简化几何体，无纹理 |
| 天花 | 不渲染 | 开顶设计，从上方看到室内 |
| 门 | 墙体开口 | 不加门框模型 |
| 窗 | 墙体开口 | 可选极淡玻璃 `#c8d8e8` opacity 0.08 |
| 设备标注 | **唯一有彩色的元素** | 按子系统色表 |
| 背景 | 深色（暗色主题）/ 浅色（亮色主题）| Pascal 已有主题切换 |

**三绝对禁止**：
- 不要线框
- 不要半透明墙
- 不要蓝色色相主导（除 Network 子系统覆盖效果）

**灯光设置**：
- 环境光：0.25 intensity 白色
- 方向光：0.4 intensity 暖白 45° 角
- 设备 PointLight：intensity 0~1.5，color 跟随色温

---

## 二、9 子系统颜色（已锁定，不可修改）

```
architecture  #94a3b8  架构    网关/执行器/配电箱/KNX总线
lighting      #d4a853  灯光    筒灯/灯带/吊灯/壁灯/落地灯
panel         #c8b8a0  面板    开关/调光/场景面板
sensor        #4ade80  传感器  PIR/门磁/烟感/水浸/温湿度
curtain       #3dd9b6  窗帘    窗帘电机
hvac          #9b7bea  暖通    温控面板/出风口/风机盘管
av            #5ba0f5  影音    屏幕/音响
security      #f59e0b  安防    门锁
network       #60a5fa  网络    WiFi AP/交换机
```

**显示顺序固定**：architecture → lighting → panel → sensor → curtain → hvac → av → security → network

---

## 三、四层交互体系

| 层 | 名称 | 触发方式 | 体验目标 |
|----|------|---------|---------|
| L1 | 常驻可视化 | 无（自动） | 空间里每个设备安静地"活着" |
| L2 | 设备直接操控 | 点击设备 | "试试按这个面板"→ 灯亮了 → 成交 |
| L3 | 场景联动 | 点击场景卡片 | "回家模式"→ 一连串设备依次变化 |
| L4 | 设备详情 | 查看面板 | 型号/参数/状态 |

### L1 常驻微动画清单

| 子系统 | 微动画效果 | 节奏 |
|--------|---------|------|
| architecture | 电流粒子沿管线匀速流动 | 慢速 |
| lighting | 光锥 opacity 微呼吸 | 极缓 1.2s |
| panel | 指示灯微亮脉冲 | 缓 2s |
| sensor | 扫描扇面缓慢旋转 | 慢 0.8rad/s |
| curtain | 帘布轻微飘动 | 极缓 3s |
| hvac | 气流粒子持续飘出（带拖影） | 中速 |
| av | 投影仪指示灯微亮 | 缓 |
| security | 摄像头红灯闪烁 + 门锁绿灯 | 1Hz |
| network | 信号覆盖效果常驻 | 慢 |

### L2 可操控设备

| 设备 | 操控方式 | 即时反馈 |
|------|---------|---------|
| 开关面板 | 点击按键 | 对应灯亮/灭 |
| 调光面板 | 滑块拖拽 | 灯光渐变 |
| 色温面板 | 滑块拖拽 | 灯光冷暖变化 |
| 场景面板 | 点击场景键 | 多设备联动 |
| 窗帘 | 点击切换 | 帘布开合 |
| 灯具 | 点击 | 灯亮/灭 |

---

## 四、参考样板（已验证的交互模式）

### 来源：锐捷云地勘

1. **设备点击 → 浮动工具栏**：设备上方弹出一排小图标（复制/信号/旋转/设置/删除）
2. **设备设置 → 右侧滑出面板**：部署参数可编辑（角度/高度/功率），修改后 3D 实时刷新
3. **热力图图例栏**：底部居中，三段颜色 + dBm 阈值 + 覆盖百分比
4. **频段切换 Toggle**：一键切换 2.4G/5G 覆盖效果
5. **三页 Tab**：室内地勘 / 拓扑图 / 产品清单
6. **资源预算条**：POE 功率/电口数使用率进度条
7. **线性工作流**：画墙 → 布点 → 布线

### 来源：UniFi Design Center

10 模块功能矩阵（VilHil = "UniFi for smart home"）：

| 模块 | 优先级 | 状态 |
|------|--------|------|
| 项目管理 | P0 | Pascal 已有 |
| 底图导入 | P0 | Pascal 已有（scan upload）|
| 墙体编辑 | P0 | Pascal 已有 |
| 设备放置 | P0 | Sprint 1 做 |
| 覆盖可视化 | P1 | Sprint 3-4 做 |
| 布线拓扑 | P2 | 暂不做 |
| 设备配置 | P1 | Sprint 1-2 做 |
| 2D/3D 切换 | P0 | Pascal 已有 |
| 导出交付 | P2 | Sprint 4+ |
| AI 助手 | P3 | 远期 |

### 来源：BuildingVisualizationSystem（B 站参考）

- HVAC 风效果：密集粒子流 + 拖影 + AdditiveBlending
- 设备控制面板：滑块实时调参（风向/风速/温度）

---

## 五、数据模型

### Pascal 节点系统（实际使用的）

VilHil 使用 Pascal 的 flat node dictionary，不使用 3Dhouse 的旧 JSON 格式。

```typescript
// Pascal 节点存储方式
useScene.nodes = {
  [id]: { type: 'wall', parentId: 'level-1', ... },
  [id]: { type: 'device', parentId: 'level-1', subsystem: 'lighting', ... },
  [id]: { type: 'scene', effects: [...], ... },
}
```

Device 和 Scene 作为 Pascal 的节点类型，存在同一个 Zustand store 里，跟随 Pascal 的 IndexedDB 持久化和 Undo/Redo。

### 设备字段
```typescript
{
  id: string
  productId: string        // 产品目录 ID
  subsystem: Subsystem     // 9 选 1
  renderType: string       // ceiling_light / pir / wifi_ap 等
  position: [x, y, z]
  rotation?: [rx, ry, rz]
  spaceId: string          // 所属房间
  params?: {               // 设备特有参数
    direction?: number     // 朝向角度
    coverageAngle?: number // 覆盖角度
    coverageRadius?: number // 覆盖半径
    beamAngle?: number     // 光束角
  }
  state?: {                // 运行时状态
    on?: boolean
    brightness?: number
    colorTemp?: number
    position?: number      // 窗帘位置
    locked?: boolean       // 门锁
  }
}
```

### 场景字段
```typescript
{
  id: string
  name: string             // "回家模式"
  icon?: string
  effects: [{
    deviceId: string
    delay: number          // 延迟秒
    duration: number       // 过渡秒
    state: DeviceState     // 目标状态
  }]
}
```

---

## 六、图标规范 v0.3

所有图标统一规格：
```
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
strokeWidth="1.2"
strokeLinecap="round"
strokeLinejoin="round"
```

共 51 个 SVG 图标（9 子系统 + 42 编辑器工具）。
完整定义见 3Dhouse `docs/ICON-SPEC.md`。

---

## 七、动画技术规范

### 通用规则
- 用 `meshBasicMaterial`（自发光，不依赖场景灯光）做设备标记
- 用 `AdditiveBlending` 做所有覆盖叠加效果
- 用 `shaderMaterial` 做粒子系统（GPU 端驱动，不在 JS 逐粒子更新）
- 软边缘（高斯衰减），不要硬边
- 设备本身变色表示选中，不额外加标记球
- `depthWrite: false` 防止遮挡

### 禁止
- 不用 `postprocessing` Bloom（独立 Canvas 会黑屏）
- 不用 `TubeGeometry`（锐角路径静默失败）
- 不用原生 `<line>` 元素（WebGL 忽略 linewidth）→ 用 drei `<Line>`
- 不用装饰性动画（每个效果必须传递信息）
- 不用硬边光圈（ringGeometry/circleGeometry 贴地面）

---

## 八、UI 一致性规范

### 设计 Token

| Token | 值 | 备注 |
|-------|------|------|
| 品牌主色 | `#2D7FF9` | |
| 字体 | Barlow / GeistSans / system-ui | Pascal 已配置 |
| 圆角 | 跟随 Tailwind（sm/md/lg/xl） | 不硬定死，用 Pascal 现有的 |
| 间距 | 跟随 Tailwind（4px 网格） | 不另起一套 |

**原则：VilHil 新增的 UI 组件必须跟 Pascal 现有组件保持一致的圆角、间距、阴影。不要自己定义新的设计 Token，直接用 Tailwind + Pascal 的 globals.css 变量。**

### 颜色引用规则
- 子系统颜色从 `subsystemMeta` 导入，不硬编码
- 品牌色用 CSS 变量 `--color-primary`
- 背景/边框/文字用 Tailwind 的 dark mode 变量
