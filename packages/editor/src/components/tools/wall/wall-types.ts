/**
 * 墙体种类预设 — 合并墙厚、对齐模式、颜色
 *
 * 描摹底图时，选一次墙种类就够了，不用分别设置三个参数。
 * 每种墙的颜色不同，在 2D 视图里一眼辨认。
 */

export type WallType = 'exterior' | 'load-bearing' | 'interior' | 'partition' | 'light'
export type WallJustification = 'center' | 'outer' | 'inner'

export interface WallTypeDefinition {
  id: WallType
  label: string
  shortLabel: string
  thickness: number
  justification: WallJustification
  /** 16 进制颜色，在 2D floorplan 中显示 */
  color: string
  description: string
}

export const WALL_TYPES: WallTypeDefinition[] = [
  {
    id: 'exterior',
    label: '外墙',
    shortLabel: '外',
    thickness: 0.24,
    justification: 'outer',
    color: '#3b82f6', // blue-500
    description: '建筑外墙 240mm，描摹外轮廓',
  },
  {
    id: 'load-bearing',
    label: '承重墙',
    shortLabel: '承',
    thickness: 0.20,
    justification: 'outer',
    color: '#ef4444', // red-500
    description: '结构承重墙 200mm',
  },
  {
    id: 'interior',
    label: '内墙',
    shortLabel: '内',
    thickness: 0.12,
    justification: 'center',
    color: '#94a3b8', // slate-400
    description: '分户内墙 120mm',
  },
  {
    id: 'partition',
    label: '隔墙',
    shortLabel: '隔',
    thickness: 0.10,
    justification: 'center',
    color: '#cbd5e1', // slate-300
    description: '房间隔断 100mm',
  },
  {
    id: 'light',
    label: '轻质',
    shortLabel: '轻',
    thickness: 0.08,
    justification: 'center',
    color: '#e2e8f0', // slate-200
    description: '轻质隔断 80mm',
  },
]

export const WALL_TYPE_BY_ID: Record<WallType, WallTypeDefinition> =
  WALL_TYPES.reduce((acc, t) => {
    acc[t.id] = t
    return acc
  }, {} as Record<WallType, WallTypeDefinition>)

export const DEFAULT_WALL_TYPE: WallType = 'interior'
