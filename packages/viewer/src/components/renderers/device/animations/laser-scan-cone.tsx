'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Laser Scan Cone —— 安防摄像头激光扫描锥
 *
 * Ported from files/laser_cone.js
 * - 4 层叠加 ConeGeometry（不同频率）
 * - 每层 shader 做竖向线条 + 周向扫描线
 * - 顶点→底圆渐隐 pow(v, 1.6)
 * - 整体微摆动模拟摄像头轻扫
 */

interface LaserScanConeProps {
  /** 锥位置（已在设备本地坐标系） */
  position?: [number, number, number]
  /** 锥的高度（即"探测距离"）；ConeGeometry height */
  range?: number
  /** 锥底圆半径（决定 FOV 开口）—— 也可改为 fovDeg 派生 */
  fovDeg?: number
  /** 朝向旋转（弧度），绕设备的朝外方向 */
  rotationY?: number
  /** 颜色 */
  color?: string
  /** 是否启用整体摆动 */
  swing?: boolean
  /** 整体 opacity 倍率（子系统聚焦 / 隐藏时用） */
  intensity?: number
}

const PI2 = Math.PI * 2

// 层配置：lineFreq / scanSpeed / scanSpeed2 / waveAmp / opacity
const LAYERS = [
  { lineFreq: 14, sSpeed: 1.6, sSpeed2: 3.2, wAmp: 0.55, op: 0.95 },
  { lineFreq: 28, sSpeed: 2.3, sSpeed2: 4.8, wAmp: 0.4,  op: 0.80 },
  { lineFreq: 7,  sSpeed: 0.8, sSpeed2: 1.4, wAmp: 0.3,  op: 0.65 },
  { lineFreq: 42, sSpeed: 3.1, sSpeed2: 6.2, wAmp: 0.25, op: 0.50 },
] as const

export const LaserScanCone = ({
  position = [0, 0, 0],
  range = 5,
  fovDeg = 90,
  rotationY = 0,
  color = '#e66008',
  swing = true,
  intensity = 1,
}: LaserScanConeProps) => {
  const groupRef = useRef<THREE.Group>(null)
  const timeRef = useRef({ value: 0 })
  const materialsRef = useRef<THREE.MeshBasicMaterial[]>([])

  // ConeGeometry：底圆半径按 fov 派生（tan(fov/2) × height）
  const bottomRadius = useMemo(() => {
    const half = (fovDeg * 0.5 * Math.PI) / 180
    return Math.tan(half) * range
  }, [fovDeg, range])

  // 几何（一次创建，多层共用）
  const geometry = useMemo(() => {
    const g = new THREE.ConeGeometry(bottomRadius, range, 120, 40, true)
    // 默认 ConeGeometry 顶点在 y=height/2, 底圆在 y=-height/2
    // translate(0, -range/2, 0) 让顶点落到 y=0（挂载点），底圆在 y=-range
    g.translate(0, -range / 2, 0)
    return g
  }, [bottomRadius, range])

  // 材质（每层一个）
  const materials = useMemo(() => {
    const colObj = new THREE.Color(color)
    return LAYERS.map((cfg) => {
      const mat = new THREE.MeshBasicMaterial({
        color: colObj,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
      mat.defines = { USE_UV: '' }
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.time   = timeRef.current
        shader.uniforms.lFreq  = { value: cfg.lineFreq }
        shader.uniforms.sSpeed = { value: cfg.sSpeed }
        shader.uniforms.sSpd2  = { value: cfg.sSpeed2 }
        shader.uniforms.wAmp   = { value: cfg.wAmp }
        shader.uniforms.uOp    = { value: cfg.op }
        shader.uniforms.uInt   = { value: 1 }
        // 暴露给外部更新
        ;(mat as any)._uniforms = shader.uniforms

        shader.fragmentShader = `
          uniform float time;
          uniform float lFreq;
          uniform float sSpeed;
          uniform float sSpd2;
          uniform float wAmp;
          uniform float uOp;
          uniform float uInt;
          #define PI2 ${PI2}
          ${shader.fragmentShader}
        `.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
            float t = time;
            float u = vUv.x;
            float v = vUv.y;

            float w1 = sin((u - t * 0.08) * lFreq * PI2) * 0.5 + 0.5;
            w1 = pow(w1, 4.0) * wAmp;
            float w2 = sin((u + t * 0.06) * lFreq * 1.8 * PI2) * 0.5 + 0.5;
            w2 = pow(w2, 6.0) * wAmp * 0.6;
            float w3 = sin((u - t * 0.04) * lFreq * 4.0 * PI2) * 0.5 + 0.5;
            w3 = pow(w3, 10.0) * wAmp * 0.35;

            float sl1 = smoothstep(0.007, 0., abs(u - mod(t * sSpeed * 0.08,       1.0)));
            float sl2 = smoothstep(0.004, 0., abs(u - mod(t * sSpd2  * 0.05 + 0.4, 1.0))) * 0.6;
            float sl3 = smoothstep(0.003, 0., abs(u - mod(t * sSpd2  * 0.09 + 0.7, 1.0))) * 0.4;

            float fadeOut = pow(v, 1.6);

            float a = w1;
            a = max(a, w2); a = max(a, w3);
            a = max(a, sl1); a = max(a, sl2); a = max(a, sl3);

            diffuseColor.a = a * fadeOut * uOp * uInt;
          `,
        )
      }
      return mat
    })
  }, [color])

  // 保存 materials 到 ref 给 useFrame 用
  materialsRef.current = materials

  // 几何体 dispose
  useEffect(() => {
    return () => {
      geometry.dispose()
      materials.forEach((m) => m.dispose())
    }
  }, [geometry, materials])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    timeRef.current.value = t

    // 同步 uInt（intensity）到所有材质的 shader uniform（onBeforeCompile 构造的 uniform）
    for (const mat of materialsRef.current) {
      const u = (mat as any)._uniforms as Record<string, { value: number }> | undefined
      if (u?.uInt) u.uInt.value = intensity
    }

    // 整体摆动
    if (swing && groupRef.current) {
      const s = Math.sin(t * 0.4) * 0.06
      groupRef.current.rotation.y = rotationY + s
    } else if (groupRef.current) {
      groupRef.current.rotation.y = rotationY
    }
  })

  return (
    <group ref={groupRef} position={position}>
      {/* 4 层同一几何不同材质叠加 */}
      {materials.map((mat, i) => (
        <mesh key={i} geometry={geometry} material={mat} />
      ))}
    </group>
  )
}
