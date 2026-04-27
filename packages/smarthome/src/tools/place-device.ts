/**
 * placeDevice — 在场景中放置智能设备
 *
 * 工具函数：不依赖 React 组件，可被 UI / AI / 测试脚本直接调用。
 * 内部调用 useScene.getState().createNode()，自动获得 Undo/Redo + 持久化。
 */

import { DeviceNode, generateId, useScene } from '@pascal-app/core'
import type { DeviceParams } from '@pascal-app/core'
import { getDeviceDefinition } from '../device-catalog'

/** 各 catalogId 对应的灯带发光朝向预设。
 *  画线工具放灯带时如果没显式传 emissionDirection，按这里的默认走。
 */
const STRIP_EMISSION_DEFAULTS: Record<string, 'down' | 'up' | 'wall' | 'omni'> = {
  'LIGHT-STRIP': 'omni',
  'LIGHT-STRIP-WASH-WALL': 'wall',
  'LIGHT-STRIP-COVE': 'up',
  'LIGHT-STRIP-SKIRTING': 'down',
}

export function placeDevice(
  levelId: string,
  catalogId: string,
  position: [number, number, number],
  params?: Partial<DeviceParams>,
): string {
  const def = getDeviceDefinition(catalogId)
  if (!def) {
    throw new Error(`placeDevice: 设备目录中找不到 catalogId="${catalogId}"`)
  }

  const id = generateId('device')

  // 灯带（lightType = 'line'）走画线流程：position 是 path 中点，
  // params.path 必填。如果调用方没传，写一个 zero-length 兜底。
  const isLightStrip = def.lightType === 'line'
  const stripDefaults: Partial<DeviceParams> = isLightStrip
    ? {
        emissionDirection: STRIP_EMISSION_DEFAULTS[catalogId] ?? 'omni',
      }
    : {}

  const node = DeviceNode.parse({
    id,
    parentId: levelId,
    subsystem: def.subsystem,
    renderType: def.subtype,
    mountType: def.mountType,
    position,
    productId: def.catalogId,
    productName: def.name,
    params: {
      beamAngle: 30,
      coverageRadius: def.coverageRadius,
      ...stripDefaults,
      ...params,
    },
    // 灯光设备默认开启，便于设计师立即看到效果
    state: {
      on: def.type === 'light',
      brightness: 100,
      colorTemp: 4000,
    },
    showAnimation: true,
    visible: true,
    metadata: {},
  })

  useScene.getState().createNode(node, levelId as any)
  return id
}
