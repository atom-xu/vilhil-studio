# Proposal Demo 风格系统（参数化架构）

## 目标

把 `proposal-demo` 从“预设颜色集合”升级为“分层风格系统”：

1. 可枚举：每个视觉参数都有唯一 token id。
2. 可组合：颜色、材质、光照、后期、UI、设备色分层组合。
3. 可扩展：新增风格（如西部世界、植物大战僵尸）不改渲染主流程。
4. 可视化：后续 UI 直接根据 token catalog 自动生成编辑器。

---

## 一、风格分层（Style Layers）

当前采用 11 层（见 `STYLE_TOKEN_CATALOG`）：

1. `foundation`：基础成像（`toneMapping`、`exposure`）
2. `environment`：环境光/天空/背景
3. `material`：材质行为（粗糙度、金属度、反射、透明）
4. `structure`：墙体/楼层边线
5. `opening`：窗门开口
6. `furniture`：家具主色与交互高亮
7. `floorpad`：楼板颜色与发光
8. `fx`：叠层/后期
9. `ui`：HUD/浮层面板
10. `module`：业务模块色（灯光/安防/网络等）
11. `device`：设备分类色（核心/传感/执行/告警）

> 原则：新增视觉需求优先落到某一层，不允许散落硬编码。

---

## 二、参数等级（构建顺序）

### L0 主题语义（Theme Intent）

表达“风格意图”，例如：
- 晨雾暖层：冷墙暖居 + 低对比背景 + 明亮边线
- 西部世界：暖黄主光 + 沙色墙体 + 褐色家具 + 低饱和
- 植物大战僵尸：高彩模块色 + 强轮廓 + 扁平化材质

### L1 Token（可编辑参数）

统一定义于：
- `STYLE_TOKEN_CATALOG`

每个 token 包含：
- `id`：唯一标识
- `path`：写入 `RenderPreset` 的路径
- `layer`：所属视觉层
- `type`：`color|number|enum|gradient`
- `dayNight`：`day|night|both`

### L2 Profile（风格配置）

一个 `RenderPreset` + `styleExtensions` 即一个 profile。
- `theme`：当前已稳定使用的渲染参数
- `styleExtensions`：未来扩展域（设备色、模块色、postFx）

### L3 Runtime（运行期应用）

由渲染与 HUD 消费 profile，统一出图。
- 墙体/家具材质
- 环境光与主光
- 背景/叠层/面板
- 模块 pill 与轨道色

---

## 三、当前代码落点

- Token 目录与工具：
  - `apps/editor/app/proposal-demo/_modules/render-presets.ts`
  - `STYLE_TOKEN_CATALOG`
  - `getStyleTokenSnapshot(preset)`
  - `patchPresetByStyleTokens(preset, patch)`

- 扩展字段（向后兼容）：
  - `RenderPreset.styleExtensions?`
  - `styleExtensions.devicePalette`
  - `styleExtensions.modulePalette`
  - `styleExtensions.postFx`

---

## 四、后续可视化编辑器建议

### 1) 自动表单生成

按 `STYLE_TOKEN_CATALOG` 直接渲染编辑器：
- color/gradient -> 颜色输入 + 透明度滑杆
- number -> 滑杆（min/max/step）
- enum -> 下拉选择

### 2) 分层视图

编辑器按 layer 分组：
- 基础成像 / 环境 / 材质 / 建筑 / 家具 / 设备 / 模块 / UI / 后期

### 3) 风格混合（Mixer）

支持 A/B profile 混合：
- 数值线性插值
- 颜色 RGB 或 OKLCH 插值（后续可升级）

### 4) 风格锁（Style Locks）

可对层加锁，避免误改：
- 锁定 `ui` 层时，调 3D 不影响面板
- 锁定 `foundation` 层时，调色不改变曝光与 toneMapping

### 5) 面板逻辑（已执行第一版）

面板按“可理解优先”分为三类参数角色：

- `必调`：直接决定风格主观感受（曝光、主光、墙体/家具/背景主色）
- `精修`：影响质感细节（roughness/metalness/反射/局部透明）
- `系统`：用于 UI 或后期层，不建议作为第一步

并采用固定调参顺序：

1. 光照基线（foundation + 部分 environment）
2. 主体色（structure/furniture/floorpad）
3. 精修与系统层（material/fx/ui）

> 要求：每个字段需带“联动说明”，告诉用户该参数会影响哪些图层。

高级模式新增两项约束：

- 角色筛选：`全部 / 必调 / 精修 / 系统`
- 参考图复刻助手：固定提示三步法，防止高级参数干扰主流程

---

## 五、风格模板扩展策略

新增风格时仅做两件事：

1. 新建 preset（填 `theme` + 可选 `styleExtensions`）
2. 若有新视觉域（例如“雨滴扫描线”），先在 `styleExtensions` 增域，再在渲染层消费

禁止：
- 在组件里临时写 `#xxxxxx` 常量替代 profile
- 绕过 token catalog 直接加无法追踪的参数

---

## 六、验收标准

1. 同一风格 Day/Night 切换后语义一致（非随机变色）
2. 任意 token 可被快照导出、补丁回写
3. 新增风格不需要改相机/几何/业务状态流
4. UI 边框与 3D 色彩可独立控制（避免互相污染）
