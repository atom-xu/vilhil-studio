# Proposal Demo 颜色参数映射

## 目标

这份文档用于说明 `apps/editor/app/proposal-demo` 中每个 `RenderTheme` 颜色参数的真实生效位置，避免“参数存在但看不出变化”。

## 参数分层

## 编辑器模式（已实施）

### 快速调色模式（默认）

只保留高频参数，目标是“5 分钟内完成一个可用风格”：

- 核心光照：
  - `exposure`
  - `envDay` / `envNight`
  - `hemiDay` / `hemiNight`
  - `sunDay` / `sunNight`
- 结构边线：
  - `capOpacity`
  - `capColorA` / `capColorB`
- 可见主色（分 Day/Night）：
  - `wallColor`
  - `furnitureColorDay` / `furnitureColorNight`
  - `windowColor`
  - `doorColor`
  - `padColorDay` / `padColorNight`
  - `bgColorDay` / `bgColorNight`

### 高级模式

开放全部参数（含系统 UI 与叠层），用于精修或做特定展示风格。

### 1) 几何与材质层（3D 主体）

- `wallColor`: 墙体主材色（`DemoStructure` 墙体材质）
- `furnitureColorDay` / `furnitureColorNight`: 家具主色（日夜插值）
- `windowColor`: 窗洞/玻璃开口面颜色（支持透明度）
- `doorColor`: 门洞开口面颜色（支持透明度）
- `capColorA` / `capColorB` / `capOpacity`: 楼层顶部边线渐变与透明
- `padColorDay` / `padColorNight`: 楼板主色（日夜插值）
- `padEmissiveDay` / `padEmissiveNight`: 楼板发光（日夜插值）

### 2) 光照与环境层（影响最终观感色温）

- `envPresetDay` / `envPresetNight`: HDR 环境贴图预设
- `skyDay` / `skyNight`: 半球光天空色
- `groundDay` / `groundNight`: 半球光地面反照色
- `sunColorDay` / `sunColorNight`: 主方向光（日光/月光）颜色
- `bgColorDay` / `bgColorNight`: 场景背景色（含雾颜色插值）

### 3) 后期与叠层层（视觉风格化）

- `overlayDay` / `overlayNight`: 2D 叠层贴图（舞台上方）

### 4) UI 面板层（HUD/Dock/仪表盘）

- `panelBgDay` / `panelBgNight`: 面板底色（TopBar/Rail/Dashboard/SceneDock/FloorSwitcher 浮层）
- `panelBorderDay` / `panelBorderNight`: 面板边框色（同上）

## 模式差异

### A. 颜色校准模式（Color Calibration Mode）

用于“排除风格干扰”：

- 关闭：`overlay`、`vignette`、`grain`、`canvas filter`、`fog`、`HDR environment`
- 强制：`NoToneMapping` + `exposure=1`
- 光照：白色中性半球光 + 白色方向光（低强度、无阴影）

结论：用于确认“材质本色”，不作为最终展示验收画面。

### B. 晨雾暖层（mist-warm-contrast）

当前按“真实颜色优先”处理：

- 关闭：`canvas filter`、`overlay`、`vignette`、`grain`
- 保留：材质、灯光、背景、环境（非校准模式）

结论：这是默认调色建议模式，所见更接近最终交付。

## 排查建议（颜色不准时）

1. 先在 `mist-warm-contrast` 下调到接近目标。
2. 如仍偏差，开启 `颜色校准模式` 确认材质本色是否正确。
3. 回到 `mist-warm-contrast` 做最后验收（确保真实展示链路也成立）。
