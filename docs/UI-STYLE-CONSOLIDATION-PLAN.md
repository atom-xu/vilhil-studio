# UI 样式收敛执行清单（2026-04-16）

> 目标：按批次把分散样式收敛到 `docs/UI-STANDARD.md`。  
> 口径：只统计 `packages/editor/src/components`。

## 1. 当前盘点

1. 硬编码十六进制颜色：`211` 处
2. 原生 `<button>`：`191` 处
3. 已使用统一按钮体系（`vh-btn` 或 `Button`）：`40` 处

## 2. 优先级分批

### P0（先统一，影响最大）

1. `packages/editor/src/components/ui/panels/*`  
原因：大量 `bg-[#2C2C2E]` / `bg-[#3e3e3e]`，直接影响侧边面板一致性。
2. `packages/editor/src/components/ui/viewer-toolbar.tsx`  
原因：主操作区，按钮形态最敏感。
3. `packages/editor/src/components/editor/index.tsx`  
原因：编辑器壳层入口，视觉基线要先稳定。

当前进展：

1. 已完成 `controls/*` 一批基础控件（`segmented / toggle / metric`）语义色替换。
2. 已完成多组主面板按钮底色收敛（`door/window/roof/stair/slab/ceiling/item/panel-wrapper/site-panel`）。
3. 已完成 `viewer-toolbar` 提案入口按钮品牌色收敛（改为 `primary` 语义色）。
4. 已完成 `editor/index` 与 `proposal` 关键入口按钮收敛到 `Button` 变体。
5. 已完成 `proposal/device-info-card` 与 `proposal/scene-bar` 主交互按钮收敛。
6. 已完成 `proposal/subsystem-bar` 行按钮与显隐按钮收敛。
7. `proposal/*` 已达成：`0` 个裸 `<button>`，`0` 处十六进制硬编码。
8. 全局一次性语义替换已执行：`#2D7FF9` 的 UI 类名表达已统一为 `primary` token。
9. 剩余主要是 3D 渲染/标注颜色常量（如 `floorplan-panel`、`calibration-plane`），不按 UI 皮肤规则硬改。

### P1（展示模式统一）

1. `packages/editor/src/components/proposal/*`
2. `packages/editor/src/components/viewer-overlay.tsx`

### P2（专项与高级功能）

1. `packages/editor/src/components/editor/floorplan-panel.tsx`
2. `packages/editor/src/components/ui/sidebar/panels/scene-panel/scene-flow-editor.tsx`

## 3. 执行规则

1. 颜色：优先语义色（`primary/accent/muted/background/border`），禁止新十六进制硬编码。
2. 按钮：优先 `Button`（`ui/primitives/button.tsx`），非必要不写裸 `<button>`。
3. 圆角：控件/面板按 `--ui-radius-control`、`--ui-radius-panel`。
4. 每次改动只做一类收敛（例如只改按钮，不混改业务逻辑）。

## 4. 完成标准

1. P0 完成后，主流程页面不再出现 `#2C2C2E/#3e3e3e`。
2. P1 完成后，展示模式所有主按钮都走统一 `Button` 变体。
3. P2 完成后，硬编码颜色降到可控范围（仅保留必要可视化语义色）。
