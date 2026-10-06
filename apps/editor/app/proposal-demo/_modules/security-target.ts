import type { DeviceNode } from '@pascal-app/core'
import { securityCameraRotation } from '@vilhil/smarthome/camera'
import { Euler, Vector3 } from 'three'

export function securityViewTarget(node: DeviceNode) {
  const ceiling = node.renderType === 'dome'
  const forward = new Vector3(...(ceiling ? [0, -1, 0] as const : [1, 0, 0] as const))
    .applyEuler(new Euler(...securityCameraRotation(node)))
  return { id: node.id, position: node.position, security: { forward: forward.toArray() as [number, number, number], ceiling } }
}
