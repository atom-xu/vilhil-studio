# 汉化遗漏清单（Kimi 补）

以下英文字符串在 Phase 1 汉化中遗漏，需要补翻译。

---

## node-action-menu.tsx（右键菜单）

```
"Move" → "移动"
"Duplicate" → "复制"
"Delete" → "删除"
```

## viewer-overlay.tsx（查看器浮层）

```
alt="Full Height" → alt="全高"
alt="Cutaway" → alt="剖面"
alt="Low" → alt="低墙"
alt="Scans" → alt="扫描图"
alt="Guides" → alt="参考图"
alt="Orbit Left" → alt="向左旋转"
alt="Orbit Right" → alt="向右旋转"
alt="Top View" → alt="俯视图"
```

## pascal-radio.tsx（电台功能 — 考虑整体删除）

```
aria-label="Radio Settings" → 删除或隐藏整个电台功能
aria-label="Previous" → "上一首"
aria-label="Next" → "下一首"
aria-label="Radio Volume" → "电台音量"
```

## roof-segment-panel.tsx（屋顶分段面板）

```
title="Roof Type" → "屋顶类型"
title="Footprint" → "占地面积"
title="Heights" → "高度"
label="Wall" → "墙体"
label="Roof" → "屋顶"
title="Structure" → "结构"
label="Wall Thick." → "墙厚"
label="Deck Thick." → "面板厚度"
label="Overhang" → "出挑"
label="Shingle Thick." → "瓦片厚度"
```

## roof-panel.tsx

```
label="Add Segment" → "添加分段"
```

## door-panel.tsx（门面板遗漏）

```
label="Flip Side" → "翻转方向"
title="Content Padding" → "内容间距"
label="Enable Threshold" → "启用门槛"
label="Enable Handle" → "启用把手"
label="Door Closer" → "闭门器"
label="Panic Bar" → "逃生推杆"
label="Bar Height" → "推杆高度"
title="Segments" → "分段"
label="Columns" → "列数"
label="Divider" → "分隔条"
```

## stair-segment-panel.tsx（楼梯遗漏）

```
label="Steps" → "踏步数"
title="Structure" → "结构"
```

## stair-panel.tsx

```
title="Segments" → "分段"
```

## item-panel.tsx

```
label="Manage collections…" → "管理集合…"
```

## collections-popover.tsx

```
placeholder="Collection name…" → placeholder="集合名称…"
```

## helpers（操作提示）

```
value="Left click" → "左键点击"
value="Right click" → "右键点击"
value="Shift" → "Shift"（保留英文）
value="Esc" → "Esc"（保留英文）
```

---

## 执行方式

直接在对应文件中搜索替换。键盘按键名（Shift/Esc/Ctrl）保留英文不翻译。
