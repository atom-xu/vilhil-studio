'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import type { HvacMode } from './hvac-airflow'

interface HvacRibbonFlowProps {
  /** 出风口世界坐标（设备中心） */
  position: [number, number, number]
  /** 相机朝向 Y 旋转（让 ribbon 朝设备"前方" = 墙外方向） */
  rotationY?: number
  mode?: HvacMode
  /** 0-1 强度；mode='off' 时自动忽略 */
  intensity?: number
}

/*  ─── Vent / Ribbon 参数（来自 files/airflow_cold.js）──────────────── */
const VENT_W = 1.0
const VENT_H = 0.20
const LINE_LEN = 4.0          // ribbon 长度（向前扩散距离）
const SPREAD_X = 0.45
const SPREAD_Y = 0.28
const N = 100                 // ribbon 数量
const SEG = 24
const RIBBON_W = 0.015
const CLOUD_COUNT = 20

/* 冷/热配色（shader uniform） */
const COLOR_BY_MODE = {
  cold: {
    edge:  new THREE.Color(0.55, 0.78, 1.00),   // 边缘浅蓝
    core:  new THREE.Color(0.04, 0.25, 0.90),   // 中心深蓝
    cloud: [120, 190, 255] as [number, number, number],
  },
  hot: {
    edge:  new THREE.Color(1.00, 0.72, 0.55),
    core:  new THREE.Color(0.92, 0.18, 0.05),
    cloud: [255, 170, 136] as [number, number, number],
  },
  off: {
    edge:  new THREE.Color(0.7, 0.7, 0.7),
    core:  new THREE.Color(0.5, 0.5, 0.5),
    cloud: [180, 180, 180] as [number, number, number],
  },
} as const

/** 2 次贝塞尔插值 */
function bezier(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** 生成径向渐变云雾纹理（给 cloud mesh 用） */
function makeCloudTexture(r: number, g: number, b: number): THREE.CanvasTexture {
  const s = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, s, s)
  const blobs: Array<[number, number, number, number]> = [
    [0.5, 0.5, 0.45, 0.14],
    [0.38, 0.42, 0.28, 0.10],
    [0.62, 0.55, 0.25, 0.09],
    [0.48, 0.65, 0.22, 0.08],
  ]
  for (const [cx, cy, rd, a] of blobs) {
    const gr = ctx.createRadialGradient(cx * s, cy * s, 0, cx * s, cy * s, rd * s)
    gr.addColorStop(0,   `rgba(${r},${g},${b},${a})`)
    gr.addColorStop(0.4, `rgba(${r},${g},${b},${a * 0.5})`)
    gr.addColorStop(1,   `rgba(${r},${g},${b},0)`)
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.arc(cx * s, cy * s, rd * s, 0, Math.PI * 2)
    ctx.fill()
  }
  return new THREE.CanvasTexture(cv)
}

/**
 * 墙挂空调出风 —— ribbon 流线 + 云雾
 *
 * Ported from files/airflow_cold.js + airflow_hot.js
 * - 100 条贝塞尔 ribbon，向前 4m 扩散
 * - 20 个云雾 billboard（面相相机，各自独立飘）
 * - ShaderMaterial 做高斯软边
 * - mode 冷/热切换 3 处配色 + 关闭时透明度渐 0
 */
export const HvacRibbonFlow = ({ position, rotationY = 0, mode = 'cold', intensity = 1 }: HvacRibbonFlowProps) => {
  const { camera } = useThree()
  const meshRef = useRef<THREE.Mesh>(null)
  const cloudRefs = useRef<Array<THREE.Mesh | null>>(Array(CLOUD_COUNT).fill(null))
  const currentIntensity = useRef(0)
  const _camDir = useRef(new THREE.Vector3())
  const _camRight = useRef(new THREE.Vector3())

  // ─── 初始化 ribbon 数据（一次）─────────────────────────────────
  const { lineData, vertsPerLine, bufferGeometry, material, cloudState, cloudTexture } = useMemo(() => {
    const ld = Array.from({ length: N }, () => {
      const sx = (Math.random() - 0.5) * VENT_W
      const sy = (Math.random() - 0.5) * VENT_H
      const ex = sx + (sx / (VENT_W * 0.5)) * SPREAD_X * (0.3 + Math.random() * 0.7)
      const ey = sy + (Math.random() - 0.5) * SPREAD_Y
      const ez = -LINE_LEN * (0.55 + Math.random() * 0.45)
      const bendY = -0.3 - Math.random() * 0.5
      const bendX = (Math.random() - 0.5) * 0.3
      return {
        sx, sy, sz: 0,
        cx: (sx + ex) * 0.5 + bendX,
        cy: (sy + ey) * 0.5 + bendY,
        cz: ez * 0.45,
        ex, ey, ez,
        phase: Math.random(),
        speed: 0.13 + Math.random() * 0.17,
        waveAmp: 0.008 + Math.random() * 0.018,
        waveFreq: 0.8 + Math.random() * 2.0,
        segLen: 0.12 + Math.random() * 0.22,
        width: RIBBON_W * (0.5 + Math.random() * 1.0),
      }
    })

    const vpl = (SEG + 1) * 2
    const totalVerts = N * vpl
    const positions = new Float32Array(totalVerts * 3)
    const across    = new Float32Array(totalVerts)
    const alpha     = new Float32Array(totalVerts)
    const indices: number[] = []
    for (let i = 0; i < N; i++) {
      for (let s = 0; s < SEG; s++) {
        const base = i * vpl + s * 2
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('aAcross',  new THREE.BufferAttribute(across, 1))
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alpha, 1))
    geo.setIndex(indices)

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColorEdge: { value: new THREE.Color(COLOR_BY_MODE.cold.edge) },
        uColorCore: { value: new THREE.Color(COLOR_BY_MODE.cold.core) },
        uIntensity: { value: 0 },
      },
      vertexShader: /* glsl */`
        attribute float aAcross;
        attribute float aAlpha;
        varying float vAcross;
        varying float vAlpha;
        void main() {
          vAcross = aAcross;
          vAlpha  = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3  uColorEdge;
        uniform vec3  uColorCore;
        uniform float uIntensity;
        varying float vAcross;
        varying float vAlpha;
        void main() {
          float g = exp(-vAcross * vAcross * 5.5);
          vec3  col = mix(uColorEdge, uColorCore, g * 0.85);
          gl_FragColor = vec4(col, g * vAlpha * 0.88 * uIntensity);
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })

    // 云雾状态
    const cs = Array.from({ length: CLOUD_COUNT }, () => ({
      x: (Math.random() - 0.5) * VENT_W * 0.9,
      y: (Math.random() - 0.5) * VENT_H,
      life: Math.random(),
      speed: 0.07 + Math.random() * 0.09,
      size: 0.35 + Math.random() * 0.5,
      bendY: -0.25 - Math.random() * 0.4,
      bendX: (Math.random() - 0.5) * 0.2,
      maxZ: -LINE_LEN * (0.4 + Math.random() * 0.4),
      angle: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.003,
    }))

    const [cr, cg, cb] = COLOR_BY_MODE.cold.cloud
    const cloudTex = makeCloudTexture(cr, cg, cb)

    return {
      lineData: ld,
      vertsPerLine: vpl,
      bufferGeometry: geo,
      material: mat,
      cloudState: cs,
      cloudTexture: cloudTex,
    }
  }, [])

  // ─── mode 切换时更新配色 uniform + 重建 cloud texture ──────────
  useEffect(() => {
    const target = COLOR_BY_MODE[mode]
    ;(material.uniforms.uColorEdge!.value as THREE.Color).copy(target.edge)
    ;(material.uniforms.uColorCore!.value as THREE.Color).copy(target.core)

    const [r, g, b] = target.cloud
    const newTex = makeCloudTexture(r, g, b)
    cloudRefs.current.forEach((m) => {
      if (!m) return
      const mat = m.material as THREE.MeshBasicMaterial
      mat.map?.dispose()
      mat.map = newTex
      mat.needsUpdate = true
    })
    cloudTextureRef.current = newTex
    return () => { newTex.dispose() }
  }, [mode, material])

  const cloudTextureRef = useRef<THREE.CanvasTexture>(cloudTexture)

  // ─── 每帧更新 ribbon + cloud ──────────────────────────────────
  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime()

    // 强度插值（使用 useFrame 提供的 delta，不能再调 clock.getDelta()）
    const targetInt = mode === 'off' ? 0 : intensity
    const dt = Math.min(delta, 1 / 20)
    currentIntensity.current += (targetInt - currentIntensity.current) * Math.min(dt * 4, 1)
    const eff = currentIntensity.current
    material.uniforms.uIntensity!.value = eff

    if (eff < 0.005) return

    // camera right 向量（ribbon 朝相机摆放）
    camera.getWorldDirection(_camDir.current)
    _camRight.current.crossVectors(_camDir.current, camera.up).normalize()
    const camRight = _camRight.current

    // 因为 group 做了 rotationY 旋转，camRight 需要转回"本地"
    const invRot = -rotationY
    const cosI = Math.cos(invRot), sinI = Math.sin(invRot)
    const localRightX = camRight.x * cosI - camRight.z * sinI
    const localRightZ = camRight.x * sinI + camRight.z * cosI

    const posAttr = bufferGeometry.attributes.position!
    const acrAttr = bufferGeometry.attributes.aAcross!
    const alpAttr = bufferGeometry.attributes.aAlpha!
    const pos = posAttr.array as Float32Array
    const acr = acrAttr.array as Float32Array
    const alp = alpAttr.array as Float32Array

    for (let i = 0; i < N; i++) {
      const d = lineData[i]!
      const head = (t * d.speed + d.phase) % 1
      const tail = head - d.segLen
      for (let s = 0; s <= SEG; s++) {
        const frac = s / SEG
        const p = tail + d.segLen * frac
        const cp = Math.max(0, Math.min(p, 1))
        const alpha = p < 0
          ? 0
          : smoothstep(0, 0.18, frac) * smoothstep(0, 0.18, 1 - frac) * Math.pow(1 - cp, 1.5)
        const wave = Math.sin(t * d.waveFreq + d.phase * Math.PI * 2 + cp * 5) * d.waveAmp * cp
        const cx = bezier(d.sx, d.cx, d.ex, cp) + wave
        const cy = bezier(d.sy, d.cy, d.ey, cp)
        const cz = bezier(d.sz, d.cz, d.ez, cp)
        const vBase = i * vertsPerLine + s * 2
        const hw = d.width * (1 + cp * 0.6)
        // 本地坐标系下沿 camera.right 做 ribbon 宽度
        pos[vBase * 3 + 0] = cx - localRightX * hw
        pos[vBase * 3 + 1] = cy - camRight.y * hw
        pos[vBase * 3 + 2] = cz - localRightZ * hw
        acr[vBase]     = -1
        alp[vBase]     = alpha

        pos[(vBase + 1) * 3 + 0] = cx + localRightX * hw
        pos[(vBase + 1) * 3 + 1] = cy + camRight.y * hw
        pos[(vBase + 1) * 3 + 2] = cz + localRightZ * hw
        acr[vBase + 1] = 1
        alp[vBase + 1] = alpha
      }
    }
    posAttr.needsUpdate = true
    acrAttr.needsUpdate = true
    alpAttr.needsUpdate = true

    // 云雾更新
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const p = cloudState[i]!
      p.life += p.speed * 0.012
      if (p.life >= 1) {
        p.life = 0
        p.x = (Math.random() - 0.5) * VENT_W * 0.9
        p.y = (Math.random() - 0.5) * VENT_H
      }
      const lf = p.life
      const bx = bezier(p.x, p.x + p.bendX, p.x + p.bendX * 2, lf)
      const by = bezier(p.y, p.y + p.bendY * 0.5, p.y + p.bendY * 1.5, lf)
      const bz = bezier(0, p.maxZ * 0.45, p.maxZ, lf)
      p.angle += p.rotSpeed
      const scale = p.size * (0.4 + lf * 1.5)
      let alpha = lf < 0.15 ? lf / 0.15 : lf < 0.65 ? 1 : 1 - (lf - 0.65) / 0.35
      alpha *= 0.11 * eff

      const m = cloudRefs.current[i]
      if (!m) continue
      m.position.set(bx, by, bz)
      m.scale.setScalar(scale)
      m.quaternion.copy(camera.quaternion)
      m.rotateZ(p.angle)
      const mat = m.material as THREE.MeshBasicMaterial
      mat.opacity = alpha
    }
  })

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 出风口格栅线框 */}
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(VENT_W, VENT_H)]} />
        <lineBasicMaterial
          color={mode === 'hot' ? 0xffaa88 : 0xaaccee}
          transparent
          opacity={0.5}
        />
      </lineSegments>
      {/* Ribbon 主体 */}
      <mesh ref={meshRef} geometry={bufferGeometry} material={material} />
      {/* 云雾 */}
      {Array.from({ length: CLOUD_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { cloudRefs.current[i] = el }}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={cloudTexture}
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}
