'use client'

/**
 * SideOpenCurtain —— 对开窗帘（R3F 壳，包裹 Curtain3D imperative 类）
 *
 * 历史：v0 是简易多薄片直挺布料模型（已废弃）。v1 换成参数化褶皱 + 弧长守恒
 * 振幅 + 飘动 vertex 位移的 Curtain3D（详见 curtain-3d-class.ts 头注 + HANDOFF.md）。
 *
 * 2026-10-06：认可的轻纱由 smarthome/curtain 提供，仅在本文件适配既有状态 props。
 * 遮光单层保留原实现；双层沿用旧盒体/遮光网格，纱帘使用复用网格的渲染动画。
 * 状态 prop 保持原语义；可选 wallSurfaceZ 仅传递安装几何，不进入持久化。
 *
 * 坐标系（局部）：CurtainContainer 已经把 group 转到窗户世界中心 + 朝向墙法线。
 *   +X = 沿墙方向（窗户宽度）
 *   +Y = 上
 *   +Z = 室内方向
 *
 * 内部位置补偿：
 *   Curtain3D class 原点在 pelmet 顶部，面板从那里向下挂 height 米。
 *   我们外层包一个 group 上抬 (height/2 + boxHeight)，让面板正好覆盖窗户从顶到底。
 *
 * 多层模式：单层 'blackout' / 'sheer' 分别用对应材质；
 *   多层（双纱+双布）由 CurtainContainer 改为单实例 'both' 模式（避免两个 pelmet 叠加）。
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SheerCurtain, sheerHousingDimensions } from '@vilhil/smarthome/curtain'
import { Curtain3D } from './curtain-3d-class'

export interface CurtainCommonProps {
  /** 窗户宽度（轨道沿墙方向长度）m */
  width: number
  /** 窗户高度 m */
  height: number
  /** 本层 z 偏移 —— 单层模式仍兼容（多层模式应该走 CurtainContainer 的 'both' 单实例）*/
  layerZ: number
  /** Existing linked window's interior wall face, relative to window centre. */
  wallSurfaceZ?: number
  /** 0-100，0=完全关闭、100=完全打开 */
  openPct: number
  /** 'blackout' | 'sheer' */
  material?: 'blackout' | 'sheer'
}

const PELMET_HEIGHT = 0.18 // 必须和 Curtain3D DEFAULTS.boxHeight 保持一致

/**
 * 单层对开帘 —— 多层场景不应该走这里（应该用 SideOpenCurtainBoth），
 * 但为兼容历史调用方仍保留 layerZ 参数。
 */
const LegacyBlackoutCurtain = ({
  width,
  height,
  layerZ,
  openPct,
  material = 'blackout',
}: CurtainCommonProps) => {
  const curtain = useMemo(
    () =>
      new Curtain3D({
        trackLength: Math.max(0.4, width),
        height: Math.max(0.4, height),
        material,
        // openPct: 0=关，100=开； Curtain3D openness: 0=关、1=开 —— 一对一映射
        openness: openPct / 100,
        breathing: true,
      }),
    // 类内 setter 处理 width/openness/material 变更，不重建实例
    // height 走 setHeight；material 走 setMaterial
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => { curtain.setTrackLength(Math.max(0.4, width)) }, [width, curtain])
  useEffect(() => { curtain.setHeight(Math.max(0.4, height)) }, [height, curtain])
  useEffect(() => { curtain.setOpenness(openPct / 100) }, [openPct, curtain])
  useEffect(() => { curtain.setMaterial(material) }, [material, curtain])

  useEffect(() => () => curtain.dispose(), [curtain])

  useFrame((_, dt) => curtain.update(dt))

  // 上抬量：让 Curtain3D 的 panel 顶部对齐到窗户顶部（窗户高度 / 2 + 盒子高度）
  // 这样 pelmet 在窗户上方、面板正好覆盖窗户高度
  const yLift = height / 2 + PELMET_HEIGHT

  return (
    <group position={[0, yLift, layerZ]}>
      <primitive object={curtain.object3D} />
    </group>
  )
}

/**
 * 双层对开帘（遮光 + 纱帘）—— 单实例 Curtain3D 'both' 模式：
 *   - 一个 pelmet 盒；含纱帘时按褶皱包络调整盒深和双轨间距
 *   - 双轨：blackout 在 +Z，sheer 在 -Z，保留现有层顺序
 *   - 两层独立开合度
 *
 * 比"两个独立 SideOpenCurtain 叠加"更接近真实施工（共享盒、施工尺寸正确）。
 */
export interface SideOpenCurtainBothProps {
  width: number
  height: number
  /** 整体 z 偏移 —— 双层之间的 z 差由 Curtain3D 内部处理 */
  layerZ: number
  /** Existing linked window's interior wall face, relative to window centre. */
  wallSurfaceZ?: number
  /** 遮光层 0-100 */
  openPctBlackout: number
  /** 纱帘层 0-100 */
  openPctSheer: number
}

/** Approved sheer uses the existing state props; blackout-only stays on its legacy path. */
export const SideOpenCurtain = (props: CurtainCommonProps) =>
  props.material === 'sheer' ? (
    <SheerSideOpenAdapter {...props} openPctSheer={props.openPct} dual={false} />
  ) : <LegacyBlackoutCurtain {...props} />

export const SideOpenCurtainBoth = (props: SideOpenCurtainBothProps) => (
  <SheerSideOpenAdapter {...props} openPct={props.openPctBlackout} dual />
)

function SheerSideOpenAdapter({
  width, height, layerZ, wallSurfaceZ = 0, openPct, openPctSheer, dual,
}: CurtainCommonProps & { openPctSheer: number; dual: boolean }) {
  const { gl } = useThree()
  const mount = useRef<THREE.Group>(null)
  const model = useRef<{ housing: Curtain3D; sheer: SheerCurtain } | null>(null)
  const targets = useRef({ openPct, openPctSheer })
  targets.current.openPct = openPct
  targets.current.openPctSheer = openPctSheer

  useEffect(() => {
    const parent = mount.current!
    const dimensions = sheerHousingDimensions(width)
    const housing = new Curtain3D({
      trackLength: Math.max(0.4, width), height: Math.max(0.4, height),
      material: dual ? 'both' : 'sheer', externalSheer: true,
      openness: targets.current.openPct / 100, breathing: true,
      boxDepthSingle: dimensions.singleDepth, boxDepthDual: dimensions.dualDepth,
      dualRailZ: dimensions.railZ,
    })
    const context = gl.getContext()
    const samples = context.getParameter(context.SAMPLES) as number
    const sheer = new SheerCurtain(width, height, targets.current.openPctSheer / 100, samples)
    sheer.group.position.set(0, -housing.opts.boxHeight + 0.012, dual ? -dimensions.railZ : 0)
    // Keep the deeper pelmet and folds in front of the linked wall/window.
    housing.group.position.z = wallSurfaceZ + housing.getBoxDepth() / 2 + 0.012
    housing.group.add(sheer.group)
    parent.add(housing.group)
    model.current = { housing, sheer }
    return () => {
      model.current = null
      parent.remove(housing.group)
      sheer.dispose()
      housing.dispose()
    }
  }, [width, height, wallSurfaceZ, dual, gl])

  useEffect(() => {
    if (dual) model.current?.housing.setOpenness(openPct / 100)
  }, [openPct, dual])
  useEffect(() => { model.current?.sheer.setTarget(openPctSheer / 100) }, [openPctSheer])

  useFrame((_, dt) => {
    const current = model.current
    if (!current) return
    current.sheer.update(dt)
    // Preserve the legacy blackout motion, but suspend both layers under hidden floors.
    let ancestor: THREE.Object3D | null = mount.current
    while (ancestor) {
      if (!ancestor.visible) return
      ancestor = ancestor.parent
    }
    current.housing.update(dt)
  })
  return <group ref={mount} position={[0, height / 2 + PELMET_HEIGHT, layerZ]} />
}
