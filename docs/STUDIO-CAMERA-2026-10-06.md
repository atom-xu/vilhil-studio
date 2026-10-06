# 摄像机与详情资源收尾 · 2026-10-06

此批接续已交付 HVAC 补丁，在隔离分支 `fix/sheer-device-integration-20261006` 工作；原仓库 `work` 与远端 main 仍指向 `2a150e8e2d5c5b6b57604d60f53d2ca3719eba90`。没有提交、推送、合并、部署、设备接入、依赖升级或架构迁移。

## 当前源码证据与范围

- 原 `proposal-demo/page.tsx` 只把灯光、窗帘和 HVAC 加入相机目标；总览不挂非灯光模型，安防没有可点击设备入口。已有 DeviceInfoCard 中的摄像机 FOV/距离控件未接回该页面，不重做控件。
- `device-effects.tsx` 原激光锥强度只看子系统焦点、不看电源；关闭后范围仍显示。枪机和半球共用向下 −Y 的 ConeGeometry，枪机模型实际镜头沿本地 +X。
- `laser-scan-cone.tsx` 原 FOV/距离在 useMemo 依赖中重建 ConeGeometry，与已有 P2.5-6 要求相反；同一 cleanup 同时销毁几何和材质，参数变化会销毁仍在复用的材质。
- 既有放置/朝向工具 `updateDevicePlacement` 写 `params.direction`，原模型只读 `node.rotation`，覆盖锥另加 direction。修复只针对摄像机，把已有绝对 yaw 用于同一父级一次；缺失或非有限方向回退旧 Euler yaw，保留 pitch/roll。无新增存储字段。
- 半球、枪机沿用仓库实际品牌 GLB 与原材质、尺寸；没有替换资产或尝试接入真实摄像画面。半球仍按现有示意锥表达覆盖，本轮不把 360 型号升级成新的产品覆盖模型。

## 本轮改动

1. 当前楼层摄像机入口复用 HVAC 的轻量查看按钮和原 `enterDeviceDetail → playTo → CameraRig`；门锁等其他安防设备不新增入口。详情复用 DeviceInfoCard，两个滑块补可访问名称。
2. smarthome 中纯函数派生摄像机朝向，app 用同一值计算取景；模型与覆盖锥共享父变换，枪机锥转向本地 +X，半球沿 −Y。鼠标旋转只改变观察视角。
3. 固定单位锥几何，FOV 和距离通过顶点 shader 的 `uRadius/uRange` 更新；材质与几何各自清理。关闭时覆盖 group 不可见，模型保留。保留四层扫描样式和约 ±3.5° 缓慢扫描；装饰锥不参与射线点击，避免其单位几何与 shader 尺寸不一致造成误选。
4. viewer/editor 既有文件修复登记 M11；入口、取景及后处理清理均在上层 app，未扩张 Pascal schema 或渲染协议。

## 每次重入增加 19 个纹理的归属

证据是完整页面的 `trace-resources.cjs`，仅测试探针包装实际 `EffectComposer.render`、`SelectiveBloomEffect.update` 和资源 `dispose`；生产代码没有这些包装。探针记录实际参与帧渲染的实例，而非仅使用 primitive ref：后者可能已经指向新实例，旧实例仍在 EffectPass 中渲染。这也解释上一批简单 ref 清理为何只减少 1 个纹理。

安装的 `@react-three/postprocessing` 3.0.4 的 EffectComposer 清理只 removePass，未 dispose；SelectiveBloom 使用 `dispose={null}`。

| 退出后仍分配的资源 | 数量 |
| --- | ---: |
| composer.inputBuffer | 1 |
| 实际 Bloom effect 的 luminancePass.renderTarget | 1 |
| mipmapBlurPass 输出 + downsamplingMipmaps + upsamplingMipmaps | 1 + 8 + 6 |
| depthPass.renderTarget、renderTargetMasked | 2 |
| 合计（按纹理 UUID 去重） | 19 |

修复前正常挂载纹理 26 → 45，卸载后 22 → 41；记录中的旧资源均没有 dispose。仅在诊断收尾手动销毁这些已卸载 owner 后，纹理从 41 回到 3，完成归属闭环。原始数据在 `resource-ownership-before.json`。

上层 `BloomResourceCleanup` 记录 composer 实际使用过的 Pass；退出详情时释放这些 Pass 的 effect，再释放 composer。不替换后处理、不关闭 Bloom、不改日夜亮度、灯光或材质参数。日夜变化替换的 Pass 也留在该详情的释放集合，统一在退出时收尾；本轮保证的是挂载生命周期结束后释放，并未重写库内部的更新生命周期。

修复后相同诊断两轮挂载均为 50 个几何体/26 个纹理；卸载均回到 12/3，已记录资源无 GPU 分配残留。最后诊断性重复 dispose 不再降低计数。以稳定平台值评价，不要求 Three 缓存降到零。

实际拖住时间滑块的两轮资源探针进一步记录：进入白天 26 → 夜间 44 → 回白天 62 → 退出 3，两轮完全一致。这里的 +18 是同一次挂载期间库重建 Bloom effect 的资源；它们已被记录并在退出时释放。本批没有改造库内部的更新生命周期，不能声称持续留在详情反复切日夜时资源始终恒定。

## 验证方法与限制

正常浏览器脚本从实际楼层/安防按钮和查看入口进入，点击既有开关、拖动 FOV/距离、返回、换楼层和鼠标旋转。探针只读 useScene、模型/覆盖变换、UUID、uniform 和 gl.info.memory，不注入 view 或固定相机。双层项目是合成验收数据，包含既有灯具、窗帘和空调。

第一轮未实际拖住时间滑块，单独 fill 不满足页面原有 pointer-down 预览语义；已标记在 `attempt-before-real-time-drag/limitation.txt`，不把它的日夜表述计为通过。最终脚本使用真实鼠标按下/松开并断言显示时间确实切到夜间，再恢复当前时间。

第二次摄像机综合脚本在真实日夜切换后的固定 750ms 采样未通过资源一致性断言，失败记录保留在 `attempt-daynight-resources/`。随后独立 owner 探针确认退出释放且相同阶段计数一致；最终综合脚本还需等待实际帧中 Bloom intensity 达到日/夜配置值才采样，避免把 UI 时间已变当成实际渲染已完成。

环境仍是 Chromium/SwiftShader；HDR 原地址被当前环境连接通道阻断，原 fallback 保持。没有换镜像、重试 HDR 下载或调整照明来美化截图。截图可说明交互和方向，不能代替实际 GPU 性能与最终色彩验收。现有非循环 SelectiveBloom lights 提示和 PCFSoftShadowMap 弃用提示仍如实记录。

空调媒体 Library 原批次首次调用和唯一重试均在助手 tools/list 阶段网络失败，未 prepare/finalize，无 Library IDs。三份完整助手来自当前技能并原样复用，未切换 direct、修改凭据/端点或改变目的地。故障限定为这个保存环境的助手工具发现通道；另一个工作区的成功上传不能证明此处连接已恢复。当前环境声明网络可用，未找到专用连接恢复工具，也无证据将其归因于可加权解除的 sandbox 网络权限。恢复条件是该环境官方助手工具发现连接恢复；媒体与原请求保留。

## 本轮最终验证

- 现有最终摄像机 session 50924 已结束，退出 0，**9/9 整轮通过**，不是以前 7 项代替完整结果。实际覆盖正常入口、GLB 模型、+X/−Y 覆盖方向、FOV/距离保持 geometry/material UUID、关闭/重开、退出重入、楼层隔离、90° 安装朝向和鼠标旋转。
- 日夜控件使用实际鼠标按下/松开；最终等待 CameraRig 实际到达取景位置、实际帧 Bloom intensity 到达配置值后再采样。三轮为 **27 几何/67 纹理，27/67，27/67**。完整录像 **126.04 秒**。此前固定延迟失败保留，未改产品时序来迁就测试。
- 当前代码下空调完整正常回归 **9/9**，关闭约 **1.23 秒**；三轮资源均为 **45 几何/26 纹理**。窗帘完整正常回归 **7/7**，包含编辑器场景执行/保存、开合反转、切楼层与刷新恢复。
- 单元 **75/75，422 断言**；开发服务 **6/6**。core/viewer 类型构建及 smarthome 类型检查通过。app/editor 仍分别 **37/40** 个既有错误，位置和错误代码与 HVAC 上批一致，没有新增类型错误。
- 最终 **next build --webpack 退出 0，生成 26 页**。使用原字体缓存，保留仓库原有忽略构建类型错误设置；构建成功不等于全仓类型检查通过。未修改依赖或锁文件。
- 摄像机最终记录只有既有 HDR 连接错误；没有 React maximum-update-depth、layer overflow 或 shader 编译错误。非循环 Bloom lights、阴影 API 弃用和字体预加载提示仍完整保留，未过滤以制造无警告结果。

完整补丁从 `2a150e8e2d5c5b6b57604d60f53d2ca3719eba90` 应用；增量从上一批 HVAC 完整补丁应用后的树开始，两条路线二选一。交付脚本分别在干净 git archive 中 apply --check、实际应用并逐文件比较当前工作树，结果保存在 `patch-verification.json`。原工作区 12 个未提交文件、认可纱帘/实验页 10 个文件、锁文件及 29 个原字体的保留性结果在 `final-preservation.json`。构建和全部原始浏览器记录在交付目录的“验证记录”。

## 发布与交付结论

这是**可交父任务审核的本地候选补丁**，具备已通过的构建、功能与有限资源回归；没有获得生产发布授权，也没有提交、推送、合并或部署。

仍不能宣称全仓类型全绿、实际 GPU 性能已达标、HDR/最终色彩已验收，或同一次详情内无限日夜切换的资源恒定。日夜内部 effect 累积至退出才清理，是已知边界；本批不再扩张为旧库更新生命周期重构。媒体录制包含开发模式的既有错误提示，不应当作无缺陷宣传素材。

空调媒体 Library 交付仍阻塞且无 IDs；这是此保存环境助手通道的问题，与本地构建能否生成是不同结论。原空调视频/两张截图、原批次请求和失败记录均保留，未继续上传或更换路径。摄像机新媒体也仅本地保留，没有操作 Library。

本轮收尾后暂停。下一步由父任务与用户审核本地成果、确认上述边界及目标环境条件，再另行决定预发或生产发布；本报告不代替该授权。
