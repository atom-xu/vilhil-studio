# VilHil Studio UI 统一设计标准（Single Source of Truth）

> 目标：统一当前分散的 UI 文档口径，页面风格、按钮、颜色、大小、圆角都以本文件为准。  
> 优先级：本文件 > 专项文档（组件库/逻辑/导航）> 页面局部约定。

## 1. 视觉基线

1. 品牌主色：`#006FFF`（CSS token `--primary`）
2. 中性色：使用 `background/foreground/muted/accent/border` 语义色，不写随机十六进制
3. 面板风格：统一玻璃化轻阴影（`bg-background/95 + border-border/40 + backdrop-blur-xl + shadow-lg`）
4. 禁止新增“页面私有主题色”作为主交互色

## 2. 尺寸标准

| 项 | 标准 |
|---|---|
| 小控件高度 | `32px` (`--ui-control-height-sm`) |
| 标准按钮高度 | `36px` (`--ui-control-height-md`) |
| 大按钮高度 | `40px` (`--ui-control-height-lg`) |
| 最小点击区域 | `>= 36px` |
| 标准文字 | `text-sm` |
| 辅助文字 | `text-xs` |

## 3. 圆角标准

| 类型 | Token |
|---|---|
| 按钮/输入控件 | `--ui-radius-control`（12px） |
| 标签/小胶囊 | `--ui-radius-chip`（10px） |
| 面板容器 | `--ui-radius-panel`（16px） |

规则：

1. 新增按钮不再手写 `rounded-*`，优先走基础按钮组件。
2. 新增面板优先复用 `vh-panel` 类。

## 4. 按钮统一规范

统一入口：`packages/editor/src/components/ui/primitives/button.tsx`

1. 主按钮：`variant="default"`（品牌主色）
2. 次按钮：`variant="outline"` 或 `vh-btn-secondary`
3. 幽灵按钮：`variant="ghost"`
4. 图标按钮：`size="icon" | "icon-sm" | "icon-lg"`

禁止事项：

1. 在业务页面硬编码按钮背景色（如 `bg-[#2C2C2E]`）
2. 同页面混用多套按钮圆角与高度

## 5. 状态与反馈规范

1. 可点击态：hover 必须有视觉反馈
2. 焦点态：统一 `focus-visible` ring（`--ui-focus-ring`）
3. 禁用态：统一 `opacity + pointer-events`
4. 执行态：必须有文案或图标（如 `执行中...` + spinner）

## 6. 文档结构（合并后）

1. 总标准（本文件）：`docs/UI-STANDARD.md`
2. 总纲与评审：`docs/UI-DESIGN-LIB-STANDARD.md`
3. 组件细则：`docs/UI-COMPONENT-LIBRARY.md`
4. 逻辑细则：`docs/UI-LOGIC-STANDARD.md`
5. 非技术入口：`docs/UI-START-HERE.md`
6. 收敛执行清单：`docs/UI-STYLE-CONSOLIDATION-PLAN.md`

## 7. 代码落地约束

1. 新增 UI 组件前，先确认是否能复用 `Button` 和 `vh-*` 样式类。
2. 任意 PR 涉及 UI 时，必须说明是否遵循本文件第 2/3/4 条标准。
3. 若确有例外，必须在 PR 说明中写明原因和撤销计划。
