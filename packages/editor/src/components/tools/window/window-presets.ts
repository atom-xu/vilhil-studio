/**
 * 窗型预设 — 决定默认尺寸 + 窗台高度
 * sillHeight = 窗台离地高度（米），决定窗的 Y 中心位置
 */

export type WindowPresetId = 'standard' | 'wide' | 'floor_ceiling' | 'high'

export interface WindowPreset {
  id: WindowPresetId
  label: string
  /** 默认宽度（米）— 拖拽时可覆盖 */
  width: number
  /** 默认高度（米） */
  height: number
  /** 窗台高度（米）— 窗底距地面距离 */
  sillHeight: number
}

export const WINDOW_PRESETS: WindowPreset[] = [
  {
    id: 'standard',
    label: '普通窗',
    width: 1.2,
    height: 1.2,
    sillHeight: 0.9,
  },
  {
    id: 'wide',
    label: '横窗',
    width: 1.8,
    height: 1.0,
    sillHeight: 0.9,
  },
  {
    id: 'floor_ceiling',
    label: '落地窗',
    width: 1.8,
    height: 2.4,
    sillHeight: 0.0,
  },
  {
    id: 'high',
    label: '高窗',
    width: 0.9,
    height: 0.6,
    sillHeight: 1.8,
  },
]

export const DEFAULT_WINDOW_PRESET_ID: WindowPresetId = 'standard'

export function getWindowPreset(id: string): WindowPreset {
  return WINDOW_PRESETS.find((p) => p.id === id) ?? WINDOW_PRESETS[0]!
}
