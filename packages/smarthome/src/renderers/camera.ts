import type { DeviceNode } from '@pascal-app/core'

export function isSecurityCamera(node: Pick<DeviceNode, 'subsystem' | 'renderType'>): boolean {
  return node.subsystem === 'security' && (node.renderType === 'dome' || node.renderType === 'camera-bullet')
}

/** The placement tool stores absolute yaw in params.direction (degrees).
 * Older/imported nodes without it retain their Euler rotation. Never add both.
 */
export function securityCameraRotation(node: Pick<DeviceNode, 'params' | 'rotation'>): [number, number, number] {
  const direction = node.params.direction
  return [node.rotation[0], typeof direction === 'number' && Number.isFinite(direction) ? direction * Math.PI / 180 : node.rotation[1], node.rotation[2]]
}
