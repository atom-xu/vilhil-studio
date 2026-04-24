'use client'

import { type DeviceNode, useScene, type WallNode, type WindowNode } from '@pascal-app/core'
import { useMemo } from 'react'
import { RollerCurtain } from './roller'
import { RomanShade } from './roman'
import { SideOpenCurtain } from './side-open'
import { VenetianBlind } from './venetian'
import { computeWindowWorldGeometry } from './window-geometry'

type CurtainType = 'side-open' | 'roller' | 'venetian' | 'roman'
type LayerMaterial = 'blackout' | 'sheer'

interface CurtainLayer {
  material: LayerMaterial
  position?: number      // 本层开合度 0-100（若缺失，fallback 到 state.position）
}

/** 把 renderType 映射到 CurtainType */
function renderTypeToCurtainType(renderType: string): CurtainType {
  if (renderType === 'curtain-roller') return 'roller'
  if (renderType === 'curtain-venetian') return 'venetian'
  if (renderType === 'curtain-roman') return 'roman'
  return 'side-open'    // 默认（兼容旧 'track'、'curtain-side-open'）
}

/**
 * 窗帘容器 —— 统一渲染入口
 *   1. 关联窗户：读 node.params.openingId → window + wall → 计算世界几何
 *   2. 对齐墙面：group rotation.y 使局部 +X 对齐 wallDir
 *   3. 多层渲染：按 params.layers 数组逐层挂 curtain panel，层间 z 偏 3cm
 *   4. 类型分发：按 renderType 选 SideOpen / Roller / Venetian / Roman
 */
export const CurtainContainer = ({ node }: { node: DeviceNode }) => {
  const openingId = (node.params?.openingId as string | undefined) ?? undefined

  // 读关联的 window / wall（没 openingId 则为 undefined）
  const windowNode = useScene((s) => {
    if (!openingId) return undefined
    const n = (s.nodes as Record<string, unknown>)[openingId] as { type?: string } | undefined
    return n?.type === 'window' ? (n as WindowNode) : undefined
  })
  const wallNode = useScene((s) => {
    if (!windowNode?.wallId) return undefined
    const n = (s.nodes as Record<string, unknown>)[windowNode.wallId] as { type?: string } | undefined
    return n?.type === 'wall' ? (n as WallNode) : undefined
  })

  // 运行时状态 —— 每层开合度
  const deviceState = useScene((s) => {
    const dn = s.nodes[node.id] as DeviceNode | undefined
    return dn?.state as Record<string, unknown> | undefined
  })

  // 参数解析
  const renderType = node.renderType ?? 'curtain-side-open'
  const curtainType = renderTypeToCurtainType(renderType)
  const layers: CurtainLayer[] = useMemo(() => {
    const raw = node.params?.layers as CurtainLayer[] | undefined
    if (Array.isArray(raw) && raw.length > 0) return raw
    return [{ material: 'blackout' }]
  }, [node.params])

  // 旧版 state.position 兼容：作为层 0 的 position fallback
  const legacyPosition = (deviceState?.position as number | undefined) ?? 50
  const layerPositions = useMemo(() => {
    const arr = deviceState?.layerPositions as number[] | undefined
    return Array.isArray(arr) ? arr : []
  }, [deviceState?.layerPositions])

  const slatAngleDeg = (deviceState?.slatAngleDeg as number | undefined) ?? 0

  // 世界几何计算
  const geom = useMemo(() => {
    if (!windowNode || !wallNode) return null
    return computeWindowWorldGeometry(windowNode, wallNode)
  }, [windowNode, wallNode])

  // 若未关联窗户，走 fallback：用 device 的 position + 默认尺寸
  const posWorld: [number, number, number] = geom?.center ?? node.position
  const width = geom?.width ?? 2.4
  const height = geom?.height ?? 2.2
  const rotY = geom
    ? -Math.atan2(geom.wallDir[2], geom.wallDir[0])
    : (node.rotation?.[1] ?? 0)

  // 百叶窗装窗内 → z 从 wallThickness/2 往内数；其他类型装窗外 → z 正偏移
  const isVenetian = curtainType === 'venetian'
  const baseZ = isVenetian ? -(geom?.wallThickness ?? 0.2) * 0.4 : 0

  return (
    <group position={posWorld} rotation={[0, rotY, 0]}>
      <group position={[0, 0, baseZ]}>
        {layers.map((layer, i) => {
          const layerPos = layerPositions[i] ?? (i === 0 ? legacyPosition : 50)
          // 外层（i=0）在最远处 z=0.07，每加一层 z 向窗户靠近 0.03m
          // 百叶窗只允许单层（忽略多层），层 0 z=0
          const layerZ = isVenetian ? 0 : (0.07 - i * 0.03)
          const key = `layer-${i}`
          if (curtainType === 'roller') {
            return <RollerCurtain key={key} width={width} height={height} layerZ={layerZ} openPct={layerPos} material={layer.material} />
          }
          if (curtainType === 'venetian') {
            return <VenetianBlind key={key} width={width} height={height} layerZ={layerZ} openPct={layerPos} slatAngleDeg={slatAngleDeg} material={layer.material} />
          }
          if (curtainType === 'roman') {
            return <RomanShade key={key} width={width} height={height} layerZ={layerZ} openPct={layerPos} material={layer.material} />
          }
          return <SideOpenCurtain key={key} width={width} height={height} layerZ={layerZ} openPct={layerPos} material={layer.material} />
        })}

        {/* 顶部轨道杆（仅非百叶类型：对开 / 卷 / 罗马） */}
        {!isVenetian && (
          <mesh position={[0, height / 2 + 0.04, 0.10]}>
            <boxGeometry args={[width + 0.22, 0.04, 0.04]} />
            <meshStandardMaterial color="#7a7570" roughness={0.5} metalness={0.6} />
          </mesh>
        )}
      </group>
    </group>
  )
}
