'use client'

/**
 * DemoBloomLayer — 演示页 3D 后期发光层（SelectiveBloom 版）
 *
 * 【关键机制】SelectiveBloom 只让被 `<Select enabled>` 包裹的 mesh 参与 bloom 输入。
 *  墙面被 SpotLight 照亮的像素 → 不在 selection 里 → 不进 bloom → 不可能爆白。
 *
 * 必须挂在 `<Selection>` 组件下游，<Selection> 在 page.tsx 的 Canvas 里包住整个场景树。
 *
 * 设计原则：
 *   - 灯具发光面（panel mesh、downlight bulb sphere、灯带 tube）→ <Select enabled>
 *   - 被光照亮的墙面/地板/家具 → 不参与 → 永远不会因 SpotLight 强度过高而爆
 *
 * AgX tone mapping 与 SelectiveBloom 配合：
 *   - emitter 的 emissive 即使到 1.0-2.0，AgX 压到屏幕 0.5-0.7
 *   - SelectiveBloom 在 selection mask 上做模糊后叠加到主画面
 *   - 主画面经过 AgX，bloom 加上去也经过 AgX → 永远不会无限累加
 */

import { EffectComposer, SelectiveBloom } from '@react-three/postprocessing'
import { LIGHTING_CONFIG } from './lighting-config'

export function DemoBloomLayer({ isNight }: { isNight: boolean }) {
  // SelectiveBloom 的 selection 由 <Selection> context 注入 —— 仅 <Select enabled>
  // 包住的 emitter mesh 进 bloom 输入。被光照亮的墙面/地板物理上不进 bloom。
  // 所有数值从 LIGHTING_CONFIG.bloom 读，单一来源。
  const cfg = LIGHTING_CONFIG.bloom
  const intensity = isNight ? cfg.intensityNight : cfg.intensityDay
  return (
    <EffectComposer multisampling={0}>
      <SelectiveBloom
        intensity={intensity}
        luminanceThreshold={cfg.luminanceThreshold}
        luminanceSmoothing={cfg.luminanceSmoothing}
        mipmapBlur={cfg.mipmapBlur}
      />
    </EffectComposer>
  )
}
