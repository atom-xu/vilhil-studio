import { expect, test } from 'bun:test'
import type { DeviceNode } from '@pascal-app/core'
import { isSecurityCamera, securityCameraRotation } from '../packages/smarthome/src/renderers/camera'
import { securityViewTarget } from '../apps/editor/app/proposal-demo/_modules/security-target'
import { resolveDeviceDetailPose, type PoseInput } from '../apps/editor/app/proposal-demo/_modules/camera'

test('camera placement yaw is absolute; imported Euler pitch/roll survive and missing direction falls back', () => {
  const node = { params: { direction: 90 }, rotation: [0.2, Math.PI / 2, 0.1] } as DeviceNode
  expect(securityCameraRotation(node)).toEqual([0.2, Math.PI / 2, 0.1])
  expect(securityCameraRotation({ ...node, params: {} })).toEqual(node.rotation)
  expect(securityCameraRotation({ ...node, params: { direction: Number.NaN } })).toEqual(node.rotation)
  expect(isSecurityCamera({ subsystem: 'security', renderType: 'door-lock' })).toBe(false)
})

test('rotated bullet camera detail frames the actual +X lens, with floor-scoped target lookup', () => {
  const node = { id: 'device_camera', subsystem: 'security', renderType: 'camera-bullet', params: { direction: 90 }, position: [3, 2.4, 5.6], rotation: [0, 0, 0] } as DeviceNode
  const target = securityViewTarget(node)
  expect(isSecurityCamera(node)).toBe(true)
  expect(target.security.forward[0]).toBeCloseTo(0)
  expect(target.security.forward[2]).toBeCloseTo(-1)
  const input: PoseInput = { bboxCx: 3, bboxCz: 3, bboxSpan: 8, rooms: [], devices: [target] }
  expect(resolveDeviceDetailPose(input, node.id)!.tgt[2]).toBeCloseTo(4.8)
  expect(resolveDeviceDetailPose(input, node.id)!.pos[2]).toBeCloseTo(2.2)
  expect(resolveDeviceDetailPose({ ...input, devices: [] }, node.id)).toBeNull()
})

test('ceiling camera detail looks at coverage below the mounting point', () => {
  const node = { id: 'device_dome', renderType: 'dome', params: {}, position: [3, 2.7, 3], rotation: [0, 0, 0] } as DeviceNode
  const target = securityViewTarget(node)
  expect(target.security.forward).toEqual([0, -1, 0])
  const pose = resolveDeviceDetailPose({ bboxCx: 3, bboxCz: 3, bboxSpan: 8, rooms: [], devices: [target] }, node.id)!
  expect(pose.tgt[1]).toBeCloseTo(1.9)
  expect(pose.pos[1]).toBeLessThan(node.position[1])
})
