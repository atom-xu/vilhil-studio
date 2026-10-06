import { expect, test } from 'bun:test'
import type { DeviceNode } from '@pascal-app/core'
import { curtainViewTarget } from '../apps/editor/app/proposal-demo/_modules/curtain-target'
import { resolveDeviceDetailPose, type PoseInput } from '../apps/editor/app/proposal-demo/_modules/camera'

const curtain = {
  id: 'device_curtain', position: [99, 2.5, 99], rotation: [0, .7, 0],
  params: { openingId: 'window_test' },
} as unknown as DeviceNode
const nodes = {
  window_test: { id: 'window_test', type: 'window', wallId: 'wall_test', position: [3, 1.52, 0], width: 3.84, height: 2.62 },
  wall_test: { id: 'wall_test', type: 'wall', start: [6, 0], end: [6, 6] },
}

test('curtain focus follows the linked opening instead of the stored device offset and yaw', () => {
  const target = curtainViewTarget(curtain, nodes)
  expect(target.position).toEqual([6, 1.52, 3])
  expect(target.curtain.normal).toEqual([-1, 0])
  const input: PoseInput = { bboxCx: 3, bboxCz: 3, bboxSpan: 8, rooms: [], devices: [target] }
  const pose = resolveDeviceDetailPose(input, curtain.id, [12, 10, -10])!
  expect(pose.tgt).toEqual(target.position)
  expect(pose.pos[0]).toBeLessThan(6)
  expect(pose.pos[2]).toBe(3)
  expect(6 - pose.pos[0]).toBeGreaterThan(4)
  // A target from another floor is absent from that floor's input.
  expect(resolveDeviceDetailPose({ ...input, devices: [] }, curtain.id)).toBeNull()
})

test('unbound and directly wall-bound curtain targets keep existing placement semantics', () => {
  const unbound = { ...curtain, position: [4, 1.5, 2], rotation: [0, Math.PI / 2, 0], params: { curtainWidth: 6 } } as DeviceNode
  const a = curtainViewTarget(unbound, {})
  expect(a.position).toEqual([4, 1.5, 2])
  expect(a.curtain.width).toBe(6)
  expect(a.curtain.normal[0]).toBeCloseTo(1)
  const b = curtainViewTarget({ ...unbound, params: { wallId: 'wall_test', curtainWidth: 6 } }, nodes)
  expect(b.position).toEqual(unbound.position)
  expect(b.curtain.normal).toEqual([-1, 0])
})

test('ordinary device camera retains the existing bearing and distance calculation', () => {
  const input: PoseInput = { bboxCx: 3, bboxCz: 3, bboxSpan: 8, rooms: [], devices: [{ id: 'light', position: [3, 2.8, 3] }] }
  expect(resolveDeviceDetailPose(input, 'light', [3, 4, 0])).toEqual({
    pos: [3, 3.8499999999999996, 1.3], tgt: [3, 2.92, 3],
  })
})
