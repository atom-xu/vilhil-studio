# 暖通现有模块收尾与共享渲染核查 · 2026-10-06

父任务在接收窗帘正常点击功能后授权：先空调、后摄像机；在完整 Studio 页面诊断现有冷/热/关、入口、相机、状态恢复并做最小正确性修复，同时有边界地核查旧 Bloom/React 循环与 HDR 失败。继续使用 `fix/sheer-device-integration-20261006`，未提交、推送、合并、部署或操作 Library。

## 先复现，再修复

使用已有 `http://127.0.0.1:3114/proposal-demo` 和合成双层项目，沿用实际 DeviceRenderer、HvacRibbonFlow、HvacAirflow；不是新动画 demo。原始证据在 `docs/tmp/studio-hvac-2026-10-06/`。

1. **暖通入口断开**：总览不挂载非灯光模型，也没有暖通设备入口；相机目标只含灯光和上一批窗帘。已有 DeviceInfoCard 提供冷热/温度控件，但只用于另一套编辑器预览布局。先用正常楼层/暖通按钮确认无入口，再以明确标记的诊断事件进入真实详情检查原动画；诊断事件不计正常路径验收。
2. **冷/热动画已经存在**：壁挂机 shader 冷色 `[0.04,0.25,0.9]`、热色 `[0.92,0.18,0.05]` 可由原 setDeviceState 驱动，网格不重建；四向粒子也已响应冷/热。未按旧清单重新制作这些动画。
3. **低帧率关闭不满足已有要求**：修复前关闭 3.1 秒，ribbon 强度仍 0.279；仅修 Bloom 后仍 0.193。原因是每帧把 delta 上限设为 1/20，导致低帧率时实际衰减时间变长；低强度提前返回还可能留下云雾旧 opacity。
4. **方向与状态的原逻辑不一致**：AcWallGeometry 的出风口在本地 +Z，原 ribbon 沿 −Z；云雾直接复制世界 camera quaternion，忽略父设备旋转。mode=off 未同步 on，电源重新开启也可能仍保持 off 模式。

## 本轮最小补丁

- app 中当前楼层暖通按钮复用原 `enterDeviceDetail → playTo → CameraRig`，仅聚焦；详情接回已导出的 DeviceInfoCard。首版空间标签在退出重进时重叠挡点击，已改为舞台左上固定、可换行的 40px 入口按钮；没有另建 store、控制协议或独立导航。
- 相机集合只增加当前楼层 HVAC。`hvacViewTarget` 根据现有设备旋转派生 +Z 出风方向，壁挂机取景覆盖出风范围，四向风口取景包含向下的气流。仅暖通放宽原俯视角约束，其他设备保持。
- DeviceInfoCard 继续用原 setDeviceState：选择关闭同时设置 on=false；off 后再开恢复 cold，正常 cold/hot 电源关开仍保留模式。
- 沿用原 ribbon/particle 实现。按真实 delta 指数衰减并在阈值内收敛到确切终值，关闭后 group/points 不可见、所有 cloud opacity 清零。粒子配色采用时间驱动的快速平滑过渡。
- ribbon 组翻转到模型出风口方向；billboard/流线宽度向量使用完整祖先逆旋转。cloud 漂移按时间推进；模式纹理只共享一份并单次释放；原几何、材质及格栅资源显式释放。
- 上述既有 viewer/editor 修复登记 M10。未做渲染架构迁移、依赖升级、schema 修改或真实设备控制。

## 共享渲染问题归因

| 问题 | 来源证据 | 处理与边界 |
| --- | --- | --- |
| React maximum update depth | 已安装 `@react-three/postprocessing` 3.0.4 的 `Selection.tsx`：Select effect 依赖整个 api，而 api.selected 被该 effect 修改；遍历把未加入选区的 Group 也判为 changed，持续注销/注册。导航修改前日志已有；完整页本轮再次复现。 | app 内 BloomSelect 适配只依赖稳定 setter，按 mesh 注册/清理；保留原 Selection、SelectiveBloom 与全部灯光参数。相同页面 A/B 后循环消失。 |
| layer out of range | 上述循环引起 SelectiveBloom wrapper 反复创建 effect，其 props 对象依赖每次不同，连带耗尽默认 layer 编号。修复前同一次短诊断 322 次。 | 修正选区循环后同一诊断 0 次；没有全局替换后处理或隐藏告警。长时间、多小时使用未验收。 |
| SelectiveBloom requires lights | 原 DemoBloomLayer 未传 lights，现有 wrapper 每次渲染输出提醒。 | 相同诊断从 9,680 次降到 2 次；仍有非循环提示。本轮没有为消除提示改变光照或追加补光。 |
| HDR 加载失败 | 浏览器 `ERR_TUNNEL_CONNECTION_FAILED`；shell 对原始 lebombo_1k.hdr URL 的 CONNECT 请求返回 403 / envoy。 | 属当前执行环境代理限制；原 EnvBoundary 仍降级。未换 CDN、未引入替代 HDR、未改默认材质/灯光或添加生产回退配置。线上是否存在独立资源问题未检查。 |

A/B 证据为 `before-selection-fix.json` 和 `after-selection-fix.json`，仅中间新增选区适配；未以“全灯关闭”一项对照直接推断根因。原库 SelectiveBloom wrapper 的 `props` 每次创建仍属后续候选，当前仅停止选区自激循环，不重写整个库。

### 重挂载资源检查未通过

正常退出/重进同一空调详情三轮，几何数量稳定 45，纹理数量 45 → 64 → 83（每轮 +19）。原始数据为 `resource-before-disposal.json`。已装 EffectComposer 没有卸载 dispose，SelectiveBloom primitive 显式 dispose=null，且 wrapper 重建 effect，是主要调查点；但尚未把每一张残留纹理逐一归属到资源创建者，不能声称完整根因已闭环。

两种应用层简单释放适配的对照仍增长（44 → 62 → 80），见 `resource-after-disposal.json` / `resource-after-owner-refs.json`。这些尝试未达到验收，已全部撤回，最终 `bloom.tsx` 与本轮开始相同；未留下不确定的销毁顺序或依赖补丁。核查到此停止，后续需独立处理后处理资源所有权/重建生命周期，不能用“改成无 Bloom”或改全局渲染设置掩盖问题。

最终正常脚本单列 `resourceCheck.status=failed` 和 `overallStatus=functional-checks-passed-resource-check-failed`，继续收集后续功能结果。脚本进程完成不代表资源项通过；重复挂载检查失败不计入通过数量。

以上区分的是当前源码既有逻辑错误、本轮回归和环境资源限制，不等于已验证线上生产版本。此轮新入口标签重叠属本轮发现并修复；其失败记录保留为 `attempt-1`。`attempt-2` 的即时楼层断言先于现有过渡完成，已改为等待二楼实际入口后检查，不改变产品以迁就测试。

## 验证与交付边界

最终结果在本报告后续结果段及同目录日志。浏览器正常流程只点击现有楼层/模块/返回及本轮接入的原控件；探针只读 state、Three 网格/材质/相机和资源数量，不写 view、不固定相机、不发送诊断事件。

合成项目包括一楼壁挂机、四向风口及二楼旋转安装壁挂机，同时保留灯具和窗帘，用于楼层隔离与共享渲染检查。未对真实硬件、Home Assistant、私人摄像流或账号凭据做操作。

保存语义保持：展示页临时操作不覆盖编辑器保存项目，刷新恢复保存快照。整体默认外观和性能仍待用户验收；此环境是 SwiftShader，HDR 不可达，不能将其截图和帧率代表真实 GPU 效果。认可纱帘源文件、原字体与锁文件保持。

摄像机按既定顺序留在空调之后，本轮不修改其入口、模型、覆盖范围或参数协议。

## 最终结果

- 空调完整页面正常点击 **9 项功能检查通过**：当前楼层入口且聚焦不改状态；冷/热与温度；关闭清零；off 后重开；退出重进；四向风口；旋转二楼；Bloom 发光选区且无循环/越界；刷新恢复保存快照。最终运行关闭耗时约 **1.17 秒**。
- 最终代码下重新运行窗帘完整点击回归 **7/7 通过**（不是引用上一批结果），包含编辑器 SceneBar/保存、开合反转、楼层和刷新恢复；该页也未再捕获 React 循环或 layer 越界。原有 HDR 请求失败及非循环 Bloom 提示仍记录在案。
- **1 项重复挂载资源检查失败**。完整流程后重复挂载三轮，几何 45/45/45，纹理 102/121/140。功能通过不覆盖这一失败，整体性能验收仍阻塞。
- 联合单元 **72/72，409 断言**；开发服务 **6/6**。core/viewer、smarthome 类型通过；app/editor 仍 **37/40** 个历史错误。app 的位置和错误代码与上一批完全相同，只有 TS7053 的 union 打印顺序不同；没有新增类型错误。
- 最终 `next build --webpack` 退出 **0**，26 页生成。保留仓库原有忽略构建类型错误设置，未声称整个项目类型通过。一次并发类型检查遇到 Next 正在重建的临时类型文件缺失，已等待构建结束后重新检查，上述结论来自结束后的结果。
- 正常空调流程录像 **88.84 秒**，包含真实控件操作、楼层切换、重挂载和刷新；不包含早期诊断注入。媒体仅作父任务审核候选，未上传 Library；不作为最终外观认可素材。
- 原始脚本、9 项通过和 1 项失败、GPU 数量、外部请求失败与剩余提示均完整保存。既有非循环“SelectiveBloom requires lights”仍在，HDR 仍失败；没有过滤掉它们来制造无错误结果。

交付为基于上一批窗帘完整补丁的增量，以及从 main 基线 `2a150e8e2d5c5b6b57604d60f53d2ca3719eba90` 开始的完整补丁；两种应用路线二选一，详见交付说明和逐文件核对结果。均保持未提交状态，供父任务审核，不是生产发布包。
