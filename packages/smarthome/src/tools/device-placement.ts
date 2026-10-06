import { DeviceNode, useScene, type AnyNode } from '@pascal-app/core'
import { getDeviceDefinition } from '../device-catalog'

type Point = [number, number, number]
export interface PlacementResult { valid: boolean; reason?: 'occupied' | 'invalid'; conflictingId?: string }

/** Catalog-sized oriented boxes, with exact contact allowed and no invented clearance. */
export function deviceBoxesOverlap(a: Point, aSize: Point, aYaw: number, b: Point, bSize: Point, bYaw: number): boolean {
  const epsilon = 1e-6 // numerical tolerance only
  if (Math.abs(a[1] - b[1]) >= (aSize[1] + bSize[1]) / 2 - epsilon) return false
  const ax = [Math.cos(aYaw), -Math.sin(aYaw)]
  const az = [Math.sin(aYaw), Math.cos(aYaw)]
  const bx = [Math.cos(bYaw), -Math.sin(bYaw)]
  const bz = [Math.sin(bYaw), Math.cos(bYaw)]
  const delta = [b[0] - a[0], b[2] - a[2]]
  const dot = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]!
  for (const axis of [ax, az, bx, bz]) {
    const radiusA = Math.abs(dot(ax, axis)) * aSize[0] / 2 + Math.abs(dot(az, axis)) * aSize[2] / 2
    const radiusB = Math.abs(dot(bx, axis)) * bSize[0] / 2 + Math.abs(dot(bz, axis)) * bSize[2] / 2
    if (Math.abs(dot(delta, axis)) >= radiusA + radiusB - epsilon) return false
  }
  return true
}

/** Device-to-device only: walls/ceilings are mounting hosts, not obstacles. */
export function checkDevicePlacement(
  levelId: string, catalogId: string, position: Point, direction = 0,
  nodes: Record<string, AnyNode | undefined> = useScene.getState().nodes,
  ignoreDeviceId?: string,
): PlacementResult {
  const def = getDeviceDefinition(catalogId)
  if (!def || position.length !== 3 || !position.every(Number.isFinite) || !Number.isFinite(direction)) return { valid: false, reason: 'invalid' }
  const storedPosition = DeviceNode.shape.position.parse(position)
  // Paths and parameterized multilayer curtains need their own geometry/rules.
  // A catalog box would falsely reject shared paths or legal 3cm curtain layers.
  if (def.lightType === 'line' || def.subsystem === 'curtain') return { valid: true }
  const inLevel = (node: AnyNode): boolean => {
    let parent = node.parentId as string | null
    const seen = new Set<string>()
    while (parent && !seen.has(parent)) {
      if (parent === levelId) return true
      seen.add(parent)
      parent = nodes[parent]?.parentId as string | null
    }
    return false
  }
  for (const node of Object.values(nodes)) {
    if (!node || node.id === ignoreDeviceId || node.type !== 'device' || !inLevel(node)) continue
    const other = getDeviceDefinition(node.productId ?? '')
    if (!other || other.lightType === 'line' || other.subsystem === 'curtain') continue
    const yaw = typeof node.params.direction === 'number' ? node.params.direction * Math.PI / 180 : node.rotation[1]
    if (deviceBoxesOverlap(storedPosition, def.size, direction * Math.PI / 180, node.position, other.size, yaw)) {
      return { valid: false, reason: 'occupied', conflictingId: node.id }
    }
  }
  return { valid: true }
}

export class DevicePlacementError extends Error {
  constructor(public readonly result: PlacementResult) {
    super(result.reason === 'occupied' ? '位置已被占用' : '放置位置无效')
    this.name = 'DevicePlacementError'
  }
}


/** Shared guard for edits: resolve the real floor, retain yaw, and ignore the edited node. */
export function checkDevicePlacementEdit(
  deviceId: string, changes: { position?: Point; direction?: number },
  nodes: Record<string, AnyNode | undefined> = useScene.getState().nodes,
): PlacementResult {
  const node = nodes[deviceId as DeviceNode['id']]
  if (!node || node.type !== 'device') return { valid: false, reason: 'invalid' }
  const position = changes.position ?? node.position
  const direction = changes.direction ?? (typeof node.params.direction === 'number' ? node.params.direction : node.rotation[1] * 180 / Math.PI)
  if (position.length !== 3 || !position.every(Number.isFinite) || !Number.isFinite(direction)) return { valid: false, reason: 'invalid' }
  // Imported custom geometry without a catalog footprint retains its existing behavior.
  if (!getDeviceDefinition(node.productId ?? '')) return { valid: true }
  let parent = node.parentId
  const seen = new Set<string>()
  while (parent && !seen.has(parent)) {
    seen.add(parent)
    const ancestor = nodes[parent]
    if (ancestor?.type === 'level') return checkDevicePlacement(parent, node.productId!, position, direction, nodes, deviceId)
    parent = ancestor?.parentId ?? null
  }
  return { valid: false, reason: 'invalid' }
}

/** Atomic placement edit; rejected height/yaw edits leave every field untouched. */
export function updateDevicePlacement(deviceId: string, changes: { position?: Point; direction?: number }): void {
  const { nodes, updateNode, readOnly } = useScene.getState()
  if (readOnly) return
  const result = checkDevicePlacementEdit(deviceId, changes, nodes)
  if (!result.valid) throw new DevicePlacementError(result)
  const node = nodes[deviceId as DeviceNode['id']]
  if (!node || node.type !== 'device') return
  const storedPosition = changes.position ? DeviceNode.shape.position.parse(changes.position) : undefined
  const positionChanged = storedPosition?.some((v, i) => v !== node.position[i]) ?? false
  const directionChanged = changes.direction !== undefined && changes.direction !== (typeof node.params.direction === 'number' ? node.params.direction : node.rotation[1] * 180 / Math.PI)
  if (!positionChanged && !directionChanged) return
  updateNode(node.id, {
    ...(storedPosition ? { position: storedPosition } : {}),
    ...(changes.direction !== undefined ? { params: { ...node.params, direction: changes.direction } } : {}),
  })
}
