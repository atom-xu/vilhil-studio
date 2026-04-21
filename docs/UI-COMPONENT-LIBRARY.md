# VilHil Studio UI 组件库标准（v1.0）

> 目标：把“可复用组件资产”从页面实现里抽离出来，形成统一口径，避免重复造轮子与交互漂移。  
> 适用范围：`packages/editor/src/components/ui`、`packages/editor/src/components/proposal`。
> 说明：本文件是专项细则，视觉尺寸/颜色/圆角以 `docs/UI-STANDARD.md` 为准。

## 1. 分层与职责

1. `Base`（基础层）：按钮、输入、开关、标签、列表项容器，只负责呈现和基础交互。
2. `Domain`（领域层）：`SubsystemItem`、`SceneCard`、`DeviceParamGroup`，承载业务语义，不直连 store。
3. `Page`（页面层）：`ScenePanel`、`DevicePanel`、`SubsystemBar`，只做编排与数据绑定。

规则：

1. 页面层不可直接复制 Base 结构实现“新按钮样式”。
2. 领域层不可直接写 Zustand 真值，只接收 props + 回调。
3. 组件命名与目录按语义组织，不按视觉外观组织。

## 2. 核心组件清单

| 组件 | 层级 | 位置 | 职责 | 禁止事项 |
|---|---|---|---|---|
| IconRail | Page | `ui/sidebar/icon-rail.tsx` | 一级导航入口 | 混入业务判断 |
| ProjectSwitcher | Domain | `ui/sidebar/project-switcher.tsx` | 项目切换与当前项目展示 | 承担路由控制 |
| BuildingPanel | Page | `ui/sidebar/panels/building-panel/` | 建筑编辑面板编排 | 塞入智能设备逻辑 |
| DevicePanel | Page | `ui/sidebar/panels/device-panel/` | 设备参数编辑编排 | 设备状态真值私有化 |
| ScenePanel | Page | `ui/sidebar/panels/scene-panel/` | 场景创建、编辑、触发入口 | 楼层上下文缺失 |
| SubsystemBar | Page | `proposal/subsystem-bar.tsx` | 展示模式子系统选择与显隐 | 一次点击做两件事 |
| SceneBar | Page | `proposal/scene-bar.tsx` | 展示模式场景执行入口 | 无执行状态反馈 |
| DeviceInfoCard | Domain | `proposal/device-info-card.tsx` | 当前设备关键参数展示 | 显示无关字段 |

## 3. 组件接口规范

1. 统一受控模式：组件不维护业务真值，仅维护短暂 UI 状态（hover/open）。
2. 统一回调命名：
   - 选择动作：`onSelect`
   - 显隐动作：`onToggleVisible`
   - 执行动作：`onRun`
   - 参数更新：`onChange`
3. 布尔状态 props 必须语义化：`isActive`、`isRunning`、`isVisible`。
4. 不允许 `any` 形态 props 透传；必须明确类型。

## 4. 交互状态矩阵

### 4.1 SceneCard

| 状态 | 视觉 | 可操作性 | 文案 |
|---|---|---|---|
| idle | 默认卡片 | 可点击执行 | `执行场景` |
| running | 高亮 + spinner | 可点击（可重触发） | `执行中...` |
| active | 高亮完成态 | 可点击再次执行 | `已激活` |

### 4.2 SubsystemItem

| 动作 | 结果 | 副作用 |
|---|---|---|
| 点击行 | 聚焦当前子系统 | 不改变显隐 |
| 点击显/隐按钮 | 切换可见性 | 不改变聚焦 |

## 5. 可访问性标准

1. 图标按钮必须有 `aria-label`。
2. 选中状态必须有“颜色 + 文案/形态”双通道表达。
3. 列表导航支持键盘焦点移动（Tab 可达）。
4. 组件禁用态必须可感知（opacity + cursor + 语义属性）。

## 6. 评审清单（组件维度）

1. 是否复用现有组件，而非页面内复制实现。
2. 是否保持“受控 + 语义化 props”。
3. 是否满足状态矩阵（idle/running/active 等）。
4. 是否满足可访问性基本要求。
5. 是否符合“单次交互单一语义”。

## 7. 版本策略

1. `v1.x`：可新增组件，不破坏既有 props。
2. 破坏性变更必须记录迁移说明，并同步更新 `docs/UI-DESIGN-LIB-STANDARD.md`。
