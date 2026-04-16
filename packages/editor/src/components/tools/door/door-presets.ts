/**
 * 门型预设 — 决定默认尺寸 + 开启方式
 * 工具激活时读取，创建节点时作为初始参数
 */

export type DoorPresetId = 'interior' | 'exterior' | 'double' | 'sliding'

export interface DoorPreset {
  id: DoorPresetId
  label: string
  /** 默认宽度（米） */
  width: number
  /** 默认高度（米） */
  height: number
  hingesSide: 'left' | 'right'
  swingDirection: 'inward' | 'outward'
}

export const DOOR_PRESETS: DoorPreset[] = [
  {
    id: 'interior',
    label: '内门',
    width: 0.9,
    height: 2.1,
    hingesSide: 'left',
    swingDirection: 'inward',
  },
  {
    id: 'exterior',
    label: '外门',
    width: 1.0,
    height: 2.2,
    hingesSide: 'left',
    swingDirection: 'inward',
  },
  {
    id: 'double',
    label: '双开',
    width: 1.6,
    height: 2.1,
    hingesSide: 'left',
    swingDirection: 'inward',
  },
  {
    id: 'sliding',
    label: '推拉',
    width: 1.8,
    height: 2.1,
    hingesSide: 'left',
    swingDirection: 'inward',
  },
]

export const DEFAULT_DOOR_PRESET_ID: DoorPresetId = 'interior'

export function getDoorPreset(id: string): DoorPreset {
  return DOOR_PRESETS.find((p) => p.id === id) ?? DOOR_PRESETS[0]!
}
