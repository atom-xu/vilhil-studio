# Kimi 本周任务（不涉及 S1 核心开发）

> Claude Code 在做 S1 核心功能（工具函数/设备放置/渲染器/属性面板）
> Kimi 做以下独立任务，互不冲突

---

## Task 1：汉化补全（2 小时）

按 `docs/LOCALIZATION-REMAINING.md` 清单，补全遗漏的英文字符串。

**文件范围**：
- `node-action-menu.tsx`（Move/Duplicate/Delete）
- `viewer-overlay.tsx`（Full Height/Cutaway/Low 等 alt 文本）
- `roof-segment-panel.tsx`（Roof Type/Footprint/Heights 等）
- `roof-panel.tsx`（Add Segment）
- `door-panel.tsx`（Flip Side/Enable Threshold/Door Closer 等）
- `stair-panel.tsx` / `stair-segment-panel.tsx`（Segments/Steps/Structure）
- `item-panel.tsx`（Manage collections…）
- `collections-popover.tsx`（Collection name… placeholder）

**验证**：`bun dev` 无报错，所有面板看不到英文。

---

## Task 2：品牌色统一（1 小时）

品牌主色 `#2D7FF9`，替换 Kimi 之前改的紫色色相。

**改什么**：
- `apps/editor/app/globals.css` 中的 `--sidebar-primary` 和 `--chart-1`
- 搜索 `oklch(0.55 0.22 294)` 和 `oklch(0.6 0.22 294)` 改成对应的蓝色值
- `#2D7FF9` 转 oklch 约为 `oklch(0.58 0.2 255)`

**验证**：侧边栏高亮色、活跃按钮色变成蓝色而非紫色。

---

## Task 3：去掉不需要的功能（1 小时）

Pascal 原有一些我们不需要的功能，隐藏（不删）：

- `pascal-radio.tsx` — 电台功能，注释掉 layout.tsx 中的 `<Agentation />` 引用
- Settings 面板里的 "Audio Settings" — 隐藏入口
- 底部工具栏的 Radio 图标 — 隐藏

**方式**：用 `{false && <Component />}` 或 `{/* 暂时隐藏 */}` 注释，不删代码。

---

## Task 4：设备图标 SVG（2 小时）

为 9 个子系统各画一个设备图标（用于 Furnish 的智能分类里）。

规格跟 Pascal 现有图标一致：
```
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
strokeWidth="1.5"
strokeLinecap="round"
strokeLinejoin="round"
```

需要的图标（参考 3Dhouse 的 `docs/ICON-SPEC.md`）：
- architecture: 网关/配电箱
- lighting: 灯泡
- panel: 开关面板
- sensor: 雷达波
- curtain: 窗帘
- hvac: 温度计/风扇
- av: 屏幕
- security: 盾牌/锁
- network: WiFi 信号

存放位置：`packages/smarthome/src/icons.ts`（导出 SVG path 字符串）

---

## Task 5：README 更新（0.5 小时）

更新 vilhil-studio 根目录的 `README.md`：

- 项目名改为 VilHil Studio
- 简介：基于 Pascal Editor 的智慧方案交付系统
- 快速启动：`bun install && bun dev`
- 文档索引：列出 docs/ 下所有文档
- 致谢：Based on [Pascal Editor](https://github.com/pascalorg/editor)

---

## 禁止事项

1. **不动** `packages/smarthome/src/tools/` — Claude 在做
2. **不动** `packages/viewer/src/components/renderers/device/` — Claude 在做
3. **不动** `packages/editor/src/components/tools/device/` — Claude 在做
4. **不动** `packages/editor/src/components/ui/panels/device-panel.tsx` — Claude 在做
5. **不动** `packages/editor/src/components/editor/index.tsx` — 容易冲突
