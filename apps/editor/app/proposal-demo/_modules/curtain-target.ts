import type { DeviceNode, WallNode, WindowNode } from '@pascal-app/core'

/** Same level-space anchor and facing used by CurtainContainer; no stored state. */
export function curtainViewTarget(node: DeviceNode, nodes: Record<string, unknown>) {
  const opening = nodes[node.params?.openingId as string] as WindowNode | undefined
  const window = opening?.type === 'window' ? opening : undefined
  const candidateWall = nodes[(window?.wallId ?? node.params?.wallId) as string] as
    | WallNode
    | undefined
  const wall = candidateWall?.type === 'wall' ? candidateWall : undefined
  let position: [number, number, number] = [...node.position]
  const direction = node.params?.direction as number | undefined
  const yaw = direction === undefined ? node.rotation[1] : (-direction * Math.PI) / 180
  let normal: [number, number] = [Math.sin(yaw), Math.cos(yaw)]
  if (wall) {
    const dx = wall.end[0] - wall.start[0],
      dz = wall.end[1] - wall.start[1]
    const length = Math.hypot(dx, dz)
    if (length > 0.001) {
      normal = [-dz / length, dx / length]
      if (window)
        position = [
          wall.start[0] + (dx / length) * window.position[0],
          window.position[1],
          wall.start[1] + (dz / length) * window.position[0],
        ]
    }
  }
  return {
    id: node.id,
    position,
    curtain: {
      width: window?.width ?? (node.params?.curtainWidth as number | undefined) ?? 2.4,
      height: window?.height ?? 2.2,
      normal,
    },
  }
}
