import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

interface DeviceLightProps {
  brightness: number
  color: string
  colorTemp?: number
  renderType: string
}

// 动画速度 — 越大越快（单位：1/s）
// 5 ≈ 约 200ms 达到 63%，400ms 达到 86%，感受上约 500ms 完全过渡
const LERP_SPEED = 5

/**
 * DeviceLight — 灯光照明效果
 *
 * S4 动画：brightness / colorTemp 通过 useFrame 逐帧插值，完全在 R3F 侧完成。
 * Zustand 保存目标值，组件动画到目标值。不写 Zustand，无 Undo 副作用。
 *
 * 挂载时亮度从 0 开始渐入（fade-in），使场景切换时灯光有自然过渡。
 */
export const DeviceLight = ({ brightness, color, colorTemp, renderType }: DeviceLightProps) => {
  const lightRef = useRef<THREE.SpotLight | THREE.PointLight | THREE.RectAreaLight>(null!)

  // 目标值（来自 Zustand 的逻辑状态）
  // WebGPU 物理渲染：PointLight/SpotLight 强度单位为坎德拉 (cd)。
  // 房间高度 2.65m → 地面照度 = I / d² ≈ I / 7。
  // 填充光约 1-2 lux，筒灯需 ~80cd 才能在地面产生明显光斑 (≈11 lux)。
  const targetIntensity = (brightness / 100) * 80

  const targetColor = useMemo(() => {
    return colorTemp ? kelvinToRgb(colorTemp) : new THREE.Color(color)
  }, [color, colorTemp])

  // 动画当前值（refs，不触发 re-render）
  // 从 0 开始，实现挂载时的渐入效果
  const currentIntensity = useRef(0)
  const currentColor = useRef(targetColor.clone())

  useFrame((_, dt) => {
    const light = lightRef.current
    if (!light) return

    const t = Math.min(dt * LERP_SPEED, 1)

    // 亮度插值
    currentIntensity.current += (targetIntensity - currentIntensity.current) * t
    light.intensity = currentIntensity.current

    // 色温/颜色插值
    currentColor.current.lerp(targetColor, t)
    light.color.copy(currentColor.current)
  })

  // 注意：intensity 和 color 不传给 JSX 属性，由 useFrame 管理
  // 避免 R3F 每帧 reconcile 覆盖动画值
  switch (renderType) {
    case 'downlight':
      // 使用 pointLight 避免 SpotLight target 在 R3F group 内的坐标系歧义
      // 筒灯安装在天花板，point light 向下辐射足以模拟筒灯效果
      return (
        <pointLight
          ref={lightRef as any}
          decay={1.5}
          distance={10}
          position={[0, -0.08, 0]}
        />
      )
    case 'strip':
      // 用 pointLight 代替 rectAreaLight —— WebGPU 下 RectAreaLight 需要 LTC
      // 纹理初始化，而 pointLight 对灯带的氛围效果已经足够自然。
      return (
        <pointLight
          ref={lightRef as any}
          decay={1.2}
          distance={6}
          position={[0, 0, 0]}
        />
      )
    case 'wall-light':
      return (
        <pointLight
          ref={lightRef as any}
          decay={1.5}
          distance={8}
          position={[0, 0, 0.1]}
        />
      )
    default:
      return (
        <pointLight
          ref={lightRef as any}
          decay={1.5}
          distance={8}
          position={[0, -0.05, 0]}
        />
      )
  }
}

// ─── 色温转 RGB ──────────────────────────────────────────────────────────────

function kelvinToRgb(kelvin: number): THREE.Color {
  const temp = kelvin / 100
  let r: number, g: number, b: number

  if (temp <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(temp) - 161.1195681661
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492)
    b = 255
  }

  return new THREE.Color(
    Math.max(0, Math.min(1, r / 255)),
    Math.max(0, Math.min(1, g / 255)),
    Math.max(0, Math.min(1, b / 255)),
  )
}
