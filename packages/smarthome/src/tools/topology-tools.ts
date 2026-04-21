export type TopologyProtocol = 'knx' | 'zigbee' | 'zwave' | 'wifi' | 'bluetooth' | 'matter' | 'unknown'
export type TopologyStrategy = 'balanced' | 'first-fit' | 'same-floor-first'

export type TopologyDeviceInput = {
  id: string
  name: string
  brand?: string
  subsystem?: string
  levelId?: string | null
  protocol?: string | null
  renderType?: string | null
  mountType?: string | null
}

export type TopologyControllerSpec = {
  deviceId: string
  protocol: TopologyProtocol
  maxChildren: number
  strategy: TopologyStrategy
}

export type TopologyAssignment = {
  childId: string
  parentId: string
  slotIndex: number
  assignedAt: number
  reason: 'auto' | 'manual-lock'
}

export type TopologyControllerState = TopologyControllerSpec & {
  name: string
  levelId: string | null
  usedChildren: number
  availableChildren: number
  childIds: string[]
}

export type TopologyBuildResult = {
  generatedAt: number
  controllers: TopologyControllerState[]
  assignments: TopologyAssignment[]
  unassigned: string[]
}

function normalizeProtocol(value: string | null | undefined): TopologyProtocol {
  const protocol = `${value ?? ''}`.toLowerCase()
  if (protocol === 'knx') return 'knx'
  if (protocol === 'zigbee') return 'zigbee'
  if (protocol === 'zwave') return 'zwave'
  if (protocol === 'wifi') return 'wifi'
  if (protocol === 'bluetooth') return 'bluetooth'
  if (protocol === 'matter') return 'matter'
  return 'unknown'
}

function isController(device: TopologyDeviceInput): boolean {
  const subsystem = `${device.subsystem ?? ''}`.toLowerCase()
  if (subsystem === 'architecture' || subsystem === 'network') return true

  const keyword = `${device.renderType ?? ''} ${device.name ?? ''}`.toLowerCase()
  return ['gateway', 'host', 'router', 'ap', 'hub', 'controller'].some((k) => keyword.includes(k))
}

function inferControllerProtocol(device: TopologyDeviceInput): TopologyProtocol {
  const protocol = normalizeProtocol(device.protocol)
  if (protocol !== 'unknown') return protocol
  const subsystem = `${device.subsystem ?? ''}`.toLowerCase()
  if (subsystem === 'architecture') return 'knx'
  if (subsystem === 'network') return 'wifi'
  return 'unknown'
}

function inferMaxChildren(device: TopologyDeviceInput): number {
  const keyword = `${device.renderType ?? ''} ${device.name ?? ''}`.toLowerCase()
  if (keyword.includes('gateway') || keyword.includes('host') || keyword.includes('hub')) return 32
  if (keyword.includes('router')) return 64
  if (keyword.includes('ap')) return 64
  return 32
}

function canAttach(controllerProtocol: TopologyProtocol, childProtocol: TopologyProtocol): boolean {
  if (controllerProtocol === 'unknown' || childProtocol === 'unknown') return true
  if (controllerProtocol === childProtocol) return true
  if (controllerProtocol === 'matter') return childProtocol === 'wifi' || childProtocol === 'bluetooth' || childProtocol === 'matter'
  if (controllerProtocol === 'wifi') return childProtocol === 'wifi' || childProtocol === 'matter' || childProtocol === 'bluetooth'
  if (controllerProtocol === 'knx') return childProtocol === 'knx'
  if (controllerProtocol === 'zigbee') return childProtocol === 'zigbee' || childProtocol === 'matter'
  return false
}

function rankControllers(
  child: TopologyDeviceInput,
  controllers: TopologyControllerState[],
  usage: Map<string, number>,
  strategy: TopologyStrategy,
): TopologyControllerState[] {
  const childLevelId = child.levelId ?? null
  const childProtocol = normalizeProtocol(child.protocol)

  const candidates = controllers.filter((controller) => {
    const used = usage.get(controller.deviceId) ?? 0
    if (used >= controller.maxChildren) return false
    return canAttach(controller.protocol, childProtocol)
  })

  return candidates.sort((a, b) => {
    const usedA = usage.get(a.deviceId) ?? 0
    const usedB = usage.get(b.deviceId) ?? 0
    const loadA = usedA / Math.max(1, a.maxChildren)
    const loadB = usedB / Math.max(1, b.maxChildren)
    const sameLevelA = a.levelId === childLevelId ? 0 : 1
    const sameLevelB = b.levelId === childLevelId ? 0 : 1

    if (strategy === 'same-floor-first') {
      if (sameLevelA !== sameLevelB) return sameLevelA - sameLevelB
      if (loadA !== loadB) return loadA - loadB
      return a.deviceId.localeCompare(b.deviceId)
    }

    if (strategy === 'balanced') {
      if (loadA !== loadB) return loadA - loadB
      if (sameLevelA !== sameLevelB) return sameLevelA - sameLevelB
      return a.deviceId.localeCompare(b.deviceId)
    }

    // first-fit
    if (sameLevelA !== sameLevelB) return sameLevelA - sameLevelB
    return a.deviceId.localeCompare(b.deviceId)
  })
}

export function buildTopology(
  devices: TopologyDeviceInput[],
  options?: {
    levelId?: string | null
    strategy?: TopologyStrategy
  },
): TopologyBuildResult {
  const now = Date.now()
  const levelId = options?.levelId ?? null
  const strategy = options?.strategy ?? 'same-floor-first'

  const scopedDevices = levelId
    ? devices.filter((device) => (device.levelId ?? null) === levelId)
    : devices

  const controllers: TopologyControllerState[] = scopedDevices
    .filter((device) => isController(device))
    .map((device) => ({
      deviceId: device.id,
      name: device.name,
      levelId: device.levelId ?? null,
      protocol: inferControllerProtocol(device),
      maxChildren: inferMaxChildren(device),
      strategy,
      usedChildren: 0,
      availableChildren: inferMaxChildren(device),
      childIds: [],
    }))

  const children = scopedDevices.filter((device) => !isController(device))
  const usage = new Map<string, number>()
  const assignments: TopologyAssignment[] = []
  const unassigned: string[] = []

  for (const child of children) {
    const ranked = rankControllers(child, controllers, usage, strategy)
    const chosen = ranked[0]
    if (!chosen) {
      unassigned.push(child.id)
      continue
    }

    const used = usage.get(chosen.deviceId) ?? 0
    const slotIndex = used + 1
    usage.set(chosen.deviceId, slotIndex)
    chosen.childIds.push(child.id)

    assignments.push({
      childId: child.id,
      parentId: chosen.deviceId,
      slotIndex,
      assignedAt: now,
      reason: 'auto',
    })
  }

  for (const controller of controllers) {
    const used = usage.get(controller.deviceId) ?? 0
    controller.usedChildren = used
    controller.availableChildren = Math.max(0, controller.maxChildren - used)
  }

  return {
    generatedAt: now,
    controllers,
    assignments,
    unassigned,
  }
}

