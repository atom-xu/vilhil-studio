# VilHil Studio 代码审查规范

> 审查官职责：安全、质量、性能、一致性。本文件是所有 AI 提交代码前的强制检查清单。
> 发现违规必须在本次会话内修复后方可提交。

---

## 1. 风险优先级

| 级别 | 含义 | 示例 |
|------|------|------|
| **P0** | 崩溃 / 数据错误 / 权限越界 | OOM、状态写错楼层、未鉴权写操作 |
| **P1** | 高概率业务回归 / 关键路径劣化 | 设备增删时内存泄漏、HMR 每次崩溃 |
| **P2** | 可维护性 / 一致性问题 | dispose 调用位置不一致、接口字段冗余 |
| **P3** | 建议性优化 | useMemo 粒度、注释缺失 |

P0/P1 未关闭不得提交。

---

## 2. 三维渲染层（P0/P1）

### 2.1 Three.js 内存管理 ✅必查

每个使用 Three.js 对象的组件，**卸载时必须 dispose**：

```tsx
// ✅ 正确
useEffect(() => {
  return () => {
    geometry.dispose()
    material.dispose()
    texture.dispose()
  }
}, [geometry, material, texture])

// ❌ 错误 — useMemo 的返回值不是 cleanup，永远不会执行
useMemo(() => {
  return () => { geometry.dispose() }  // ← 被忽略
}, [geometry])
```

**需要 dispose 的对象类型：**
- `BufferGeometry` / `ConeGeometry` / `CylinderGeometry` 等所有 Geometry
- `ShaderMaterial` / `MeshStandardMaterial` / `MeshBasicMaterial` 等所有 Material
- `CanvasTexture` / `DataTexture` / `VideoTexture` 等所有 Texture
- `RenderTarget` / `WebGLRenderTarget`
- `InstancedMesh`（通过 `.geometry.dispose()` + `.material.dispose()`）

**例外**：R3F 的 JSX 原生几何体（`<boxGeometry />`）由 R3F 自动管理，无需手动 dispose。

---

### 2.2 useFrame 零垃圾原则 ✅必查

`useFrame` 回调每秒执行 60 次，**禁止在回调体内创建任何对象**：

```tsx
// ❌ 每帧 new 对象 → GC 压力 → OOM
useFrame(({ camera }) => {
  const dir = new THREE.Vector3()       // ← 禁止
  const mat = new THREE.Matrix4()       // ← 禁止
  const box = new THREE.Box3()          // ← 禁止
})

// ✅ 组件级 ref 复用
const _dir = useRef(new THREE.Vector3())
const _mat = useRef(new THREE.Matrix4())

useFrame(({ camera }) => {
  camera.getWorldDirection(_dir.current)
  // 直接操作 _dir.current，零分配
})
```

**同样禁止**：`array.flatMap`、`Object.entries`、`JSON.parse`、字符串模板拼接等会产生临时对象的操作。

---

### 2.3 useMemo 缓存几何体参数

当几何体尺寸由 props 决定时，args 必须用 `useMemo`：

```tsx
// ❌ 每次 render 创建新 args 数组
<cylinderGeometry args={[w / 2, w / 2, h, 32]} />

// ✅
const args = useMemo<[number, number, number, number]>(
  () => [w / 2, w / 2, h, 32],
  [w, h]
)
<cylinderGeometry args={args} />
```

---

### 2.4 useEffect cleanup 模式

有副作用的 useEffect 必须返回 cleanup：

```tsx
// ✅ 纹理每次重建后的清理
useEffect(() => {
  const tex = makeTexture(color)
  mesh.material.map = tex
  return () => { tex.dispose() }   // ← 必须
}, [color])

// ✅ 事件监听
useEffect(() => {
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
}, [handler])

// ✅ setInterval
useEffect(() => {
  const id = setInterval(tick, 1000)
  return () => clearInterval(id)
}, [])
```

---

## 3. React Hooks 正确性（P0）

| Hook | 允许用途 | 禁止用途 |
|------|----------|----------|
| `useMemo` | 缓存计算值、对象初始化 | 副作用、dispose 调用、DOM 操作 |
| `useEffect` | 副作用、订阅、cleanup | 返回非函数值 |
| `useRef` | 跨帧可变值、DOM 引用 | 触发重渲染的状态 |
| `useCallback` | 稳定函数引用 | 包装非函数 |

**每次写 `useMemo` 时自问**：这个值是否有副作用？如果是 → 改用 `useEffect`。

---

## 4. 业务架构（P0）

1. 智能设备归属 `Furnish` 体系，**不得**塞入 `Structure` 主流程。
2. 功能先做工具函数（`packages/smarthome/src/tools/`），再做 UI 包装。
3. 设备运行时真值在 `useScene`；UI 偏好放 `useDeviceState`。
4. 一次交互只做一件事（"聚焦"和"显隐"必须分离）。
5. 画布与面板数据必须来自**同一楼层作用域**。

---

## 5. AI 一致性检查（P1）

多个 AI 轮流工作时，以下接口必须保持同步：

### 5.1 新增组件必须同步导出

```
packages/viewer/src/components/renderers/device/animations/
  ├── index.ts          ← 新 animation 必须在此 export
  └── [new-animation].tsx

packages/viewer/src/index.ts ← 新的公开 API 必须在此 export
```

### 5.2 数据字段同步

新增设备字段必须同时更新：
- `packages/core/src/schema/nodes/device.ts` — 类型定义
- `packages/smarthome/src/device-catalog.ts` — 默认值
- `packages/viewer/src/components/renderers/device/device-geometry.tsx` — `DeviceVisualState` 接口
- `docs/DATA-SCHEMA.md` — 文档

### 5.3 禁止孤立文件

新建文件必须被至少一个 index.ts 导入，否则视为死代码，不得提交。

---

## 6. 安全（P0）

1. **禁止**在客户端代码中 hardcode 任何密钥、token、数据库连接串。
2. 用户输入（表单、URL 参数）必须在边界校验，不得直接拼入 SQL / shell 命令。
3. 分享 token 必须走服务端验证，不得仅凭客户端判断访问权限。
4. `dangerouslySetInnerHTML` 使用前必须有代码注释说明来源已消毒。
5. API 路由必须检查会话，`/api/share/[token]` 类接口除外（公开只读）。

---

## 7. 性能基线（P1）

| 指标 | 阈值 |
|------|------|
| dev server 稳态 RSS | < 6 GB |
| 单文件行数 | < 800 行（超出须拆分） |
| useFrame 内 GC 对象 | 0 |
| 模块顶层 Three.js 对象 | 0（移入 useMemo / useRef） |
| 未被导入的新文件 | 0 |

---

## 8. 提交前自检清单

```
[ ] useFrame 内无 new THREE.* / new Array / Object 等对象创建
[ ] 所有手动创建的 Geometry / Material / Texture 都有 useEffect dispose
[ ] useMemo 未被用来做副作用
[ ] 新增组件已添加到对应 index.ts 导出
[ ] 新增数据字段已同步 core schema + catalog + DATA-SCHEMA.md
[ ] useEffect 内的事件监听 / 定时器都有 cleanup
[ ] 单文件不超过 800 行
[ ] 无 hardcode 密钥或环境变量直接写入源码
```

---

## 9. 典型历史违规（勿重犯）

| 日期 | 文件 | 问题 | 教训 |
|------|------|------|------|
| 2026-04-22 | `hvac-ribbon-flow.tsx` | `useFrame` 内每帧 `new THREE.Vector3()` | useFrame 零垃圾原则 |
| 2026-04-22 | `hvac-ribbon-flow.tsx` | 云纹理 `useEffect` 缺少 cleanup | 每次 new 出来的都要 return dispose |
| 2026-04-22 | `laser-scan-cone.tsx` | `useMemo` 替代 `useEffect` 做 dispose | useMemo 返回值不是 cleanup |

---

## 10. PR 描述模板

```md
## 变更目的
- 解决了什么业务问题

## 实现方式
- 新增/修改了哪些工具函数
- UI 如何调用

## 自检清单
- [ ] useFrame 零垃圾
- [ ] dispose 完整
- [ ] 导出同步
- [ ] 字段同步

## 验证
- 类型检查/构建结果
- BDD 验收点

## 文档同步
- 更新了哪些 docs 文件
```

---

## 11. 变更记录

- 2026-04-22: 大幅扩充技术审查维度（Three.js 内存、hooks 正确性、AI 一致性、性能基线）；增加历史违规记录。
- 2026-04-17: 新增统一评审标准与 PR 模板。
