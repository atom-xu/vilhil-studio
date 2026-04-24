# animations/ 编写约定

## 共有字段约定

所有 effect 组件**必须**接受以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `position` | `[number, number, number]` | 设备在 3D 场景中的世界坐标，必填 |

Lighting 类 effect 使用 `intensity: number (0-1)` 表示强度。
其他类别使用场景特定字段（如 `fovDeg`、`busType`、`signalRadius`），无需强制统一。

## 命名规则

文件名格式：`<subsystem>-<effect>.tsx`

示例：`hvac-airflow.tsx`、`security-laser-scan-cone.tsx`（短名则省略 subsystem 前缀）。

## 生命周期要求

每个 effect 必须在 `useEffect` cleanup 中释放 Three.js 资源：

```ts
useEffect(() => {
  return () => {
    geometry.dispose()
    material.dispose()
  }
}, [])
```

## 两种美学范式

新增 effect 时根据语义选择范式，不强制统一：

### 粒子范式（THREE.Points）
适合**柔和效果**：灯光晕、气流扩散、信号覆盖。

代表文件：`light-cone.tsx`、`hvac-airflow.tsx`、`particle-coverage.tsx`

特征：逐帧更新 attribute，使用 `PointsMaterial`，视觉柔和有漂浮感。

### 几何范式（ConeGeometry / shader）
适合**硬边效果**：扫描锥、FOV 边界、总线连线。

代表文件：`laser-scan-cone.tsx`、`camera-fov.tsx`、`bus-visualizer.tsx`

特征：使用 `ConeGeometry` 或自定义 shader，边界清晰，适合技术感强的子系统。

## 当前 effect 一览（13 个）

| 文件 | 子系统 | 范式 |
|------|--------|------|
| `light-cone.tsx` | lighting | 粒子 |
| `hvac-airflow.tsx` | hvac | 粒子 |
| `hvac-ribbon-flow.tsx` | hvac | 几何 |
| `particle-coverage.tsx` | network | 粒子 |
| `laser-scan-cone.tsx` | security | 几何 |
| `camera-fov.tsx` | security | 几何 |
| `bus-visualizer.tsx` | network | 几何 |
| `architecture-hub.tsx` | network | 几何 |
| `speaker-waves.tsx` | audio | 粒子 |
| `wifi-heatmap.tsx` | network | 粒子 |
| `network-heatmap-overlay.tsx` | network | 粒子 |
| `curtain-panel.tsx` | curtain | 几何 |
| `xray-overlay.tsx` | (全局) | 几何 |

> 扩容触发线：effect 总数 > 15 时必须重构为 registry 架构（参考 `docs/DEVICE-SPEC-DESIGN.md`）。
