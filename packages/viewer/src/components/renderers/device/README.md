# device/ 渲染层说明

## 当前架构：手工 dispatch + 扩容触发线

本目录采用**手工 dispatch**策略，无 registry、无 plugin system。

### 文件职责

| 文件 | 职责 |
|------|------|
| `device-renderer.tsx` | 顶层组合：Geometry + Effects + Light，按 DeviceRenderMode 分流 |
| `device-geometry.tsx` | 34 renderType switch-case，决定每种设备的 3D 造型 |
| `device-effects.tsx` | 9 subsystem if 链，决定演示模式下叠加哪些动画 |
| `device-render-mode.tsx` | 'base' \| 'demo' Context，控制是否渲染 Effects 层 |
| `device-light.tsx` | PointLight / SpotLight，独立于 effects 层 |
| `animations/` | 13 个独立 effect 文件，各自 Props 互不耦合 |

### 新增设备或 effect 的改动点

1. `device-geometry.tsx` 加 1 个 case（造型）
2. `device-effects.tsx` 加 1 个 if 分支（动画触发）
3. `animations/` 新建 1 个 effect 文件

每次只动 3 处，非指数增长。

### 扩容触发线

- `device-effects.tsx` effects 总数 > 15，**或**
- `device-geometry.tsx` renderType case > 40

触发任意一条时，必须重构为 registry 架构（参考 `docs/DEVICE-SPEC-DESIGN.md` 决策 1）。
