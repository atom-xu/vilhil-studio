'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * WiFi Volumetric Heatmap —— 体积热力图
 *
 * Ported from files/heatmap_volumetric.js
 * - BoxGeometry BackSide + AABB 射线求交 + 体积积分
 * - 完全连续（无切片穿帮），支持 AP 方向性椭球覆盖
 * - 最多 8 个 AP（不足的用 power=0 填充）
 * - 颜色梯度：深绿(强) → 黄绿 → 黄 → 橙 → 红(弱)
 *
 * 使用：
 *   <WifiVolumetricHeatmap
 *     aps={[
 *       { pos: [-2.5, 2.8, -1.0], dir: [0, -1, 0], power: 1.0, dw: 0.7 },
 *     ]}
 *     roomCenter={[0, 0, 0]}
 *     roomSize={[10, 3, 7]}
 *   />
 */

const MAX_AP = 8

export interface HeatmapAP {
  /** AP 世界坐标（但相对于 roomCenter；一般传世界坐标，由上层保证） */
  pos: [number, number, number]
  /** 发射方向（内部会归一化） */
  dir: [number, number, number]
  /** 发射功率 0-1 */
  power: number
  /** 方向性 0=全向球 / 1=强方向椭球 */
  dw: number
}

interface WifiVolumetricHeatmapProps {
  aps: HeatmapAP[]
  /** 房间中心世界坐标（BoxMesh 的中心） */
  roomCenter?: [number, number, number]
  /** 房间尺寸 [W, H, D]（米） */
  roomSize: [number, number, number]
  /** 透明度倍率 0-1（subsystem focus 可调） */
  opacity?: number
}

export const WifiVolumetricHeatmap = ({
  aps,
  roomCenter = [0, 0, 0],
  roomSize,
  opacity = 1,
}: WifiVolumetricHeatmapProps) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera } = useThree()

  const [roomW, roomH, roomD] = roomSize
  const [cx, cy, cz] = roomCenter

  // Uniforms + material are stable across re-renders; uniform values are mutated in-place
  const { material, uniforms } = useMemo(() => {
    const apPos: THREE.Vector3[] = []
    const apDir: THREE.Vector3[] = []
    const apPow: number[] = []
    const apDw: number[] = []
    for (let i = 0; i < MAX_AP; i++) {
      apPos.push(new THREE.Vector3(0, 0, 0))
      apDir.push(new THREE.Vector3(0, -1, 0))
      apPow.push(0)
      apDw.push(0)
    }

    // 房间 AABB 的 min/max 使用世界坐标（配合 vWorldPos / uCamPos）
    const roomMin = new THREE.Vector3(cx - roomW / 2, cy - roomH / 2, cz - roomD / 2)
    const roomMax = new THREE.Vector3(cx + roomW / 2, cy + roomH / 2, cz + roomD / 2)

    const uniforms = {
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uAPCount: { value: 0 },
      uRoomMin: { value: roomMin },
      uRoomMax: { value: roomMax },
      uAPPos: { value: apPos },
      uAPDir: { value: apDir },
      uAPPow: { value: apPow },
      uAPDw: { value: apDw },
      uOpacity: { value: opacity },
    }

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        #define MAX_AP 8
        uniform float uTime;
        uniform vec3  uCamPos;
        uniform int   uAPCount;
        uniform vec3  uRoomMin, uRoomMax;
        uniform vec3  uAPPos[MAX_AP];
        uniform vec3  uAPDir[MAX_AP];
        uniform float uAPPow[MAX_AP];
        uniform float uAPDw[MAX_AP];
        uniform float uOpacity;
        varying vec3  vWorldPos;

        // 颜色梯度：深绿(强) → 黄绿 → 黄 → 橙 → 红(弱)
        vec3 heatColor(float s) {
          if(s > 0.72) return mix(vec3(.15,.75,.25), vec3(.05,.55,.20), (s-.72)/.28);
          if(s > 0.48) return mix(vec3(.95,.80,.05), vec3(.15,.75,.25), (s-.48)/.24);
          if(s > 0.26) return mix(vec3(.95,.38,.05), vec3(.95,.80,.05), (s-.26)/.22);
          if(s > 0.08) return mix(vec3(.85,.10,.15), vec3(.95,.38,.05), (s-.08)/.18);
          return vec3(.6,.05,.10);
        }

        // 单个 AP 信号强度（方向性椭球）
        float apSignal(int i, vec3 p) {
          vec3 delta = p - uAPPos[i];
          float dist = length(delta) + 0.001;
          float cosA = dot(normalize(delta), uAPDir[i]);
          float boost = 1.0 + uAPDw[i] * max(0., cosA) * 1.5;
          float penal = 1.0 - uAPDw[i] * max(0., -cosA) * 0.5;
          float eff   = dist / max(0.05, boost * penal);
          return min(1., uAPPow[i] * pow(2.2 / (eff + 0.08), 1.85));
        }

        void main() {
          vec3 ro = uCamPos;
          vec3 rd = normalize(vWorldPos - uCamPos);

          // 射线与房间 AABB 求交
          vec3 t1 = (uRoomMin - ro) / rd;
          vec3 t2 = (uRoomMax - ro) / rd;
          vec3 tA = min(t1, t2), tB = max(t1, t2);
          float tNear = max(max(tA.x, tA.y), tA.z);
          float tFar  = min(min(tB.x, tB.y), tB.z);
          if(tNear > tFar || tFar < 0.) { gl_FragColor=vec4(0); return; }
          tNear = max(tNear, 0.);

          float tLen = tFar - tNear;
          const int STEPS = 52;
          float ss = tLen / float(STEPS);

          vec3  col      = vec3(0.);
          float transmit = 1.;

          for(int s=0; s<STEPS; s++) {
            float t = tNear + (float(s) + 0.5) * ss;
            vec3  p = ro + rd * t;

            float sig = 0.;
            for(int i=0; i<MAX_AP; i++) {
              if(i >= uAPCount) break;
              sig = max(sig, apSignal(i, p));
            }
            if(sig < 0.03) continue;

            float pulse   = .92 + .08*sin(uTime*1.1 + sig*6.);
            float density = sig * sig * 0.14 * pulse;
            float alpha   = 1. - exp(-density * ss * 5.);

            col      += transmit * alpha * heatColor(sig);
            transmit *= (1. - alpha * 0.75);
            if(transmit < 0.02) break;
          }

          gl_FragColor = vec4(col, (1. - transmit) * 0.88 * uOpacity);
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })

    return { material, uniforms }
  }, [cx, cy, cz, roomW, roomH, roomD])

  // 同步 AP 数据到 uniforms（不重建 material）
  useEffect(() => {
    const n = Math.min(aps.length, MAX_AP)
    uniforms.uAPCount.value = n
    for (let i = 0; i < MAX_AP; i++) {
      const ap = aps[i]
      if (ap) {
        uniforms.uAPPos.value[i]!.set(ap.pos[0], ap.pos[1], ap.pos[2])
        uniforms.uAPDir.value[i]!.set(ap.dir[0], ap.dir[1], ap.dir[2]).normalize()
        uniforms.uAPPow.value[i] = ap.power
        uniforms.uAPDw.value[i] = ap.dw
      } else {
        uniforms.uAPPow.value[i] = 0
        uniforms.uAPDw.value[i] = 0
      }
    }
  }, [aps, uniforms])

  // 同步房间 AABB（如果外部修改 roomCenter / roomSize）
  useEffect(() => {
    uniforms.uRoomMin.value.set(cx - roomW / 2, cy - roomH / 2, cz - roomD / 2)
    uniforms.uRoomMax.value.set(cx + roomW / 2, cy + roomH / 2, cz + roomD / 2)
  }, [cx, cy, cz, roomW, roomH, roomD, uniforms])

  useEffect(() => {
    uniforms.uOpacity.value = opacity
  }, [opacity, uniforms])

  // Dispose material on unmount
  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  useFrame(({ clock, camera: cam }) => {
    uniforms.uTime.value = clock.getElapsedTime()
    uniforms.uCamPos.value.copy(cam.position)
    // camera prop captured at mount may differ from default; prefer live camera
    void camera
  })

  return (
    <mesh ref={meshRef} position={[cx, cy, cz]} material={material}>
      <boxGeometry args={[roomW, roomH, roomD]} />
    </mesh>
  )
}
