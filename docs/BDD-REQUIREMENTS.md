# VilHil Studio - BDD 需求清单

> 从用户行为出发，每个功能先描述"用户做了什么 → 看到什么 → 感受到什么"
> 优先级：P0 (必须有) > P1 (应该有) > P2 (可以有) > P3 (未来考虑)

---

## 当前状态盘点

### 已定义设备（20种）

| 子系统 | 设备 | 状态 |
|--------|------|------|
| 灯光 | 筒灯、灯带、吊灯、壁灯 | 目录✅ 模型✅ 放置❌ 状态❌ |
| 面板 | 1/2/3路开关、调光旋钮、4/6键场景面板 | 目录✅ 模型✅ 放置❌ 状态❌ |
| 暖通 | 温控面板、四向出风口 | 目录✅ 模型✅ 放置❌ 状态❌ |
| 窗帘 | 窗帘轨道电机 | 目录✅ 模型✅ 放置❌ 状态❌ |
| 安防 | 门锁、PIR、半球摄像头、枪机摄像头、烟感 | 目录✅ 模型✅ 放置❌ 状态❌ |
| 影音 | 智能音箱 | 目录✅ 模型⚠（临时复用） 放置❌ 状态❌ |
| 网络 | 吸顶AP、面板AP | 目录✅ 模型✅ 放置❌ 状态❌ |
| 架构 | KNX网关、智能主机 | 目录✅ 模型✅ 放置❌ 状态❌ |

### 已缺失能力

- ❌ 工具函数层（placeDevice/removeDevice等）
- ❌ 墙面/天花板放置策略
- ❌ 设备状态管理闭环
- ❌ 场景执行引擎
- ❌ Proposal 模式只读

---

## BDD 需求清单（按优先级排序）

### Phase 1: 核心闭环（P0）- 能让客户"哇"出来

目标：设计师可以放一个筒灯，客户可以点击开关，灯亮了

#### P0-1: 筒灯完整体验

```gherkin
场景：设计师放置筒灯
Given 设计师在编辑模式
When  选择"筒灯"设备
And   点击天花板位置
Then  筒灯出现在点击位置
And   筒灯正确吸附到天花板

场景：客户体验筒灯开关
Given 客户在展示模式
When  点击筒灯
Then  筒灯从暗变亮
And   看到暖金色光晕效果
And   感受到"这灯能控制"

场景：设计师调整亮度
Given 设计师选中筒灯
When  拖动亮度滑块到50%
Then  筒灯亮度实时变化
And   其他客户看到的展示同步更新
```

**技术依赖：**
- DeviceTool 支持天花板放置
- DeviceRenderer 绑定 useDeviceState
- Proposal 模式设为只读

**验收标准：**
- [ ] 筒灯可以放置在天花板
- [ ] 点击筒灯切换 on/off
- [ ] 亮度 0-100% 可调
- [ ] 展示模式下客户只能操作不能编辑

---

#### P0-2: 单路开关完整体验

```gherkin
场景：设计师在墙面放置开关
Given 设计师选择"单路开关"
When  靠近墙面时
Then  看到预览自动吸附到墙面
And   开关方向自动对齐墙面法线
When  点击墙面
Then  开关固定在墙面1.35m高度

场景：客户体验开关控制
Given 客户在展示模式
When  点击开关按钮
Then  按钮按下动画
And   关联的筒灯亮起
And   开关LED指示灯变绿
```

**技术依赖：**
- wallStrategy 放置策略
- 设备关联逻辑（开关→灯）
- 设备间联动

**验收标准：**
- [ ] 开关可以吸附到任意墙面
- [ ] 开关方向自动对齐墙面
- [ ] 点击开关有视觉反馈
- [ ] 开关可以绑定控制灯具

---

#### P0-3: 回家场景演示

```gherkin
场景：设计师配置回家场景
Given 设计师创建"回家模式"场景
When  添加效果：筒灯亮（80%亮度，暖白光3000K）
And   添加效果：窗帘打开（延时2秒）
And   保存场景

场景：客户体验回家场景
Given 客户在展示模式
When  点击"回家模式"场景卡片
Then  2秒内筒灯渐亮到80%
And   2秒后窗帘开始打开
And   客户感受到"这就是我回家的样子"
```

**技术依赖：**
- 场景编辑器基础UI
- 场景执行引擎（时间线）
- 设备状态批量更新

**验收标准：**
- [ ] 可以创建场景
- [ ] 场景可以包含多个设备效果
- [ ] 场景可以设置延时
- [ ] 点击场景卡片执行

---

### Phase 2: 放置体验（P1）- 让设计师"爽"用

#### P1-1: 智能放置策略

```gherkin
场景：设计师放置不同设备
Given 设计师选择不同设备
When  选择"筒灯" → 自动吸附天花板网格
When  选择"开关" → 自动吸附墙面1.35m
When  选择"AP" → 自动吸附天花板
When  选择"门锁" → 自动吸附门体
Then  每种设备都有最合适的默认行为

场景：放置冲突检测
Given 设计师在已有筒灯的位置放置新筒灯
When  预览时
Then  预览变红色（不可放置）
And   显示"位置已被占用"
```

**技术依赖：**
- 各类放置策略实现
- 空间碰撞检测
- 视觉反馈系统

**验收标准：**
- [ ] 每种 mountType 有对应放置策略
- [ ] 放置位置冲突检测
- [ ] 放置预览视觉反馈（绿/红）

---

#### P1-2: 设备选择与管理

```gherkin
场景：批量选择设备
Given 设计师框选多个设备
When  按下 Delete 键
Then  所有选中设备被删除
And   可以 Undo 恢复

场景：设备搜索
Given 设备列表很长
When  搜索"筒灯"
Then  只显示筒灯相关设备
And   可以快速定位到设备
```

#### P1-3: 智能设备入口统一到“设备”面板

```gherkin
场景：智能设备不再出现在家具目录
Given 设计师打开“建筑/家具”侧栏
When  在家具目录中搜索 HomePod、摄像头、智能开关
Then  搜索结果为空
And   普通家具（沙发、桌椅、家电壳体）仍可正常使用

场景：智能设备只通过“设备”面板放置
Given 设计师打开“设备”面板
When  选择“智能音箱 / 半球摄像头 / 枪机摄像头 / 开关面板”等智能设备
And   在楼层中放置设备
Then  场景内创建的节点类型为 DeviceNode
And   设备可直接参与拓扑分配与控制逻辑
```

**验收标准：**
- [ ] 家具目录不再出现智能设备入口
- [ ] 智能设备可在设备面板直接放置
- [ ] 放置后节点为`device`类型，而非`item`类型
- [ ] 拓扑页面设备池可直接看到新放置的智能设备

---

### Phase 3: 展示体验（P2）- 让客户"惊艳"

#### P2-1: 子系统切换

```gherkin
场景：客户专注看灯光
Given 客户在展示模式
When  关闭"传感器"子系统显示
Then  所有传感器淡出隐藏
And   其他子系统保持可见
When  重新打开"传感器"
Then  传感器淡入显示

场景：覆盖范围可视化
Given 客户查看AP
When  点击"显示覆盖范围"
Then  看到AP的10米覆盖球
And   重叠区域显示强度变化
```

#### P2-2: 设备详情面板

```gherkin
场景：查看设备参数
Given 客户点击任意设备
When  详情面板滑出
Then  显示设备名称、型号、参数规格
And   显示实时状态（开关、亮度等）
And   可以操作设备
```

---

### Phase 4: 完整生态（P3）- 面向交付

#### P3-1: 设备报价

```gherkin
场景：查看方案报价
Given 设计师完成方案
When  打开报价面板
Then  列出所有设备清单
And   显示单价、数量、小计
And   显示总价
And   可以导出PDF
```

#### P3-2: 方案分享

```gherkin
场景：设计师匿名分享方案
Given 设计师在编辑模式完成了一套客厅方案
When  他点击顶栏"分享"按钮
And   在分享对话框中输入名称"客厅方案-v1"
And   选择权限"可操作设备"
And   设置有效期"7天"
And   点击"生成链接"
Then  系统保存匿名项目快照并生成短 token
And   展示分享链接如 https://studio.vilhil.cn/share/a1b2c3d4e5
And   链接自动复制到剪贴板

场景：客户通过分享链接查看方案
Given 客户在微信中打开设计师发来的分享链接
When  页面加载完成
Then  客户看到 3D 客厅场景
And   天花板上的筒灯在发光
And   客户点击筒灯，灯亮了
And   客户无法添加/删除/移动任何设备或墙体

场景：分享链接过期
Given 设计师创建了一个有效期 7 天的分享链接
When  7 天后客户再次打开该链接
Then  页面显示"链接已过期"
And   客户无法查看场景内容

场景：设计师注册并登录
Given 设计师首次访问 VilHil Studio
When  他点击顶栏"注册"
And   输入邮箱"designer@example.com"
And   输入密码（至少 8 位）
And   点击"注册"
Then  注册成功，页面自动跳转回编辑器
And   顶栏显示设计师邮箱

场景：登录用户保存项目到云端
Given 设计师已登录
When  他完成一个卧室方案
And   点击顶栏"保存"
And   输入项目名称"卧室-主卧-v2"
Then  项目保存到云端
And   系统返回项目 ID
When  他访问"/projects"
Then  看到"卧室-主卧-v2"在列表中

场景：登录用户从项目列表加载方案
Given 设计师已登录且在项目列表页
When  他点击"卧室-主卧-v2"的"打开"按钮
Then  页面跳转到编辑器并自动加载该场景
And   所有墙体、设备、场景配置完整恢复

场景：未登录用户访问受保护页面
Given 客户未登录
When  他直接访问"/projects"
Then  页面自动重定向到"/login"
And   URL 中带有 redirect 参数
When  他完成登录
Then  自动跳转回"/projects"
```

---

#### P2-3: 拓扑 API 自动归属（控制器/子设备）

```gherkin
场景：后端返回子设备自动归属
Given 当前项目已有控制器设备（如网关/主机/AP）
And   场景中包含 2 个摄像机和 1 个 HomePod
When  用户进入“拓扑”页面
Then  前端调用拓扑后端 API
And   API 返回每个子设备的 parentId 与 slotIndex
And   拓扑页面显示“子设备 -> 控制器（槽位）”

场景：控制器满载时子设备进入待接入
Given 控制器容量已满
When  新增一个可接入子设备
Then  API 将该设备标记为 unassigned
And   拓扑页面显示“待接入”数量
```

**验收标准：**
- [ ] 拓扑页通过 API 获取控制器/子设备分配结果
- [ ] 摄像机、HomePod 等 Leaf 设备显示上级控制器与槽位
- [ ] 控制器显示已用容量/总容量
- [ ] 满载设备进入待接入列表

---

## 开发优先级矩阵

| 功能 | 对客户价值 | 对设计师价值 | 实现难度 | 优先级 |
|------|-----------|-------------|---------|--------|
| 筒灯开关体验 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 低 | P0-1 |
| 墙面开关放置 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 中 | P0-2 |
| 回家场景执行 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 中 | P0-3 |
| 智能放置策略 | ⭐⭐ | ⭐⭐⭐⭐⭐ | 中 | P1-1 |
| 子系统显隐 | ⭐⭐⭐⭐ | ⭐⭐ | 低 | P2-1 |
| 覆盖范围可视化 | ⭐⭐⭐⭐ | ⭐⭐⭐ | 中 | P2-1 |
| 设备详情面板 | ⭐⭐⭐ | ⭐⭐ | 低 | P2-2 |
| 报价导出 | ⭐⭐⭐ | ⭐⭐⭐⭐ | 低 | P3-1 |
| 方案分享 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 高 | P3-2 |

---

## 推荐开发顺序

### Sprint 1 (2周): P0-1 筒灯闭环
- [ ] DeviceTool 支持天花板放置
- [ ] DeviceRenderer 绑定 useDeviceState
- [ ] ProposalLayout 只读模式
- [ ] 筒灯点击开关交互
- [ ] 亮度调节UI

**验收演示：** 设计师放一个筒灯，客户点击开关，灯亮了

### Sprint 2 (2周): P0-2 墙面开关
- [ ] wallStrategy 放置策略
- [ ] 开关吸附墙面+方向对齐
- [ ] 开关控制筒灯联动
- [ ] 开关按下动画

**验收演示：** 开关控制筒灯，有完整的开灯体验

### Sprint 3 (2周): P0-3 回家场景
- [ ] 场景编辑器基础UI
- [ ] 场景执行引擎
- [ ] 时间线动画
- [ ] 场景卡片点击执行

**验收演示：** 点击"回家模式"，灯亮窗帘开

---

## 技术债务清单（并行处理）

| 问题 | 影响 | 建议处理时机 |
|------|------|-------------|
| useRegistry 缺失 | 设备无法被空间查询 | Sprint 1 |
| DeviceSystem 缺失 | 没有脏节点处理 | Sprint 1 |
| 工具函数层 | AI/测试无法接入 | Sprint 2 |
| Scene effects deviceId 为空 | 场景无法绑定设备 | Sprint 3 |

---

## 当前决策点

**问题1：P0-1 筒灯闭环，你认可这个优先级吗？**
- A: 认可，先做筒灯
- B: 先做开关（墙面交互更复杂，早点攻克）
- C: 先做AP（网络基础，覆盖范围可视化效果好）

**问题2：模型库整合方式？**
- A: 直接使用新模型库替换现有 DeviceGeometry
- B: 保留现有模型，逐步迁移
- C: 先不管模型精细度，优先完成交互闭环

**问题3：Sprint 1 周期？**
- A: 1周（快速迭代）
- B: 2周（稳健推进）
- C: 3周（保证质量）

---

*最后更新: 2026-04-09*
*维护者: AI设计师 + 开发团队*

---

## Phase 2.5: 9 大子系统展示动态（已实现，待前端测试）

> 本节对应 2026-04 的"横向铺平"阶段——9 大子系统的 `模型 / 交互 / 操作 / 展示动态` 已全量落地。
> 本节场景全部可直接在浏览器验收，无需后端。
>
> **共同前置条件（省略于每个场景）：**
> - 项目中已至少放置一层带若干墙体的楼层
> - 进入**展示模式**（proposal 页面），`SubsystemBar` 可见
> - 设备目录中挑选对应子系统的设备放置到位（详见每个场景的 Given）
>
> **共同真值（用于断言）：**
> - 设备运行时状态：`useScene.nodes[deviceId].state`
> - 设备参数：`useScene.nodes[deviceId].params`
> - 子系统 UI 偏好：`useDeviceState.visibleSubsystems / selectedSubsystem`

---

### P2.5-0: 子系统聚焦语义（聚焦 ≠ 显隐）

```gherkin
场景：聚焦子系统但不隐藏其他子系统
Given 场景中有灯光、窗帘、传感器各若干
When  用户点击 SubsystemBar 的"灯光"按钮标签（label 点击）
Then  selectedSubsystem === 'lighting'
And   灯光设备 material.opacity 保持原值
And   非灯光设备 material.opacity 被拉低到 0.15-0.22（淡化但不隐藏）
And   visibleSubsystems.* 全部仍为 true

场景：切换子系统显隐（眼睛图标点击）
Given selectedSubsystem === null
When  用户点击 SubsystemBar "传感器"行的眼睛图标
Then  visibleSubsystems.sensor === false
And   所有 sensor 设备 group.visible === false
And   selectedSubsystem 不受影响

场景：取消聚焦
Given selectedSubsystem === 'lighting'
When  用户再次点击"灯光"按钮标签
Then  selectedSubsystem === null
And   所有设备 material.opacity 恢复到 __vilhilFocusBase.opacity
```

**验收：**
- [ ] 聚焦只影响透明度，不影响 visible
- [ ] 显隐只影响 visible，不影响 selectedSubsystem
- [ ] 同一次点击**永远只做一件事**（硬规则 #4）

---

### P2.5-1: 灯光（Lighting）

```gherkin
场景：客户开关筒灯
Given 天花板上有一盏筒灯，state.on=false
When  客户点击筒灯
Then  state.on === true
And   几何体发光（emissive）渐亮
And   LightCone 光锥亮度从 0 渐入到 100%
And   DeviceLight 场景光照同步渐入（不跳变）

场景：调整亮度
Given 筒灯处于开启状态
When  在 DeviceInfoCard 将亮度滑块拖到 50%
Then  state.brightness === 50
And   LightCone 亮度对应缩到 0.5
And   无 Zustand 写入风暴（拖动期间不掉帧）

场景：色温切换
Given 筒灯支持色温调节
When  在 InfoCard 将色温滑块拖到 5000K（冷白）
Then  state.colorTemp === 5000
And   光锥颜色由暖黄渐变到冷白
```

**验收：**
- [ ] 点击切换 on/off 有渐入渐出（非瞬跳）
- [ ] 关灯时光锥不立即消失，而是 brightness=0 平滑淡出
- [ ] 亮度 0 时几何体 emissive 也归零

---

### P2.5-2: 面板（Panel）

```gherkin
场景：开关按键按下
Given 墙上有一个单路开关
When  客户点击开关
Then  按键几何体出现按下动画（scale.z 缩 1-2mm，颜色略变）
And   LED 指示灯颜色同步（绿=开 / 灭=关）
And   关联灯具状态同步切换（如已绑定）

场景：调光旋钮
Given 墙上有一个调光旋钮，state.brightness=50
When  在 InfoCard 拖动亮度滑块到 100%
Then  旋钮几何体绕 y 轴旋转从 0° 到 +135°
And   外圈 LED 环亮度渐进
And   state.brightness === 100

场景：场景面板按键
Given 墙上有一个 6 键场景面板，第 3 键绑定了"回家"场景
When  客户点击第 3 键
Then  该键出现按下动画
And   触发"回家"场景（后续联动效果）
```

**验收：**
- [ ] 按键按下动画时长 ≤ 150ms，松开回弹
- [ ] 旋钮旋转连续无抖动
- [ ] LED 颜色与 isOn 实时一致

---

### P2.5-3: 窗帘（Curtain，含 4 种类型 + 多层）

```gherkin
场景：单层侧开帘开合
Given 客厅窗前有一个 side-open 窗帘，params.layers=[{material:'blackout'}]
When  客户在 InfoCard 拖动第 1 层开合度滑块到 0.8
Then  state.layerPositions[0] === 0.8
And   10 片布面沿 X 轴平移到窗口宽度 × 0.8 位置
And   带轻微 flutter 动画（周期 ≈1.5s）

场景：双层纱 + 遮光帘独立控制
Given 窗前有一个 side-open 窗帘，params.layers=[{material:'sheer'},{material:'blackout'}]
When  拖动第 1 层（纱）到 1.0（全开），第 2 层（遮光）到 0.0（全闭）
Then  state.layerPositions[0]=1.0, state.layerPositions[1]=0.0
And   两层沿 wall 法线方向 z 偏移 3cm，不穿模
And   InfoCard 每层独立显示 tag（sheer / blackout）

场景：百叶帘角度
Given 窗前有一个 venetian 百叶帘，state.layerPositions[0]=1.0
When  在 InfoCard 拖动叶片角度滑块到 45°
Then  state.slatAngleDeg === 45
And   所有叶片绕自身 X 轴转到 45°
And   高度不改变

场景：窗帘关联窗户
Given 窗帘 params.openingId 指向窗 W，W 在墙 M 上
When  渲染窗帘
Then  窗帘 group.rotation.y 对齐 M 的法线
And   窗帘 position 贴在 W 的世界中心上方
```

**验收：**
- [ ] 4 种类型（side-open / roller / venetian / roman）均有各自合理的动画
- [ ] 多层 z 偏移 3cm 不穿模
- [ ] `openingId` 失效时窗帘不崩溃（fallback 到设备自身 position）

---

### P2.5-4: 传感器（Sensor）

```gherkin
场景：PIR 未触发
Given 天花板有一个 PIR，state.triggered=false
When  用户聚焦传感器子系统
Then  PIR 下方出现绿色粒子锥覆盖（radius=params.coverageRadius）
And   粒子数约 120，呼吸节奏

场景：PIR 触发告警
Given PIR 在线
When  在 InfoCard 点击"模拟触发"（或 state.triggered 被置 true）
Then  覆盖粒子颜色切到红色 #ef4444
And   粒子数约 200（密度上升）
And   InfoCard 状态徽章变红

场景：烟感告警
Given 天花板有一个烟感
When  state.triggered=true
Then  烟感周围出现告警 LED 红环脉动
```

**验收：**
- [ ] `triggered` 切换无几何重建，仅 uniform / 粒子数切换
- [ ] 聚焦传感器时其他子系统降低存在感，覆盖可视化不被墙体遮挡

---

### P2.5-5: 窗帘以外的墙/天花挂件 — 暖通（HVAC）

```gherkin
场景：吸顶四向出风口制冷
Given 天花板有一个 vent-4way 出风口
When  客户点击它开启，并在 InfoCard 选择"制冷"
Then  state.on=true, state.mode='cold'
And   4 个方向（±30° 抖动）喷出蓝色粒子流
And   粒子强度跟 isOn 渐入渐出（不跳）

场景：壁挂空调制热 ribbon
Given 墙上有一个 ac-wall 壁挂空调
When  切到"制热"模式
Then  正前方出现红色 ribbon 流线 + 云雾
And   mode 切换时 cloud texture 重建一次

场景：关闭 HVAC
Given 出风口 / 空调处于开启
When  用户关闭它
Then  粒子 / ribbon 强度 lerp 到 0，平滑淡出
```

**验收：**
- [ ] 冷/热颜色差异明显
- [ ] mode 切换 ≤ 500ms 内完成颜色过渡
- [ ] 关闭后 3s 内粒子完全不可见

---

### P2.5-6: 安防（Security）

```gherkin
场景：摄像头 FOV 展示
Given 天花板有一个 dome（半球摄像头），params.coverageAngle=90, coverageRadius=8
When  聚焦安防子系统
Then  出现 4 层叠加锥形激光扫描范围（FOV=90°, 长度=8m）
And   整体缓慢左右摆动 ±3.5°
And   离焦时强度 0.25（仍可见但不抢眼）

场景：调整摄像头 FOV
Given 安防子系统聚焦
When  在 InfoCard 将 FOV 拖到 120°
Then  state.coverageAngle === 120
And   锥底半径实时扩大（不重建几何）

场景：门锁上锁/解锁
Given 门上有一个门锁，state.locked=true
When  客户点击"解锁"
Then  state.locked=false
And   门锁 LED 环从红色脉动切到绿色呼吸
```

**验收：**
- [ ] FOV / range 滑动时无几何重建（仅 shader uniform 变化）
- [ ] 摄像头非聚焦时**仍可见**但不喧宾夺主
- [ ] 门锁 locked=false → true 过渡有渐变（非瞬跳）

---

### P2.5-7: 影音（AV）

```gherkin
场景：智能音箱播放
Given 桌面有一个 smart-speaker
When  客户点击开启，并在 InfoCard 拖音量到 80
Then  state.on=true, state.volume=80
And   音箱顶部 LED 环发光
And   周围出现 5 圈向外扩散音波环，最大半径 ≈ 1.4m（volume 相关）

场景：停止播放
Given 音箱正在播放
When  关闭
Then  音波环淡出，LED 环熄灭
```

**验收：**
- [ ] 音量影响音波环扩散半径与速度
- [ ] 音波环 5 圈相位错开，不出现"一齐脉动"的节拍感

---

### P2.5-8: 架构（Architecture）

```gherkin
场景：KNX 网关运行态
Given 墙挂机柜中有一个 KNX 网关，state.on=true（默认）
When  聚焦架构子系统
Then  网关周围出现 80 个黄色 (#d4a853) 粒子绕水平环旋转（半径 30-50cm）
And   粒子各自独立速度 / 相位，不齐步

场景：智能主机（IP）
Given 机柜中有一个智能主机
When  聚焦架构子系统
Then  主机周围出现蓝色 (#4ea8ff) 粒子环
And   屏幕 emissive 呼吸式脉动

场景：架构子系统关闭
Given 任意架构设备 state.on=false
Then  粒子 intensity lerp 到 0.25（弱提示，仍知道"还在"）
```

**验收：**
- [ ] KNX 黄色 vs IP 蓝色可视觉区分
- [ ] 聚焦离焦时粒子 opacity 平滑过渡

---

### P2.5-9: 网络（Network）+ WiFi 体积热力图

```gherkin
场景：WiFi 热力图显形
Given 楼层中有至少 1 个 AP（ap-ceiling / ap-wall / router），各自参数已配置
When  用户点击 SubsystemBar "网络"聚焦
Then  visibleSubsystems.network === true
And   selectedSubsystem === 'network'
And   整层房间（由所有墙端点 + 0.5m padding 组成的 bbox）内浮现体积热力图
And   颜色梯度从深绿（近 AP 中心）→ 黄绿 → 黄 → 橙 → 红（边缘）
And   脉动频率 ≈ 1.1Hz

场景：取消网络聚焦
Given 网络热力图正在显示
When  再次点击"网络"取消聚焦
Then  热力图消失（<NetworkHeatmapOverlay /> 返回 null）
And   墙体透明度恢复

场景：AP 方向性
Given 一个 ap-wall，params.direction=90
When  网络聚焦
Then  该 AP 的覆盖呈"朝屋内的椭球"（正方向 boost=1+0.6*1.5，反向 penal 衰减）
And   背墙方向信号强度显著更弱

场景：多 AP 叠加取最大
Given 楼层有 3 个 AP
When  网络聚焦
Then  shader 对每个体素取 max(signal_i)，不是求和
And   AP 功率低的角落呈现红色（弱信号）

场景：无 AP 不渲染
Given 楼层中没有 ap-ceiling/ap-wall/router
When  网络聚焦
Then  NetworkHeatmapOverlay 返回 null（无几何 / 无 shader 成本）
```

**验收：**
- [ ] 热力图仅在**聚焦 network 且有 AP**时出现
- [ ] 房间 bbox 从 useScene 的墙端点并集自动派生
- [ ] 相机绕场景一圈，热力图色块始终"在房间里"（uCamPos 正确）
- [ ] 无 AP / 切换子系统时立即消失，无残影

---

### P2.5-10: X 光透明模式（Xray）

```gherkin
场景：网络聚焦触发 X 光
Given 任意楼层
When  用户聚焦网络子系统
Then  所有墙体 material.opacity 从基线 lerp 到 0.12
And   墙体 transparent=true, depthWrite=false
And   过渡时长 ≈ 0.25s
And   穿过墙体可看到机柜内的路由/交换机 + 热力图

场景：架构聚焦触发 X 光
Given 任意楼层
When  聚焦架构子系统
Then  墙体透明度同样变为 0.12
And   机柜内的 KNX 网关/智能主机粒子环清晰可见

场景：离开 X 光触发子系统
Given 墙体处于 X 光透明状态
When  切到非 network/architecture 子系统（如灯光） 或 取消聚焦
Then  墙体 opacity lerp 回 __vilhilXrayBase.opacity（原始值）
And   transparent / depthWrite 恢复原始值
And   不留下任何"残留半透明墙"

场景：X 光不影响 device focus fade
Given 网络聚焦 + X 光开启
Then  墙体透明度来自 __vilhilXrayBase
And   设备透明度来自 __vilhilFocusBase（两套 base 独立）
And   两者不相互污染
```

**验收：**
- [ ] 墙体透明过渡平滑（无 0→0.12 跳变）
- [ ] 离开触发子系统后 0.3s 内墙体完全恢复
- [ ] 多次来回切换不会出现 opacity 漂移（每次都对齐 base）
- [ ] 性能无劣化（`useFrame` 仅遍历 wall 集合，非全场景 traverse）

---

### P2.5-11: 楼层作用域一致性（跨场景硬规则）

```gherkin
场景：多楼层切换不污染展示
Given 项目有 2 层，1F 有 AP，2F 无 AP
When  用户切到 1F 并聚焦网络
Then  热力图出现且 bbox 只包含 1F 的墙
When  用户切到 2F（仍保持聚焦）
Then  热力图基于 2F 的墙 bbox（此处无 AP 则消失）
And   墙体 X 光只对当前楼层可见墙生效
```

**验收：**
- [ ] 楼层切换时 bbox 会 recompute（不缓存跨层数据）
- [ ] 当前被隐藏的楼层不计入 wall bbox（若 UI 设有楼层过滤）
- [ ] 切层时不出现热力图"闪一帧旧 bbox"

---

### P2.5 测试检查表（一次性跑完）

按此顺序手测，可以覆盖 9 大子系统 + 热力图 + X 光：

1. **放置**：每个子系统放 1-2 个设备（筒灯 / 开关 / 窗帘 / 出风口 / PIR / 门锁 / 音箱 / KNX / AP）
2. **聚焦语义**：依次点击 SubsystemBar 9 个 label，验证"淡化但不隐藏"
3. **显隐语义**：点击眼睛图标，验证"隐藏但不改变聚焦"
4. **灯光**：点灯 → 渐亮 → 拖亮度 → 色温 → 关灯渐灭
5. **面板**：点开关按键动画 + LED / 调光旋钮旋转 / 场景键触发
6. **窗帘**：4 种类型各测开合度 + 百叶角度 + 双层独立
7. **传感器**：PIR 触发切红色 / 烟感告警
8. **暖通**：vent-4way 制冷 / ac-wall 制热 / 关闭淡出
9. **安防**：摄像头 FOV 滑动 / 门锁切换
10. **影音**：音箱音量 + 音波扩散
11. **架构**：KNX 黄色粒子 / 主机蓝色粒子
12. **网络**：聚焦 → 热力图 → 取消 → 消失
13. **X 光**：网络 + 架构分别聚焦，验墙体透明 + 恢复
14. **跨楼层**：切层验证 bbox 重算
15. **取消聚焦**：点击空白区域 / 再次点击当前子系统，全部复原

---

*Phase 2.5 最后更新: 2026-04-22*
*状态：代码已实现 + `tsc --noEmit` clean；等待前端手测 / e2e*

---

## Phase 2.6: Proposal 风格系统参数化（Style System）

### P2.6-01: 风格 Token 快照与回写

```gherkin
场景：基于 token 的风格编辑
Given 已加载一个 proposal 渲染预设
When  用户在风格编辑器中修改 token（如 wallColor / furnitureColorDay / moduleLighting）
Then  系统使用 token id 定位参数 path 并回写到 preset
And   非目标 token 不发生变化
And   Day / Night 参数按各自域独立生效
```

**验收：**
- [ ] token 可枚举（有唯一 id、path、layer、type）
- [ ] token 可导出快照并可回写 patch
- [ ] 新增风格不需要改渲染主流程，只新增 preset + token 值

### P2.6-02: 参数可感知与角色标注

```gherkin
场景：用户编辑任意颜色参数时可理解“改了什么”
Given 用户打开 Proposal 风格编辑器
When  用户查看任意颜色字段
Then  字段必须展示角色标签（必调/精修/系统）
And   字段必须展示联动说明（该参数影响哪些视觉层）
And   用户可通过颜色预览块立即感知当前值
```

**验收：**
- [ ] 每个字段都有角色标签
- [ ] 每个高频字段都有联动说明
- [ ] 用户无需猜测参数语义

### P2.6-03: 调参流程清晰（避免盲调）

```gherkin
场景：快速模式按固定流程调色
Given 用户进入快速调色模式
When  用户开始调参数
Then  面板显示三步流程：光照基线 -> 主体色 -> 精修项
And   用户先调曝光/主光/环境光，再调墙体和家具主色
And   系统项默认不作为第一步入口
```

**验收：**
- [ ] 快速模式存在明确步骤文案
- [ ] 必调项优先展示
- [ ] 系统项不会抢占主流程

### P2.6-04: 参考图复刻工作流

```gherkin
场景：设计师根据参考图复刻风格
Given 设计师有一张目标参考图
When  设计师按“基线光照 -> 主体色 -> 精修层”顺序调参
Then  能在不改代码的情况下产出接近风格
And   最终参数可保存为 preset 覆盖
And   可通过 token 快照导出用于复用
```

**验收：**
- [ ] 复刻流程不依赖开发改代码
- [ ] 参数可保存、可复用、可迁移

### P2.6-05: 高级模式参数筛选可控

```gherkin
场景：用户在高级模式只想看某类参数
Given 用户进入高级模式
When  用户切换筛选到“必调/精修/系统”
Then  面板只显示对应角色参数
And   每个参数仍展示联动说明
And   系统项可单独查看，不干扰主调色流程
```

**验收：**
- [ ] 高级模式支持角色筛选
- [ ] 筛选后参数语义不丢失（标签和联动提示仍可见）
- [ ] 系统项可独立打开和编辑
