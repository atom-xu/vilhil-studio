import { expect, test } from 'bun:test'
import type { DeviceNode } from '@pascal-app/core'
import { hvacViewTarget } from '../apps/editor/app/proposal-demo/_modules/hvac-target'
import { resolveDeviceDetailPose, type PoseInput } from '../apps/editor/app/proposal-demo/_modules/camera'

test('HVAC detail frames the +Z outlet after the device yaw, without targeting another floor', () => {
  const node = { id: 'device_ac', renderType: 'ac-wall', position: [5.8, 2.4, 3], rotation: [0, -Math.PI / 2, 0] } as DeviceNode
  const target = hvacViewTarget(node)
  expect(target.hvac.forward[0]).toBeCloseTo(-1)
  expect(target.hvac.forward[2]).toBeCloseTo(0)
  const input: PoseInput = { bboxCx: 3, bboxCz: 3, bboxSpan: 8, rooms: [], devices: [target] }
  const pose = resolveDeviceDetailPose(input, node.id)!
  expect(pose.tgt[0]).toBeCloseTo(4.5)
  expect(pose.pos[0]).toBeCloseTo(1.3)
  expect(pose.pos[1]).toBeLessThan(3.2)
  expect(resolveDeviceDetailPose({ ...input, devices: [] }, node.id)).toBeNull()
})

test('ceiling HVAC detail includes the vertical airflow below the vent', () => {
  const target = hvacViewTarget({ id: 'device_vent', renderType: 'vent-4way', position: [2, 2.8, 2], rotation: [0, 0, 0] } as DeviceNode)
  const pose = resolveDeviceDetailPose({ bboxCx: 3, bboxCz: 3, bboxSpan: 8, rooms: [], devices: [target] }, target.id)!
  expect(pose.tgt).toEqual([2, 1.4, 2])
  expect(pose.pos).toEqual([4.8, 2.2, 4.8])
})
