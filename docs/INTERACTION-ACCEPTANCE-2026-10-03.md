# 2026-10-03 本机交互验收

基线main `2a150e8e`，隔离目录 `/tmp/vilhil-studio-interactions-20261003`，分支 `fix/scene-placement-20261003`。
用户主工作区与生产未改；没有推送或部署。

## 实现

- SceneEffect使用独立Tween Group；有效新场景取消旧计时器、Tween和RAF；同设备后续步骤中断旧步骤。
- 当前值起步，数值连续变化，完成时精确写入目标；执行状态按实际完成而非名义超时结束。
- 碰撞工具检查当前楼层及其子树的目录设备旋转盒；先按现有schema的1cm精度量化。
- 只判断实体重叠，不加安全间距；壁挂/吸顶与宿主建筑接触不会阻止放置。
- 2D ghost、3D DeviceTool共享工具；非法预览红色与“位置已被占用”，提交再校验，非法提交不写store。
- 既有2D五条创建设备路径有错误反馈，保留吸附和朝向。
- 必要旧修复逐项重放：游客本地保存、展示页pointer capture/楼层灯数、Draco本地路径、Webpack包子路径/服务端React别名。保留main的新模型/插件/BVH代码；没有整包覆盖旧候选，也没有迁入可选环境光外观改动。

## 验证

- `bun test tests/smart-interactions.test.ts`：11通过、0失败、33断言。核心store在工具单测中为测试替身；UI验收使用真实store和组件。
- core/viewer引用构建及smarthome类型检查通过；editor40错误、app37错误。
- 同依赖环境另建main基线复核：app同为37错误；诊断文件与TS错误码无新增。不是全库类型通过。
- 修改的独立工具与DeviceTool lint通过；未声称全库lint通过。
- Next16 webpack完整构建成功；保留原有ignoreBuildErrors，构建成功不代替类型门禁。
- 保留原Google字体缓存：29份独立字体字节哈希全部出现在构建中；没有字体fallback替换。
- 真实编辑器2D：已有1盏筒灯位置红色提示，重复点击保持1盏（命中已有设备时也会选中它）。
- 本机开发验收页：占用位置提交2→2；空闲位置提交2→3；再次提交3→3；使用真实DeviceTool事件适配。
- 真实SceneBar→applyScene→useScene→既有灯光与窗帘动画：灯光渐变0→80、延时窗帘0→100；离家中断回到0/0；同场景重复触发最终值一致。
- 卷帘、罗马帘、百叶帘、对开帘均观察到开/闭几何变化。这里单独挂载既有动画组件，不等同于所有真实户型/多层窗帘配置完整验收。
- 验收fixture热更新重复初始化曾触发自身碰撞守卫；改为clearScene重建专用fixture，重新加载后正常。这不是生产场景数据清理逻辑。

## 看效果

开发服务仅127.0.0.1:3102。访问 `/interaction-check`；该路由在production环境返回404。
点击回家/离家、选择四类窗帘、预览占用/空闲位置并提交。真实编辑器仍在 `/`。
日志、截图与verification.json位于 `/tmp/studio-interaction-evidence`。

## 范围限制

本批次不处理建筑障碍、未知产品、画线灯带路径、参数化窗帘全幅、既有设备移动碰撞。
窗帘只验证state.position数值过渡，未增加layerPositions数组插值；不代表真实HA接入。
生产迁移、历史类型/lint、设备全集/复杂真实户型仍未完成发布验收。


## 追加碰撞边界检查

二维已有设备拖动原本直接 updateNode，已接入同一碰撞检查并排除自身。冲突时不写位置/墙锚点，保留最后有效位置，显示中文提示。灯带路径平移仍保留原行为。参数化窗帘不使用目录默认盒作为阻断条件：BDD P2.5 明确允许相邻层法线偏移 3cm，目录盒会误阻断。完整窗帘跨度、轨道/电机、层间规则及灯带交叉/共槽规则尚未定义，应先明确安装规则再建立实际几何检查。

剩余入口：设备面板安装高度仍直接更新位置，旋转/参数改变也未统一纳入碰撞；不能称为全局防碰撞。普通 MoveItemTool 为家具移动。新增拖动的真实二维编辑器验收已补齐，见下文。第一批截图保留为历史证据。

追加验证：12 tests passed，新增自排除、其他设备拒绝、合法移动、楼层隔离及多层窗帘保留案例。编辑器类型检查仍为基线 40 项，追加修改位置无新增诊断。生产、原工作目录未改。


## 真实二维拖动补充验收

通过真实编辑器 `http://127.0.0.1:3102/?dragCheck=1` 操作，不用单测代替 UI。新增开发预览读数显示真实 store 的非秘密设备几何和历史状态，生产不显示。

- 筒灯进入同楼层占用区：提示“位置已被占用，已保留最后有效位置”，两设备仍分离；重复拖动仍阻断。移出冲突后正常移动，释放后可再次拖动，没有残留捕获。
- 自身排除：单个设备可以正常拖到空闲位置。
- 跨楼层：Level 0 与 Level 1 两设备最终都为 `[1.13,2.7,0.44]`，楼层 parent ID 不同，第二层移动没有误报。
- 壁灯：同墙创建两个壁灯，其中一个朝向设为 16°；进入另一壁灯位置被阻断，最后合法位置保留同一 wallId、front 壁侧及 16°，wallT 随合法位置更新；移出冲突后恢复移动。
- 稳定页面撤销/重做：设备数始终为 5，undo 从最后一帧退到前一合法帧，redo 精确恢复全部设备 JSON（位置、墙锚点、朝向）。当前每个拖动帧都会进入历史，未实现“一次拖动一次撤销”。开发热更新期间曾出现 undo 退回空初始化场景，redo 恢复；待热更新稳定后复测通过，不据此宣称 HMR 历史稳定。

截图：drag-occupied、drag-repeat-conflict、drag-free-redo、drag-cross-floor、drag-wall-conflict、drag-wall-free-redo、drag-wall-final。读数：drag-wall-readout.json、drag-stable-undo-redo.json。

仅审查的明确旁路：DevicePanel handleHeightChange 直接 updateNode(position.y)，可把不同高度的设备移入相同体积；朝向 SliderControl 直接 setDeviceParams(direction)，可把非正方形盒旋转到其他设备占用区域。后续应统一自排除守卫与参数更新原子性，并明确被拒绝时 UI 数值回滚；本批未修改这些入口，未扩展灯带/窗帘规则。

浏览器有原有 registry import.meta 构建告警和一次 Chromium UnknownError；最终拖放继续可用，未观察到对应的设备交互中断。最终保留 3102 预览，未推送或部署生产。


## 高度/朝向一致性收尾

共享工具 checkDevicePlacementEdit/updateDevicePlacement 已收齐 DevicePanel 高度/朝向、二维拖动校验及相机跟随方向提交。按真实祖先楼层校验、排除自身，候选 yaw 与位置一并检查，拒绝零写入；保持墙锚点/原 yaw 语义，不加无依据间距。不改变灯带/窗帘范围，不改全局 setDeviceParams 的业务调用语义。未知目录导入设备保持兼容，缺失/循环楼层祖先的已知实体返回无效。

真实 UI：两个壁灯同一 x/z、不同高度，高位 2.50m 尝试降到 1.80m 被拒绝且 JSON 完全未变；2.00m 合法恢复，undo 回 2.50m，redo 精确恢复所有字段。两台 1m×0.22m 空调在墙两侧中心距 0.22m 合法接触；90° 重叠被拒绝且 JSON 未变，180° 合法恢复，undo 0°、redo 精确恢复。输入中从 180° 按上箭头到185°被拒绝，输入仍为180°并有提示。新截图/读数为 height-*、rotation-*。场景回归稳定代码下达到回家灯80/帘100和离家灯0/帘0，截图 scene-regression-*；相机跟随入口仅工具/代码检查，未补专门跟随鼠标 UI 场景。

逐帧历史与旧设计一致：设备拖动每帧 updateNode，核心 zundo 每次写入记录快照。SliderControl 则用全局 pause/resume 汇总操作。不能直接照搬暂停到设备拖动，因为并发场景 tween 的其他节点写入也会漏记；本批不改全局历史或私有历史栈，整次拖动事务留待节点级事务设计。

提交自检：无新增 schema/密钥/Three 对象/帧循环；共享工具公开导出且已有 UI 引用；事件订阅无新增；Pascal 入口登记 M9；BDD/STATE-FLOW同步。既有 floorplan-panel 大文件暂不拆分。应用37/编辑器40历史类型错误保留，修改处无新增诊断。

最终回归为 16 tests/62 assertions 全通过；smarthome 类型通过，app37/editor40与基线一致。完整旧 floorplan 文件 lint 有历史1 error/2 warnings，未宣称全量lint通过；本批已补齐新增 tryPlaceDevice 依赖及移除新增未用 Tooltip 导入。宿主墙两侧空调接触 UI 证明确实没有额外间距。
