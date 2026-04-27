# S1 Demo Closure — 跑通 MVP 的最短路径

> 产出日期：2026-04-24
> 目的：把"一堆零件"收敛到"一个能演示给客户看的 5 分钟流程"
> 范围：只做 S1 BDD 场景 1-5 的收口。其他 **全部冻结**。
>
> **核心洞察**：5 个场景里 **3 个已经完整工作**，1 个接一根线就通，1 个要 20-40 行代码。
> **实际差距比我们以为的小得多。**

---

## 0. 场景真实状态（从审计来）

| 场景 | 内容 | 状态 | 差多少 |
|------|------|------|--------|
| 1 | 画墙 → Furnish 智能 → 筒灯 → 天花放置 | ✅ **已通** | 0 |
| 2 | 选灯 → 调亮度/色温 → 3D 同步 | ✅ **已通** | 0 |
| 3 | 点 Preview → 看光锥 + 地面光斑 | ⚠️ **半** | 5 行（1 处 Provider） |
| 4 | Cmd+Z / Cmd+Shift+Z | ✅ **已通** | 0 |
| 5 | 刷新页面灯还在 | ❌ **缺** | 20-40 行 |

**总工作量：≤50 行代码 + 30 分钟人工走查。今天可以收口。**

---

## 1. 两个真正的缺口

### 缺口 A — 编辑器 Preview 模式没切到 demo 渲染

**现状**：
- `proposal-demo/page.tsx:537` 有 `<DeviceRenderModeProvider mode="demo">` ✅
- `share/[token]/page.tsx` 同样有 ✅
- **编辑器主界面（`isPreviewMode` flag）没有任何 `DeviceRenderMode` 切换** ❌

意味着：用户在编辑器里点"预览"按钮 → UI 隐藏 → 但 3D 还在 `mode='base'` → **看不到光锥、粒子、光效**。光是 PointLight 物理光照能工作（因为不受 mode 控制），但视觉效果（光锥、光斑）看不见。

**修复位置**：找到编辑器主 Canvas 的外层 wrapper（在 `packages/editor/src/components/editor/` 下），加：
```tsx
<DeviceRenderModeProvider mode={isPreviewMode ? 'demo' : 'base'}>
  {/* 现有 Canvas 内容 */}
</DeviceRenderModeProvider>
```

**实施**：≤5 行代码 + 1 个 import。

---

### 缺口 B — 编辑器主界面没有 localStorage 自动保存

**现状**：
- `useScene.setScene()` 工具函数存在 ✅
- `project-loader.tsx` 从后端加载（需要 `?project=xxx` URL 参数）✅
- `proposal-demo/_modules/types.ts:185` 有 localStorage 读写 ✅
- **编辑器主界面无 autosave，也不读 localStorage** ❌

意味着：用户在编辑器里放灯、调参 → 刷新 → 全部丢失。只有显式"创建项目"并带着 `?project=xxx` 访问才能保留。

**两条修复路径**：

**Option A（快速 MVP 落地，推荐）—— localStorage 自动保存**

新建 `apps/editor/app/_hooks/use-scene-autosave.ts`（约 25 行）：
```ts
'use client'
import { useScene } from '@pascal-app/core'
import { useEffect } from 'react'

const KEY = 'vilhil:scene:v1'
const DEBOUNCE_MS = 800

export function useSceneAutosave() {
  // 挂载时读
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY)
      if (!raw) return
      const { nodes, rootNodeIds } = JSON.parse(raw)
      useScene.getState().setScene(nodes, rootNodeIds)
    } catch (err) {
      console.warn('[autosave load]', err)
    }
  }, [])

  // 订阅写（debounce）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = useScene.subscribe((state) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          window.localStorage.setItem(KEY, JSON.stringify({
            nodes: state.nodes,
            rootNodeIds: state.rootNodeIds,
          }))
        } catch (err) {
          console.warn('[autosave save]', err)
        }
      }, DEBOUNCE_MS)
    })
    return () => {
      unsub()
      if (timer) clearTimeout(timer)
    }
  }, [])
}
```

在 `apps/editor/app/page.tsx`（或编辑器入口组件）调用 `useSceneAutosave()` 一次。

**Option B（完整方案）—— 接上后端 project API**

编辑器启动时自动创建 project（如果没有），之后所有改动写到 PostgreSQL。需要改 `lib/project-api.ts` + 编辑器入口 + 登录态检查。**约 40-60 行，跨越 3 个文件。**

**推荐 Option A**：MVP 闭环用 localStorage 就够，后端持久化等账号体系完全落地后再接 Option B。

---

## 2. 执行清单（给 Claude Code）

按顺序执行。每完成一项，在 PR 里打 ✅。

### S1-CLOSE-001: 编辑器 Preview 接 DeviceRenderMode

- 读 `packages/editor/src/components/editor/index.tsx` 找到 Canvas 外层 wrapper
- 从 `@pascal-app/viewer`（或对应路径）import `DeviceRenderModeProvider`
- 外层包 `<DeviceRenderModeProvider mode={isPreviewMode ? 'demo' : 'base'}>`
- **行数上限**：8 行（1 import + 2 行 wrapper open/close + 可能 5 行 import 调整）
- **验证**：编辑器放灯 → 点 Preview → 能看到光锥

### S1-CLOSE-002: 新建 `use-scene-autosave.ts` hook

- 路径：`apps/editor/app/_hooks/use-scene-autosave.ts`
- 内容：按上面 Option A 的代码
- **行数上限**：40 行（含注释）
- **验证**：打开编辑器控制台 `localStorage.getItem('vilhil:scene:v1')` 能看到 JSON

### S1-CLOSE-003: 在编辑器入口调用 autosave

- 找到编辑器主 page.tsx / layout.tsx / 入口 Client Component
- 调用 `useSceneAutosave()`
- **行数上限**：3 行（1 import + 1 调用）
- **验证**：放灯 → 刷新 → 灯还在，参数还对

### S1-CLOSE-004: 端到端走查 5 个场景

这步**不写代码**，只走查。按 S1-SPEC.md 的 BDD 场景 1-5 在本地 dev server 上逐个跑，每个场景记录："通过 / 失败 / 在第几步断"。失败的回到对应 CLOSE-00X 排查。

**验收通过标准**：5 个场景全部 Given/When/Then 走通。

### S1-CLOSE-005: 录一个 3-5 分钟 demo 视频

用任何录屏工具，真跑一遍场景 1→2→3→4→5。视频就是 S1 的交付物。

---

## 3. 明确冻结清单

**在 S1-CLOSE-001~005 未全部通过前，以下工作一律停止**：

- DeviceSpec 分层进一步抽象（等 registry 触发线）
- S2 的 L2 交互（点灯开关）
- S3 的场景编辑器
- 更多 renderType 扩展（已经 29 个了够演示）
- UI 美化 / 动画优化
- 账号体系 UI 打磨
- 分享链接细节打磨
- Interaction 层设计
- 新子系统 demo 页面

**唯一允许**：修 CLOSE 过程中发现的 blocker bug。

---

## 4. 风险

| 风险 | 概率 | 缓解 |
|------|------|------|
| Preview 模式切换后有其他组件也假设 'base'，导致报错 | 中 | CLOSE-001 完成后先本地点一下，有报错回滚 |
| localStorage 存的 JSON 太大（> 5MB） | 低 | 当前场景节点数 < 100，JSON 不会超 1MB |
| autosave 和 project-loader 冲突（同时设置 scene） | 中 | 写入时先检查 `?project=` 参数，有 project ID 时跳过 autosave load |
| 端到端走查发现场景 1/2/4 其实也没通（审计看代码但没跑）| 中 | CLOSE-004 就是为此 — 真跑一遍 |

---

## 5. 完成后的下一步

S1 收口后，**立刻做 commit + tag**：`git tag s1-mvp-closure`。然后再开 S2。

S2 的起点不是新代码，而是"拿这个 tag 给一个真实客户（或模拟客户）看，记录反馈"。反馈决定 S2 优先级。

---

## 6. 更新记录

- 2026-04-24：初稿。基于 S1 BDD 场景端到端审计。
