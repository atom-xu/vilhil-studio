# AI 协作复盘：3D 演示页相机 & 楼层动画（2026-04）

> 适用范围：proposal-demo 3D 场景的相机飞行、楼层动画、材质渐变。
> 目的：完整还原本次协作的时间线，供后续 AI 接手时理解背景、避免重蹈覆辙。

---

## 一、背景

用户提供了一个已能运行的 demo，实现了约 80~90% 的目标效果。
协作目标是"在这个基础上微调剩余的 10~20%"。
实际结果：AI 多次重写已有逻辑、引入新 bug，用户花了两天时间、约 $200 对话成本，最终大部分由用户手动重写修正。

---

## 二、完整时间线

---

### 阶段 0：材质确认（快速通过）

**用户说：** "尤其是楼层的墙面材质，透明度这些"

**AI 做了什么：** 确认 wall transparency=0.65、padTop=0.58，无改动。

**结果：** ✅ 没问题，没有引入 bug。

---

### 阶段 1：FPS 太低

**用户说：** "你检查一下 fps 很低啊"

**AI 诊断出 3 个问题：**

1. `<Html>` portal（R3F 内嵌 DOM）每帧都在计算 CSS 3D transform，即使组件不可见也不例外。多楼层时有几十个 portal 同时运行。
   - **修复：** 在 `RoomBaseLight` 里加条件渲染——`hidden=true` 时直接卸载 `<Html>`，不渲染进 DOM。
   - **结果：** ✅ 正确，用户保留了这个改动。

2. 多楼层爆炸视图下，每层的房间灯光（`DemoLightBulb`）仍在渲染，造成大量光源叠加计算。
   - **修复：** `structure.tsx` 里多楼层模式强制 `hidden=true`，`DemoLightBulb` 在多楼层时跳过渲染。
   - **结果：** ✅ 正确，用户保留了这个改动。

3. DPR（设备像素比）上限 `[1, 1.5]`，Retina 屏上实际渲染 1.5× 分辨率，像素数约多 36%。
   - **修复：** 改为 `[1, 1.2]`。
   - **结果：** ✅ 正确，用户保留了这个改动。

---

### 阶段 2：相机飞行问题 —— 模块按钮点击相机向后飞

**用户说：** "今天我们必须把这个问题调整好了才能进入别的，否则一切都是混乱的"

**问题现象：** 点击左侧模块按钮（如"灯光"→"窗帘"）时，相机会向后猛飞一段再回来，割裂感很强。

**AI 诊断：**
- `resolveOverviewPose` 返回的位置（`horizDist=1.2×`，`height=2.8×`）与 `resolveGlobalOverviewPose`（`horizDist=0.55×`，`height=1.15×`）差距极大。
- `switchModule` 在 global/overview 状态下调用了 `playTo`，触发了一次从当前位置飞到"overview 位置"的动画，而这个 overview 位置比当前的 global 位置远得多，所以相机猛退。

**AI 修复：**
1. `resolveOverviewPose` 直接委托 `resolveGlobalOverviewPose`，让两个位置完全一致。
2. `switchModule` 从 global/overview 切换时改为 `setView`（不触发飞行动画），只有从 `detail` 返回时才飞。
3. `backToGlobal` 从 overview 返回时也改为 `setView`，不触发飞行。

**结果：** ✅ 方向正确，用户保留了这个核心思路（overview 和 global 位姿一致、不触发多余飞行）。

---

### 阶段 3：相机飞行问题 —— 回到全屋视图时的硬切

**用户说：**（长消息）"第一个是现在从单层楼会回到全屋的这个状态下，它是在同样的一个视角下做一个缩小，也就是说你这个高度的末尾的这个动画并没有在这个记忆点当中。然后在缩小完之后，瞬间切换到了一个高度，也就是我们一开始前面说的高度，你并没有做渐变"

**问题现象：** 从单层聚焦回到全屋视图时，相机在原地做了缩小，然后瞬间跳变到一个完全不同的高度，没有流畅的飞行过渡。

**根本原因（AI 诊断）：**
- OrbitControls 的极角约束在爆炸视图下被设为 `minPolarAngle = maxPolarAngle = Math.PI * 5/12`（≈75° from vertical，接近水平）。
- `flyToAllFloors` 的飞行终点极角约 23°（接近垂直俯视）。
- 飞行动画结束后 `ctl.update()` 会把相机极角从 23° snap 到 75°，造成硬切。

**AI 修复：**
- 把 `explodedPolar` 从固定值 `Math.PI * 5/12` 改为按实际飞行终点计算：`Math.atan2(scale * 1.1, scale * 2.3 + stackH * 0.5)`。
- OrbitControls 约束改为 `explodedPolar ± 30%` 的范围，而不是锁死单值。

**结果：** ✅ 诊断正确，修复方向正确，用户在后续重写时保留了动态计算 `explodedPolar` 的逻辑（数值调整为新的常量）。

---

### 阶段 4：楼层切换 —— 楼层 B 突然出现、没有同步渐变

**用户说：**（同一条长消息）"第二个问题呢，是在做楼层间进行切换的时候，比如说现在在 3 楼，如果我要切换到 2 楼，你是二楼突然出现，然后把 3 楼挤出去这样子的一个动作，嗯，我觉得不合理。这个动作应该是二楼 3 楼一起同步去运行，三楼慢慢慢慢消失，二楼从下面往上走。你移动和渐变应该是同时要变化的，不可能突然来一个。而且它们之间的距离是要有一定距离的，并不是两个楼层是无缝衔接上来的。"

**问题现象：**
- 切换楼层时，新楼层直接 pop 出现，没有淡入。
- 旧楼层消失也没有淡出。
- 两层之间没有保持视觉间距，视觉上像是"挤进来的"。

**AI 的第一版改动（错误）：**

当时代码里有 `applyGroupOpacity` 函数，AI 尝试在其基础上扩展。

**`applyGroupOpacity` 的原始问题：**
- 它把所有材质都设 `transparent = true`、`opacity = 0`（包括原本不透明的材质）。
- `restoreGroupMaterials` 把所有材质 opacity 恢复为 `1.0`（而不是原始值）。
- 结果：不透明的几何体（地板、结构墙体）被强行变透明，恢复时又全变成 opacity=1，材质状态被破坏，出现蓝线残影、墙体消失只剩顶面线框的问题。

**AI 的第二版改动（改进但仍有问题）：**

完全移除 `applyGroupOpacity`，写了新的 `applyFade` / `restoreFade`：
- 只对 `transparent: true` 的材质操作（不碰不透明材质）。
- 保存并精确恢复原始 opacity（不假设为 1.0）。
- ShaderMaterial 通过 `uniforms.uOpacity` 单独处理。
- 到达层先置 alpha=0 再设 `visible=true`，防止第一帧 pop。

同时在 `FloorAnimator` 里实现 arriving/departing 双角色：
- arriving：从 SINGLE_GAP 位置滑到 Y=0，同步淡入。
- departing：从 Y=0 滑到 SINGLE_GAP 位置，同步淡出。
- 旁观层：snap 到相对新活跃层的位置，保持隐藏。

**数学验证（正确的部分）：** 在任意时刻 t，arriving 层 Y = `SINGLE_GAP * (1-t)`，departing 层 Y = `-SINGLE_GAP * t`，间距 = `SINGLE_GAP * (1-t) - (-SINGLE_GAP * t) = SINGLE_GAP`，始终保持 6m 间距，不重叠。

**结果：** ⚠️ 位置动画和间距逻辑正确，用户保留了这个结构。但渐变实现仍有问题（见阶段 5）。

---

### 阶段 5：材质渐变实现的问题

**用户反馈（本次会话）：**
1. "楼层间切换不是整体消失，而是各个组件有顺序的消失"
2. "每次的起始位都会跳一下"

**AI 的理解（错误）：**
- 把"各个组件有顺序的消失"理解为"每个 mesh 按 Y 坐标排序、依次错开淡出"。
- 写了 `collectFadeMeshes` 按本地 Y 排序，用窗口公式 `(alpha - staggerOffset) / (1 - SPREAD)` 给每个 mesh 单独计算 alpha。

**实际含义（用户后来澄清）：**
- "顺序"是楼层间的顺序（A 层淡出，B 层同时淡入），这个 arriving/departing 双角色的设计已经覆盖了。
- 楼层内部应该是"整层统一消失"，不应该一个 mesh 一个 mesh 地消失。
- AI 的 per-mesh 交错做法破坏了整层的视觉一致性，部分 mesh 已经消失时另一部分还在，显得支离破碎。

**AI 对"起始位跳动"的处理（错误）：**
- AI 把 arriving/departing 层强制 snap 到理论起始位置（`getTargetY(floorIdx, numFloors, prevActive)`）。
- 问题：如果上一个动画还没走完就触发了新的切换，强制 snap 会造成更大的位置突变（楼层在视觉上瞬间跳位）。
- 正确做法：从 `group.position.y` 当前值接力（用户的做法）。

**用户重写的版本（正确）：**

`collectFadeMatStates`：
- 用 UUID Map 去重，同一 material 只保存一次状态。
- 保存完整状态：`origTransparent`、`origOpacity`、`origDepthWrite`、`origUOpacity`。

`applyGroupAlpha`：
- 对所有材质统一设 `transparent = true`，`opacity = origOpacity * alpha`，`depthWrite = alpha > 0.995 ? orig : false`。
- 触发 `mat.needsUpdate = true`。
- 整层所有 mesh 共享同一 alpha，统一消失/出现。

`restoreGroupAlpha`：
- 精确恢复 `origTransparent`、`origOpacity`、`origDepthWrite`。

**中断恢复（用户新增）：**
- 新 trigger 到来时，先检查上一次的 fadeStatesRef 是否还在 arriving/departing 状态，如果是，先 `restoreGroupAlpha` 再开始新动画。
- `useEffect` cleanup：组件卸载时恢复材质，防止快速切换中断后材质残留半透明状态。

**新增过渡类型（用户新增）：**
- `isAllToSingle`（全屋→单楼层）：到达层不做淡入（它本来就可见），其他楼层做淡出。
- `isSingleToAll`（单楼层→全屋）：之前隐藏的楼层做淡入。
- 原来 AI 只处理了 `isSingleToSingle`。

**结果：** ❌ AI 的实现被用户全部重写。

---

### 阶段 6：全屋视角相机高度

**用户说：** "全屋的视角高度不对，我们应该要看到全貌，视角高度要低一些呀"

**AI 做了什么：**
- 把 `flyToAllFloors` 里的 `toTgt.y` 从 0 改为 `stackH * 0.5`（看向楼层堆栈中心）。
- 把 `toPos.y` 从 `totalScale * 2.3 + stackH * 0.5` 改为 `stackH * 0.5 + totalScale * 1.2`。
- 更新了 `tgt.y`、`camY`、`explodedPolar`。

**问题：**
1. 只改了 `flyToAllFloors`，没有同步改 `flyToFloor`（楼层聚焦）、Canvas 初始相机位、intro 动画。
2. 引入了 `stackH * 0.5` 作为 target Y，用户认为这个值有问题，reverted 回 0。
3. 没有提取语义常量，直接改魔法数字（`1.2`、`0.5` 等没有业务含义）。
4. 没有同步维护 `camera.tsx` 里的 `resolveGlobalOverviewPose`（它是相机系统的另一个入口，高度参数与 page.tsx 不一致）。

**用户重写的版本：**
- 在 page.tsx 顶部提取 6 个语义常量：
  ```
  GLOBAL_HORIZ_FACTOR   = 1.75   // 全屋总览水平距离倍率
  GLOBAL_HEIGHT_FACTOR  = 0.88   // 全屋总览相机高度倍率
  FLOOR_FOCUS_HORIZ_FACTOR = 0.48  // 楼层聚焦水平距离
  FLOOR_FOCUS_HEIGHT_FACTOR = 1.22 // 楼层聚焦高度
  INTRO_DISTANCE_MULT   = 1.9    // 入场动画距离倍率
  INTRO_HEIGHT_MULT     = 1.28   // 入场动画高度倍率
  ```
- 同时更新 `flyToFloor`、`flyToAllFloors`、Canvas 初始位、intro 动画、`explodedPolar`、`camDist`、`camY`。
- 在 `camera.tsx` 的 `resolveGlobalOverviewPose` 也同步更新为同套数值。
- 所有相机函数改为保持当前相机朝向（`resolveCameraBearingXZ`），不再硬编码西南方向。
- 飞行时长改为动态估算（`estimateShotDuration`），不再硬编码 `FLOOR_ANIM_DUR`。
- 去掉了所有飞行的 `midPos`（弧线），改为直线推进，减少前摇割裂感。
- 新增 intro 动画：首次加载时相机从 1.9× 距离、1.28× 高度飞入，后续切换不重复。

**结果：** ❌ AI 的改动全部被用户推翻重写。

---

## 三、根因分析

### 3.1 把"已有 demo"当成"待重写的代码"来对待

用户给了一个已经 80~90% 正确的 demo。正确的工作方式是：
- 读懂 demo 里每个数字和逻辑的设计意图。
- 找到具体有问题的 10~20% 做最小改动。

AI 实际的做法是：
- 不理解原始设计意图，用自己的理解重写。
- 每次重写都偏离用户 demo 里已验证的逻辑。
- 用户不得不再花时间纠偏或手动重写。

### 3.2 修改粒度系统性偏小

| 用户描述 | AI 理解的修改粒度 | 实际需要的粒度 |
|---------|----------------|--------------|
| "视角高度低一些" | 改一个 Y 轴数字 | 整套相机参数模型（6个常量 + 所有使用路径） |
| "各个组件顺序消失" | 每个 mesh 按 Y 坐标错开 | 楼层级别（A 层整层淡出，B 层整层淡入） |
| "起始位跳动" | 强制 snap 到理论值 | 中断恢复 + 接力机制 |

### 3.3 只改被提到的代码，忽略同一系统的其他入口

相机系统有多个入口，必须同步修改：

```
page.tsx
  ├── flyToFloor()           ← AI 遗漏
  ├── flyToAllFloors()       ← AI 只改了这个
  ├── Canvas initialCamPos   ← AI 遗漏
  ├── intro 动画              ← AI 遗漏
  ├── explodedPolar          ← AI 部分修改
  └── OrbitControls 约束      ← AI 部分修改

camera.tsx
  ├── resolveGlobalOverviewPose()  ← AI 遗漏
  ├── resolveOverviewPose()        ← AI 遗漏
  └── estimateShotDuration()       ← AI 未引入
```

### 3.4 没有考虑动画中断场景

动画系统的任何改动都需要回答：
- 用户快速连续点击时，上一个动画还没走完，新 trigger 来了怎么办？
- 材质被改成半透明状态时，如果动画被打断，怎么恢复？
- 组件卸载时，正在进行的 alpha 动画留下的状态怎么清理？

AI 在实现材质渐变时没有考虑这些，导致快速切换时出现"蓝线残影"和"墙体消失只剩顶面线框"的 bug。

### 3.5 没有在动手前澄清需求颗粒度

"顺序消失"、"统一变化"、"组件"这类描述，在不同语境下颗粒度完全不同。
AI 应该在实现前明确：**"单位"是什么？** 这里的单位是楼层，不是 mesh。

---

## 四、做对的部分

| 改动 | 状态 |
|-----|------|
| Html portal 条件卸载（FPS 优化） | ✅ 用户保留 |
| 多楼层时禁止渲染房间灯光（FPS 优化） | ✅ 用户保留 |
| DPR 降到 `[1, 1.2]`（FPS 优化） | ✅ 用户保留 |
| resolveOverviewPose 委托 resolveGlobalOverviewPose | ✅ 用户保留 |
| switchModule / backToGlobal 从 overview 不触发飞行 | ✅ 用户保留 |
| arriving / departing 双角色 + SINGLE_GAP=6m 间距数学 | ✅ 用户保留 |
| OrbitControls 极角冲突的诊断与动态 explodedPolar | ✅ 用户保留（数值调整） |

---

## 五、通用协作原则

### 原则 1：先读懂，后动手
接到一个已有 demo，先花时间把相关文件全部读完，理解每个数字和逻辑的设计意图，然后再动手。不要用自己的理解替代 demo 里已验证的逻辑。

### 原则 2：相机是一个整体系统，不是孤立参数
改相机前列出所有使用路径，一次性同步更新。参数必须有语义名字。

```
修改相机参数前必须检查：
□ flyToFloor
□ flyToAllFloors
□ Canvas initialCamPos
□ intro 动画
□ explodedPolar
□ OrbitControls minPolarAngle / maxPolarAngle
□ resolveGlobalOverviewPose (camera.tsx)
□ resolveOverviewPose (camera.tsx)
```

### 原则 3：动画必须考虑中断
任何帧驱动的动画，实现前先回答：
- 中途被新 trigger 打断，副作用怎么清理？
- 组件卸载时正在进行的动画如何兜底？
- 快速连续触发时，上一次状态会不会叠加？

### 原则 4：接力优于强制归位
动画中断后，从 `group.position.y` 当前值接力，不要强制 snap 到理论值。强制 snap 在动画中途会造成可见的位置跳变。

### 原则 5：需求颗粒度不确定时，先问
"顺序"、"统一"、"组件"这类词，动手前先明确"单位是什么"。

### 原则 6：不要在魔法数字上做魔法数字
如果一个数字对应业务概念，先给它命名，再改值，再同步所有使用处。

---

## 六、当前相机参数对照表

| 参数 | 常量名 | 数值 | 语义 | 所在文件 |
|-----|--------|------|------|---------|
| 全屋总览水平距离倍率 | `GLOBAL_HORIZ_FACTOR` | 1.75 | 低角度斜看，约 37° from horizontal | page.tsx & camera.tsx |
| 全屋总览相机高度倍率 | `GLOBAL_HEIGHT_FACTOR` | 0.88 | 配合 1.75 水平，约 53° from vertical | page.tsx & camera.tsx |
| 楼层聚焦水平距离倍率 | `FLOOR_FOCUS_HORIZ_FACTOR` | 0.48 | 近景展示，约 60°~68° 极角 | page.tsx |
| 楼层聚焦高度倍率 | `FLOOR_FOCUS_HEIGHT_FACTOR` | 1.22 | 明显高仰角，形成"端到面前"展示感 | page.tsx |
| 入场动画距离倍率 | `INTRO_DISTANCE_MULT` | 1.9 | 首帧从远处飞入 | page.tsx |
| 入场动画高度倍率 | `INTRO_HEIGHT_MULT` | 1.28 | 首帧从高处飞入 | page.tsx |
| 楼层间距（单层聚焦模式） | `SINGLE_GAP` | 6.0m | 任意动画时刻两层不重叠 | floor-animator.tsx |
| 楼层间距（爆炸全屋视图） | `COMPRESSED_GAP` / `EXPLODED_GAP` | 5.5m | 与 page.tsx EXPLODED_GAP 保持一致 | floor-animator.tsx |

> **修改任何一个参数前**：必须同步 `flyToFloor`、`flyToAllFloors`、Canvas 初始位、intro 动画、`explodedPolar`、OrbitControls 约束、`resolveGlobalOverviewPose`，否则飞行终点和约束区间不一致，动画结束会出现 snap 跳变。

---

## 七、市面成熟相机飞行方案对比

> 对比来源：camera-controls、drei、GSAP、Framer Motion 文档及社区实践（2025-2026）。

### 方案总览

| 方案 | 定位 | 路径类型 | 中断处理 | 缓动 | 动态时长 | R3F 集成 |
|-----|------|---------|---------|------|---------|---------|
| **camera-controls** | 专业相机控制库 | 线性 | Promise 链，自动 | 内置阻尼（smoothTime） | 支持 | 需 drei 包装 |
| **drei CameraControls** | R3F 官方推荐包装 | 线性 | ref 调用，自动 | smoothTime | 支持 | ✅ 开箱即用 |
| **GSAP** | 通用动画引擎 | Bezier 曲线 | kill() 秒杀 | 100+ 内置曲线 | 支持 | 需手动同步 lookAt |
| **Framer Motion** | React 声明式动画 | 线性 | spring/tween 自动切 | 完整缓动库 | 固定时长 | 较友好 |
| **自定义 Lerp/Bezier**（当前方案） | 极简高可控 | 自定义 Bezier | 需手动处理 | 手写缓动 | 已支持（estimateShotDuration） | ✅ 完全自控 |

---

### 各方案详细说明

#### 1. camera-controls / drei CameraControls（生产推荐）

**核心能力：**
- `lerpLookAt(x1,y1,z1, tx,ty,tz, alpha)` — 每帧插值位置+目标，smoothTime 控制阻尼
- `setLookAt(x,y,z, tx,ty,tz, enableTransition)` — 直接飞到目标
- `fitToBox()` / `fitToSphere()` — 自动帧动到包围盒（建筑可视化常用）
- Promise API — `await controls.setLookAt(...)` 可链式调用多段飞行

**中断处理：** 底层是弹簧/阻尼系统，新调用自动覆盖旧目标，不需要手动清理。

**局限：** 路径只有线性，不能做贝塞尔弧线（俯冲弧、绕圈飞行）。

---

#### 2. GSAP（复杂序列首选）

**核心能力：**
- `gsap.to(camera.position, { x, y, z, duration, ease: 'power2.inOut' })` — 位置动画
- `gsap.to(controls.target, { x, y, z, ... })` — 同步驱动 OrbitControls target
- `gsap.timeline()` — 多段相机序列（适合"建筑导览流程"：大门→客厅→卧室）
- `bezier: { values: [...] }` — 曲线路径（需要 CustomEase 插件）

**中断处理：** `tl.kill()` 或 `gsap.killTweensOf(camera)` 立刻停止，无残留。

**局限：** 需要手动保持 `camera.lookAt` 与 `controls.target` 同步，代码量比 camera-controls 多。

---

#### 3. 自定义 Lerp/Bezier（当前方案）

**已有能力：**
- 二次贝塞尔曲线（`bezier2`）— 支持弧线飞行
- 自适应时长（`estimateShotDuration`）— 按位移动态算时长
- 打断接力（`fromPos = sampleShot(current)`）— 中途新触发从当前帧继续
- 保持相机朝向（`resolveCameraBearingXZ`）— 不硬编码方向

**与 camera-controls 的核心差距：**
1. 没有阻尼（damping）—— 飞行到终点后没有惯性自然减速感，是"停"而不是"缓停"
2. OrbitControls 配合需手动管理 `enabled` 状态（动画时关、结束时开），容易出现 snap 问题
3. 没有 `fitToBox` 自动帧动能力，每次新建筑都需要手动算视距

---

### 针对本项目的建议

**当前方案（自定义 Lerp/Bezier）保留的理由：**
- 已经调通了 arriving/departing 双角色楼层动画，与飞行系统耦合较深
- 自定义贝塞尔弧线正是 camera-controls 不支持的能力
- 代码量小，无外部依赖

**值得引入的改进（不替换，仅增强）：**

| 改进点 | 来源 | 优先级 |
|--------|------|--------|
| 落位阻尼感（最后 15% 时间用弹簧减速） | camera-controls 思路 | 中 |
| `fitToBox` 自动视距（新建筑不用手算 scale） | camera-controls API | 低 |
| 多段飞行 Timeline（建筑导览序列） | GSAP 思路 | 低 |

**不建议迁移到 camera-controls 的原因：**
- 楼层动画（FloorAnimator）的 arriving/departing 计时与相机飞行时长紧耦合（共用 `FLOOR_ANIM_DUR`）
- camera-controls 的阻尼系统和 R3F 的 `useFrame` tick 需要额外集成工作
- 迁移成本高于收益
