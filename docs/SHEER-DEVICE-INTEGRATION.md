# 对开纱帘接入记录 · 2026-10-06

> 本文保留当日首轮历史证据。后续已接入 v3，修复重复坐标，恢复原字体/依赖入口并通过构建；当前结论以 [最新整合报告](STUDIO-INTEGRATION-2026-10-06.md) 为准。文中旧阻塞不再代表当前状态。

本轮把已认可的轻纱模型接入现有设备组件，状态仍来自 `useScene`。结果可在本地组件夹具复核，尚未完成完整 Studio 的最终验收。未推送、合并、部署或上传源码。

工作区：`/workspace/vilhil-studio-sheer-integration`，分支 `fix/sheer-device-integration-20261006`；基线及检查时远端 main 均为 `2a150e8e2d5c5b6b57604d60f53d2ca3719eba90`。变更留作未提交补丁，交父任务审核。原工作区的 12 个已有改动文件逐一校验 SHA-256 未变，认可 demo 的源码和测试保持原样。

## 实现范围

- `packages/smarthome/src/renderers/curtain/` 保存参数化轻纱网格、材质、运动和资源生命周期。默认尺寸下，与冻结 demo 的顶点及法线逐项一致；颜色、透明度、粗糙度等认可参数一致。
- `side-open.tsx` 仅适配单层纱帘及双层帘的纱帘；`curtain-3d-class.ts` 通过默认关闭的 `externalSheer` 开关保留旧盒体和遮光几何，避免重复生成旧纱帘。`curtain-container.tsx` 仅向新路径传递关联墙面的安装间距。
- 单层遮光、卷帘、百叶、罗马帘算法及控制界面不变。双层仍按既有约定：层 0 布帘，层 1 纱帘；不修改历史层顺序和保存数据。
- 新褶皱按尺寸计算盒深与轨道间隔，并将盒体后缘置于墙面前方。双层布帘的几何算法保留，但随共用盒体调整安装位置；这是避免新纱帘与墙体/布帘相交的必要适配。
- 初次挂载从设备保存的开合度开始；后续目标改变从当前形状继续。只缓存渲染插值，不反写设备状态；静止时停更顶点，隐藏祖先时暂停，重新显示时采用最新目标。宽高变化和卸载释放旧资源。
- Studio 展示页关闭 MSAA，Bloom 也为 0 多重采样。初测 alphaHash 颗粒明显，集成版在无 MSAA 时改用连续透明混合；有 MSAA 时保留参考覆盖路径。两条路径有截图，但无 MSAA 的最终观感仍需用户审核，不声称像素等同于认可 demo。

## 验证结果

证据目录：`docs/tmp/sheer-integration-2026-10-06/`。

| 检查 | 结果与边界 |
| --- | --- |
| 单元/回归 | 50 项通过，314 个断言：独立 demo 7、新接入 4、Asset URL 39；服务脚本另有 6 项通过 |
| 包类型检查 | core、viewer、smarthome 通过 |
| app 类型检查 | 37 个历史错误；错误位置与 TS 编号集合与基线相同，无新增错误位置；部分联合类型错误文本顺序变化 |
| 浏览器真实组件 | 11 项检查完成，零脚本/控制台错误、零失败资源请求、零外网请求；仅 Three.Clock 弃用警告 |
| 状态链路 | 真实 `setDeviceState → useScene → DeviceRenderer → CurtainContainer`；关闭/半开/全开、反向、两层独立控制、原位 setScene 恢复、重新挂载、聚焦、显隐、view 模式写入守卫通过 |
| 隔离 | 同一 Store 中不同楼层 parentId 的设备状态互不串改；隐藏挂载组停止更新。未验证完整楼层导航 UI 或楼层渲染系统 |
| 资源 | 3 次卸载/重挂，GPU geometry 数始终在 11 与 19 间恢复；静止、隐藏期间顶点 version 不增长；单元测试验证显式资源 dispose |
| 其他帘型 | 真实组件挂载并截图；遮光几何与旧类逐项一致。不是完整编辑器所有设备验收 |
| StrictMode / MSAA | 新适配器在 StrictMode 重复 setup/cleanup 下正常挂载；MSAA 路径另有截图 |
| CPU 开销 | 120 帧纯网格更新：1/6/12 个实例平均约 0.79/3.31/6.10ms，P95 约 1.07/5.81/7.90ms；隐藏约 0.001–0.002ms。Bun CPU 测量，不含 GPU，不是浏览器 FPS 或 60fps 承诺 |

夹具使用生产 DeviceRenderer、设备 Schema、Store 和工具；背景是简化单窗环境，**不包含完整 Studio 的玻璃、Bloom、楼层导航、项目服务加载或真实浏览器 GPU 性能验收**。测试构建仅对本地夹具统一依赖实例，并将全局模型预加载所需的 Draco 解码器 URL 指向已安装 Three 自带文件；生产 Next 配置和资源加载逻辑未改。

## 已复现、留待既有补丁核对的阻塞

1. **非零设备位置重复变换**：既有 DeviceRenderer 使用 `node.position`，CurtainContainer 又使用世界位置。令设备位置 `[1,1.52,0]`、窗口世界中心 `[1,1.52,0]`，期望纱帘左端 XY `[-0.92,2.842]`，实际 `[0.08,4.362]`。详见 `placement-diagnostic.json`。这是原坐标链路问题；本轮未重做历史放置补丁。主要功能夹具使用设备原点，因此不能据此宣称任意实际放置位置通过。
2. **带 duration 的场景**：现有 `applyScene` duration=0 能驱动纱帘；duration=0.3 的场景预期把 position 从 65 改成 100，实际仍为 65。详见 `browser-results.json`。当前旧 Tween 驱动仍在；未重做先前隔离分支 `fix/scene-placement-20261003` 的修复，需父任务核对其 `5ff29f131a8c1ecfb4dc98cfa80a90f664e02fec` 补丁后接续。
3. **完整 Studio 构建**：`next build --webpack` 失败，Google Fonts 的 Barlow / Instrument Serif / Inter / JetBrains Mono 下载失败，Drei 的 Zustand 解析失败。详见 `next-build.log`；没有替换字体、升级依赖或修改构建架构来伪造全站通过。

因此，本轮是可审核的材质/状态接入补丁，**不是生产发布候选**。原旧问题需与既有补丁对齐；完整场景及无 MSAA 最终视觉仍需后续验收。

## 复核方式

在仓库根目录运行（Bun 与依赖已安装）：

```bash
bun test scripts/curtain-lab.test.ts packages/smarthome/tests/sheer-integration.test.ts packages/core/src/schema/asset-url.test.ts
node --test scripts/dev-service.test.mjs
./node_modules/.bin/tsc -b packages/core packages/viewer
./node_modules/.bin/tsc --noEmit -p packages/smarthome
bun scripts/build-sheer-integration.ts
python3 -m http.server 3110 --bind 127.0.0.1 --directory docs/tmp/sheer-integration-2026-10-06/browser
```

另一个终端运行 `node scripts/verify-sheer-integration.cjs`，需要 Playwright 可解析、Chromium 可执行；本环境通过 `NODE_PATH=/workspace/scratch/studio-tooling/node_modules` 与 `PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/playwright-browsers` 提供测试工具。首轮脚本记录 duration 阻塞；后续同名脚本已改为正向验收到达 100%，历史证据保留在首轮目录。非零坐标诊断可在夹具控制台调用 `studioFixture.placementProbe()`，再查看 `studioFixture.snapshot()`。

## 评审自检

新生产代码 useFrame 无对象/数组/材质创建、无 React 帧状态写入；渲染真值来源保持单向；几何/材质有显式释放；导出和实际入口已连接；无 Schema 或新协议字段；所有新文件少于 800 行；未添加外部密钥、服务调用或依赖版本变更。Pascal 临时适配已登记 M7。已知基线坐标、场景和构建阻塞明确保留，故不进行提交/推送/合并/部署。
