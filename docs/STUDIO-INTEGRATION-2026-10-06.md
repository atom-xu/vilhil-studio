# Studio 最小整合记录 · 2026-10-06

> 本文保留导航修复前的整合检查点。父任务随后授权两项最小导航收尾，最新状态见 [正常路径报告](STUDIO-CURTAIN-NAVIGATION-2026-10-06.md)。

本轮已在隔离分支接入既有 v3、认可纱帘适配和独立坐标修复；完整构建通过，场景与保存恢复的实际编辑器操作通过。**尚未达到完整展示页验收：遮阳详情入口和相机目标选择有既有阻塞。** 本轮不改导航产品行为，不推送、合并、部署或上传源码/素材。

## 基线与来源

- 仓库 `atom-xu/vilhil-studio`；本地与检查时远端 main 均为 `2a150e8e2d5c5b6b57604d60f53d2ca3719eba90`。
- 隔离工作区 `/workspace/vilhil-studio-sheer-integration`，分支 `fix/sheer-device-integration-20261006`。原工作区 12 个用户已有文件逐一校验未改。
- v3 来源为用户提供的 `interaction-fixes.patch` 及验证过的 bundle：HEAD `5ff29f131a8c1ecfb4dc98cfa80a90f664e02fec`，唯一前置正是本轮基线。没有从旧清单重写既有修复。
- 原字体来自已核验的 `candidate-source-and-original-fonts/build-support/original-font-cache`：29 个原始 WOFF2，四份 CSS 的 35 个引用全部解析；构建产物中 29/29 字体 SHA-256 匹配，使用现有 Next 字体缓存 hook。未替换字体；layout.tsx 字节未变。
- 依赖只在隔离 `apps/editor/node_modules/zustand` 补指向已锁定 core Zustand 5.0.12 的软链。bun.lock 未变；没有上游迁移、重新选版或全量依赖安装成功声明。
- 完整来源审计保留在 `/workspace/scratch/studio-legacy-audit-20261006/Studio-旧补丁归因与整合建议.md`。首轮模型证据保留在 `SHEER-DEVICE-INTEGRATION.md`，历史已解决问题不再当作当前阻塞。

## 本轮补丁

v3 业务源文件原样应用，包括独立 Tween Group、取消旧延时与动画、设备放置/编辑碰撞的现有范围、游客本地保存、Webpack singleton 和预加载前 Draco 路径。两个文档追加冲突手工合并，保留两批历史记录。未扩张参数化窗帘碰撞规则。

新增 `packages/smarthome/src/renderers/curtain/placement-transform.ts`：把窗帘楼层锚点转换到 DeviceRenderer 的局部坐标，父级设备位置/旋转只应用一次；共同楼层变换保留在祖先。未绑定方向时保留完整设备旋转。viewer 只调用这一个业务 helper，登记 M7。

认可轻纱几何、颜色、透明度、MSAA 材质路径保持原样；坐标修复同时适用原遮光、卷帘、罗马帘、百叶，其几何和运动算法未改。duration 浏览器用例由“复现旧失败”改为“目标精确到 100 且网格完成打开”。

## 验证

证据目录 `docs/tmp/studio-integrated-2026-10-06/`。

| 检查 | 结果 |
| --- | --- |
| Bun 测试 | 67 通过，388 断言，0 失败；含 v3 16、原 demo 7、纱帘 4、坐标 1、Asset URL 39 |
| 开发服务测试 | 6 通过 |
| 类型 | core/viewer/smarthome 通过；app 37、editor 40 个历史错误仍在。v3 插入导致少量行号移动，错误代码与原出错源码对齐，无新增错误 |
| `next build --webpack` | 退出码 0，26 页生成。仓库本就忽略 build 类型错误，不能据此声称全库类型通过；保留 import.meta/OpenTelemetry/Rapier 的构建警告 |
| 真实组件夹具 | 12 项浏览器检查通过；duration、坐标、双层独立、反向、隐藏/空闲、恢复、view 守卫、重复释放及其他帘型挂载均覆盖；0 失败资源/脚本请求 |
| 完整编辑器 `/` | 原“预览”中的 SceneBar 按钮：duration 场景窗帘到 100、灯光到 80；即时半开到 50；游客 autosave、刷新恢复 50；二楼保持 80 |
| 完整展示页 `/proposal-demo` | 窗帘总览无自然详情入口，正确窗帘点击事件也被相机目标过滤；UI 端到端未通过。诊断入口后 actual DeviceRenderer 的位置、透明参数、原 popup 的关/半开/开、duration 工具驱动网格通过 |
| MSAA | 首轮受控 A/B：认可原 demo 与业务模型在同相机、灯光、舞台、4 samples 下关闭/半开/打开三张 canvas 像素 hash 相同。本轮几何/材质源文件未变；不等同完整 Studio 像素一致 |
| 楼层与旋转 | 纯变换测试含非零 XYZ、yaw、pitch/roll、楼层平移及旋转；实际展示页非零设备 yaw 的左端 `(1.08,2.842,0.31042857)` 符合窗户锚点。完整两层导航视觉另列局限 |

浏览器是 Linux Chromium + SwiftShader，不是用户真实 GPU；不作性能承诺。展示页原 `antialias:false` 和 Bloom multisampling=0 未修改。环境 HDR CDN 和部分外部 Iconify 请求失败，页面走既有环境降级；该条件下图片不能验收用户最终材质审美。首轮全页会话错误请求 `localhost:3002` 的 auth origin 属本地测试端口配置，后续启动已改为 3114；没有使用登录密码或数据库账号。

## 留待父任务决策的最小范围

1. **遮阳总览没有可点击设备入口**：`page.tsx` 仅 detail 时挂载非灯光 DeviceRenderer；`device:click` 又是进入 detail 的唯一路径。建议复用已有设备列表/指示入口，在当前楼层的遮阳总览选择设备；位置和交互形式需父任务确认。
2. **详情相机设备集合缺窗帘**：`buildPoseInput(seed)` 传 `seed.devices`（灯光），`resolveDeviceDetailPose` 对窗帘 ID 查找失败，直接 return null。最小修复为该非灯光相机集合传当前楼层 `allDeviceNodes`，随后核验窗帘取景距离与遮挡；不重构相机。
3. **可见画面的验收仍受前两项阻塞**：使用灯光目标触发诊断详情只能验证实际组件/控件链路，默认镜头不朝窗帘。另存固定诊断镜头素材以审查实际材质，不能当作正常用户导航通过。

`navigation-baseline.json` 已逐段比对：相机输入、设备点击处理、detail-only 挂载三段均与 2a150e8 基线字节相同，确认并非本轮引入。

没有将这些问题塞进本轮坐标补丁。未验证云端项目保存/认证/分享、真实硬件控制、真实 GPU、多层数组数值 Tween 插值、参数化窗帘实体碰撞或所有子系统完整回归。

## 本地复核

完整开发页为 `http://127.0.0.1:3114/`，展示页 `http://127.0.0.1:3114/proposal-demo?module=curtain`。地址仅在本执行环境可用，无公网发布。空浏览器需先导入证据中的 `studio-scene.json`（编辑器正常项目数据；不含用户信息）。测试脚本以已有 DevBridge 或 localStorage 装载测试项目，真实按钮执行场景。

独立真实组件夹具为 `http://127.0.0.1:3113/`，不可称为完整 Studio。`verify-sheer-integration.cjs` 支持 `STUDIO_FIXTURE_ORIGIN`。完整页脚本与固定镜头脚本在证据目录，诊断注入只发生于测试浏览器，没有加入产品源代码。

构建需要设置 `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` 指向上述原缓存的 `font-css-cache.cjs`，保留现有锁文件与已装依赖；本地 3114 运行设置 `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3114`，开发会话仅使用内存中临时生成的测试 auth secret，不读取或记录真实秘密。

## 自检

单向 Store 真值、无 schema 变更；新 helper 只在 memo 计算时分配，未引入逐帧分配；原模型资源显式释放；原文件和认可 demo 保持；新文件小于 800 行；M7/M9 已登记；无依赖版本或字体样式变更。保留未提交状态交父任务审核，不声称生产可发布。


## 交付状态

完整补丁 `Studio-full-against-2a150e8.patch`（48 个文件，包含原已认可 demo、v3 和本轮修复），以及基于上一份轻纱完整补丁的 `Studio-v3-coordinate-incremental.patch`（31 个文件）。两种应用路径分别在临时干净树通过 apply 检查，并逐文件核对与当前工作区一致。禁止在同一树重复应用两份完整/增量补丁。

交付目录 `/workspace/scratch/studio-integrated-delivery-20261006/` 包含测试原始证据、实际编辑器场景按钮截图、完整展示页三张固定诊断镜头图片及 75.72 秒诊断录像。它们显示默认无 MSAA + 既有 HDR 降级下的实际界面，色调和玻璃叠加观感明显不同于认可舞台；尚未作为审美验收或发布素材。原 Library 四份认可素材未修改。录像包含设置和诊断阶段，不把全部时长描述为正常用户开合流程。

范围外 UI 决策未做。全部改动仍未提交，交父任务审核。环境断开通知后命令、文件和本地服务已确认恢复；无生产部署或用户电脑操作。
