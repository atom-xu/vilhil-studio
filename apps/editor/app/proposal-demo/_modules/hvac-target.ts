import type { DeviceNode } from '@pascal-app/core'
import { Euler, Vector3 } from 'three'

/** Match the model's +Z outlet and the existing DeviceRenderer rotation. */
export function hvacViewTarget(node: DeviceNode) {
  const forward = new Vector3(0, 0, 1).applyEuler(new Euler(...node.rotation))
  return {
    id: node.id,
    position: node.position,
    hvac: { forward: forward.toArray() as [number, number, number], ceiling: node.renderType === 'vent-4way' },
  }
}
