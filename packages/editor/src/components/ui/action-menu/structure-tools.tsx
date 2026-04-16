'use client'

import NextImage from 'next/image'
import {
  SlabNode,
  positionKey,
  useScene,
  type LevelNode,
  type WallNode,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useRef, useState } from 'react'
import { useContextualTools } from '../../../hooks/use-contextual-tools'
import { sfxEmitter } from '../../../lib/sfx-bus'
import { cn } from '../../../lib/utils'
import useEditor, {
  type CatalogCategory,
  type StructureTool,
  type Tool,
} from '../../../store/use-editor'
import {
  cleanupCollinearDuplicates,
  cleanupWallEndpoints,
  diagnoseWallGraph,
  splitTJunctions,
} from '../../tools/wall/wall-cleanup'
import { ActionButton } from './action-button'

export type ToolConfig = {
  id: StructureTool
  iconSrc: string
  label: string
  catalogCategory?: CatalogCategory
}

export const tools: ToolConfig[] = [
  { id: 'wall', iconSrc: '/icons/wall.png', label: '墙体' },
  // { id: 'room', iconSrc: '/icons/room.png', label: 'Room' },
  // { id: 'custom-room', iconSrc: '/icons/custom-room.png', label: 'Custom Room' },
  { id: 'slab', iconSrc: '/icons/floor.png', label: '楼板' },
  { id: 'ceiling', iconSrc: '/icons/ceiling.png', label: '天花板' },
  { id: 'roof', iconSrc: '/icons/roof.png', label: '人字屋顶' },
  { id: 'stair', iconSrc: '/icons/stairs.png', label: '楼梯' },
  { id: 'door', iconSrc: '/icons/door.png', label: '门' },
  { id: 'window', iconSrc: '/icons/window.png', label: '窗' },
  { id: 'zone', iconSrc: '/icons/zone.png', label: '区域' },
]

export function StructureTools() {
  const activeTool = useEditor((state) => state.tool)
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const structureLayer = useEditor((state) => state.structureLayer)
  const setTool = useEditor((state) => state.setTool)
  const setCatalogCategory = useEditor((state) => state.setCatalogCategory)

  const contextualTools = useContextualTools()

  // Filter tools based on structureLayer
  const visibleTools =
    structureLayer === 'zones'
      ? tools.filter((t) => t.id === 'zone')
      : tools.filter((t) => t.id !== 'zone')

  const hasActiveTool = visibleTools.some(
    (t) =>
      activeTool === t.id && (t.catalogCategory ? catalogCategory === t.catalogCategory : true),
  )

  return (
    <div className="flex items-center gap-1.5 px-1">
      {visibleTools.map((tool, index) => {
        // For item tools with catalog category, check both tool and category match
        const isActive =
          activeTool === tool.id &&
          (tool.catalogCategory ? catalogCategory === tool.catalogCategory : true)

        const isContextual = contextualTools.includes(tool.id)

        return (
          <ActionButton
            className={cn(
              'rounded-lg duration-300',
              isActive
                ? 'z-10 scale-110 bg-black/40 hover:bg-black/40'
                : 'scale-95 bg-transparent opacity-60 grayscale hover:bg-black/20 hover:opacity-100 hover:grayscale-0',
            )}
            key={`${tool.id}-${tool.catalogCategory ?? index}`}
            label={tool.label}
            onClick={() => {
              if (!isActive) {
                setTool(tool.id)
                setCatalogCategory(tool.catalogCategory ?? null)

                // Automatically switch to build mode if we select a tool
                if (useEditor.getState().mode !== 'build') {
                  useEditor.getState().setMode('build')
                }
              }
            }}
            size="icon"
            variant="ghost"
          >
            <NextImage
              alt={tool.label}
              className="size-full object-contain"
              height={28}
              src={tool.iconSrc}
              width={28}
            />
          </ActionButton>
        )
      })}

      {/* 墙厚快速选择 */}
      {activeTool === 'wall' && <WallThicknessSelector />}
      {/* 墙工具 / 楼板工具 都可以访问端点清理 —— 对旧数据洗漂移 */}
      {(activeTool === 'wall' || activeTool === 'slab') && <CleanupWallsButton />}
      {/* 楼板自动生成 */}
      {activeTool === 'slab' && <AutoSlabButton />}
      {/* 门型选择 */}
      {activeTool === 'door' && <DoorPresetSelector />}
      {/* 窗型选择 */}
      {activeTool === 'window' && <WindowPresetSelector />}
    </div>
  )
}

import { WALL_TYPES, WALL_TYPE_BY_ID } from '../../tools/wall/wall-types'
import { DOOR_PRESETS } from '../../tools/door/door-presets'
import { WINDOW_PRESETS } from '../../tools/window/window-presets'

/**
 * 墙种类选择器 — 替代原来的「墙厚 + 对齐模式」两个独立选项
 *
 * 每种墙有固定的厚度 + 对齐方式 + 颜色，选一次就完整配置好
 */
function WallThicknessSelector() {
  const currentType = useEditor((s) => (s as any).wallType ?? 'interior')
  const setWallType = useEditor((s) => (s as any).setWallType)

  return (
    <>
      <div className="mx-0.5 h-6 w-px bg-white/10" />
      <div className="flex items-center gap-0.5">
        {WALL_TYPES.map((t) => {
          const isActive = currentType === t.id
          return (
            <button
              className={cn(
                'flex flex-col items-center justify-center rounded-md px-2 py-1 transition-all',
                isActive
                  ? 'bg-white/15'
                  : 'hover:bg-white/10',
              )}
              key={t.id}
              onClick={() => setWallType?.(t.id)}
              title={t.description}
              type="button"
            >
              <div className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: t.color,
                    boxShadow: isActive ? `0 0 6px ${t.color}` : 'none',
                  }}
                />
                <span
                  className={cn(
                    'text-[10px] font-medium',
                    isActive ? 'text-white' : 'text-white/60',
                  )}
                >
                  {t.label}
                </span>
              </div>
              <span
                className={cn(
                  'text-[8px] leading-none',
                  isActive ? 'text-white/80' : 'text-white/40',
                )}
              >
                {(t.thickness * 1000).toFixed(0)}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 门型选择器
// ─────────────────────────────────────────────────────────────────────────────

function DoorPresetSelector() {
  const current = useEditor((s) => s.doorPresetId)
  const setPreset = useEditor((s) => s.setDoorPresetId)

  return (
    <>
      <div className="mx-0.5 h-6 w-px bg-white/10" />
      <div className="flex items-center gap-0.5">
        {DOOR_PRESETS.map((p) => {
          const isActive = current === p.id
          return (
            <button
              className={cn(
                'flex flex-col items-center justify-center rounded-md px-2 py-1 transition-all',
                isActive ? 'bg-white/15' : 'hover:bg-white/10',
              )}
              key={p.id}
              onClick={() => setPreset(p.id)}
              title={`${p.label} — ${(p.width * 100).toFixed(0)}×${(p.height * 100).toFixed(0)} cm`}
              type="button"
            >
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isActive ? 'text-white' : 'text-white/60',
                )}
              >
                {p.label}
              </span>
              <span
                className={cn(
                  'text-[8px] leading-none',
                  isActive ? 'text-white/80' : 'text-white/40',
                )}
              >
                {(p.width * 100).toFixed(0)}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 窗型选择器
// ─────────────────────────────────────────────────────────────────────────────

function WindowPresetSelector() {
  const current = useEditor((s) => s.windowPresetId)
  const setPreset = useEditor((s) => s.setWindowPresetId)

  return (
    <>
      <div className="mx-0.5 h-6 w-px bg-white/10" />
      <div className="flex items-center gap-0.5">
        {WINDOW_PRESETS.map((p) => {
          const isActive = current === p.id
          return (
            <button
              className={cn(
                'flex flex-col items-center justify-center rounded-md px-2 py-1 transition-all',
                isActive ? 'bg-white/15' : 'hover:bg-white/10',
              )}
              key={p.id}
              onClick={() => setPreset(p.id)}
              title={`${p.label} — ${(p.width * 100).toFixed(0)}×${(p.height * 100).toFixed(0)} cm，台高 ${(p.sillHeight * 100).toFixed(0)} cm`}
              type="button"
            >
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isActive ? 'text-white' : 'text-white/60',
                )}
              >
                {p.label}
              </span>
              <span
                className={cn(
                  'text-[8px] leading-none',
                  isActive ? 'text-white/80' : 'text-white/40',
                )}
              >
                {(p.height * 100).toFixed(0)}h
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 自动楼板生成
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 沿墙体图走外轮廓（平面图外面追踪算法）
 *
 * 核心规则：到达节点 V（来自前驱 U）后，
 * 在所有从 V 出发的边中，选取从"回头方向"（V→U）
 * **逆时针旋转角度最小** 的边继续行进。
 * 这等同于平面直线图的外面（无界面）追踪，
 * 在 T/X 路口能正确跳过内墙分支，沿外轮廓行进。
 *
 * 坐标约定：X 向右，Z 向下（屏幕俯视坐标）。
 * 起点：最左、最下角（min X，次 max Z）。
 */
function computeOuterBoundary(walls: WallNode[]): Array<[number, number]> {
  type Pt = [number, number]
  // 位置 key 直接用 core 的全局 positionKey（整数 cm 网格），
  // 墙端点在 Schema 层已被量化到 1cm，这里零容差就能正确合并顶点。
  const ptKey = (p: Pt) => positionKey(p)
  const TWO_PI = 2 * Math.PI

  // ── 建邻接表 ──────────────────────────────────────────────────────────────
  const pts = new Map<string, Pt>()
  const adj = new Map<string, Pt[]>()
  for (const wall of walls) {
    const a = wall.start as Pt, b = wall.end as Pt
    const ak = ptKey(a), bk = ptKey(b)
    if (ak === bk) continue
    pts.set(ak, a); pts.set(bk, b)
    if (!adj.has(ak)) adj.set(ak, [])
    if (!adj.has(bk)) adj.set(bk, [])
    if (!adj.get(ak)!.some(p => ptKey(p) === bk)) adj.get(ak)!.push(b)
    if (!adj.get(bk)!.some(p => ptKey(p) === ak)) adj.get(bk)!.push(a)
  }
  if (pts.size < 3) return [...pts.values()]

  // ── 叶子剪枝（Leaf Pruning）── 计算 2-core，剔除所有悬挂端点及其连锁反应 ──
  // 孤立的内墙片段（承重墙、间隔墙）的端点 degree=1；
  // 若从这类端点出发，追踪会在 2 步内回到起点（boundary=[A,B]），触发凸包退化。
  // 叶子剪枝后，图里只剩有环的部分（2-core），保证追踪能绕完整圈。
  const degree = new Map<string, number>()
  for (const [k] of adj) degree.set(k, adj.get(k)!.length)
  const pruned = new Set<string>()
  let leafChanged = true
  while (leafChanged) {
    leafChanged = false
    for (const [k, d] of degree) {
      if (pruned.has(k) || d >= 2) continue
      pruned.add(k)
      leafChanged = true
      for (const nb of adj.get(k) ?? []) {
        const nbk = ptKey(nb)
        if (!pruned.has(nbk)) degree.set(nbk, (degree.get(nbk) ?? 1) - 1)
      }
    }
  }

  // ── 起点：最左、最下角（min X，次 max Z），仅选剪枝后的顶点 ───────────────
  let startKey = '', startPt: Pt = [Infinity, -Infinity]
  for (const [k, pt] of pts) {
    if (pruned.has(k)) continue
    if (pt[0] < startPt[0] || (Math.abs(pt[0] - startPt[0]) < 0.001 && pt[1] > startPt[1])) {
      startPt = pt; startKey = k
    }
  }
  // 兜底：剪枝后图为空（全是悬挂点）则退回未剪枝版本
  if (!startKey) {
    startPt = [Infinity, -Infinity]
    for (const [k, pt] of pts) {
      if (pt[0] < startPt[0] || (Math.abs(pt[0] - startPt[0]) < 0.001 && pt[1] > startPt[1])) {
        startPt = pt; startKey = k
      }
    }
  }

  // ── 追踪 ──────────────────────────────────────────────────────────────────
  // 虚拟前驱在起点正下方（+Z），θ_VU 朝 +Z（朝南）
  // 从"朝南"看，最小 CCW → 朝北（沿左外墙向上行进）
  const boundary: Pt[] = []
  let curKey = startKey, curPt = startPt
  let prevPt: Pt = [startPt[0], startPt[1] + 1]

  for (let iter = 0; iter < pts.size * 2 + 8; iter++) {
    boundary.push(curPt)
    // 追踪时只走剪枝后的边（排除悬挂分支）
    const neighbors = (adj.get(curKey) ?? []).filter(nb => !pruned.has(ptKey(nb)))
    const prevKey = ptKey(prevPt)
    const fwd = neighbors.filter(nb => ptKey(nb) !== prevKey)
    const candidates = fwd.length > 0 ? fwd : neighbors
    if (candidates.length === 0) break

    // θ_VU = 从当前点指向前驱的方向（"回头"方向）
    const thetaVU = Math.atan2(prevPt[1] - curPt[1], prevPt[0] - curPt[0])

    let bestNb = candidates[0]!, bestCCW = Infinity
    for (const nb of candidates) {
      const dx = nb[0] - curPt[0], dz = nb[1] - curPt[1]
      if (Math.hypot(dx, dz) < 0.0001) continue
      const thetaVW = Math.atan2(dz, dx)
      // 归一化到 (0, 2π]
      let ccw = ((thetaVW - thetaVU) % TWO_PI + TWO_PI) % TWO_PI
      if (ccw < 1e-9) ccw = TWO_PI
      if (ccw < bestCCW) { bestCCW = ccw; bestNb = nb }
    }

    const nextKey = ptKey(bestNb)
    if (nextKey === startKey && iter > 0) break

    prevPt = curPt; curPt = bestNb; curKey = nextKey
  }

  return boundary.length >= 3 ? boundary : computeConvexHullFallback([...pts.values()])
}

/**
 * 把墙体按连通分量拆分 —— 一层里如果有两个互不相连的房间，
 * 各自会形成独立的连通分量，`computeOuterBoundaries` 会给每个分量
 * 单独生成一个楼板。
 *
 * 使用 Union-Find（加权路径压缩）在 O(n·α(n)) 时间里完成，
 * 位置比较走 core 的 `positionKey`，零容差精确合并。
 */
function splitWallsByConnectedComponent(walls: WallNode[]): WallNode[][] {
  if (walls.length === 0) return []

  // 并查集 —— key 是 positionKey（整数 cm 字符串）
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let cur = k
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)!
      parent.set(cur, parent.get(p)!)
      cur = parent.get(cur)!
    }
    return cur
  }
  const union = (a: string, b: string) => {
    const ra = find(a),
      rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  // 初始化 + 按墙建并
  for (const w of walls) {
    const ak = positionKey(w.start as [number, number])
    const bk = positionKey(w.end as [number, number])
    if (!parent.has(ak)) parent.set(ak, ak)
    if (!parent.has(bk)) parent.set(bk, bk)
    if (ak !== bk) union(ak, bk)
  }

  // 按根分组墙
  const groups = new Map<string, WallNode[]>()
  for (const w of walls) {
    const ak = positionKey(w.start as [number, number])
    const root = find(ak)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(w)
  }

  return Array.from(groups.values())
}

/**
 * 对一组墙做多连通分量的外轮廓追踪，返回多个多边形（每个分量一个）。
 *
 * 单连通分量 → 返回长度为 1 的数组（向后兼容旧行为）
 * 多连通分量 → 每组墙各自追踪一圈，返回多个多边形
 */
function computeOuterBoundaries(walls: WallNode[]): Array<Array<[number, number]>> {
  const components = splitWallsByConnectedComponent(walls)
  const polys: Array<Array<[number, number]>> = []
  for (const group of components) {
    const poly = computeOuterBoundary(group)
    if (poly.length >= 3) polys.push(poly)
  }
  return polys
}

/** 凸包降级（仅在外轮廓追踪失败时使用） */
function computeConvexHullFallback(p: Array<[number, number]>): Array<[number, number]> {
  if (p.length < 3) return p
  let s = 0
  for (let i = 1; i < p.length; i++) {
    if (p[i]![0] < p[s]![0] || (p[i]![0] === p[s]![0] && p[i]![1] < p[s]![1])) s = i
  }
  const hull: Array<[number, number]> = []
  let cur = s
  do {
    hull.push(p[cur]!)
    let nxt = cur === 0 ? 1 : 0
    for (let i = 0; i < p.length; i++) {
      if (i === cur || i === nxt) continue
      const [cx, cz] = p[cur]!, [nx, nz] = p[nxt]!, [ix, iz] = p[i]!
      const cross = (nx - cx) * (iz - cz) - (nz - cz) * (ix - cx)
      if (cross < 0 || (cross === 0 && Math.hypot(ix - cx, iz - cz) > Math.hypot(nx - cx, nz - cz))) nxt = i
    }
    cur = nxt
  } while (cur !== s && hull.length <= p.length)
  return hull
}

/**
 * 通用提示气泡 hook —— 按钮旁边挂一个短暂的状态气泡，
 * 3 秒后自动消失。错误红色、成功绿色。
 */
type ActionHint =
  | { kind: 'error'; text: string }
  | { kind: 'success'; text: string }
  | null

function useFlashHint() {
  const [hint, setHint] = useState<ActionHint>(null)
  const hintTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current)
    }
  }, [])

  const flashHint = (next: ActionHint, durationMs = 3000) => {
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current)
    setHint(next)
    if (next) {
      hintTimerRef.current = window.setTimeout(() => setHint(null), durationMs)
    }
  }

  return { hint, flashHint }
}

function ActionHintBubble({ hint }: { hint: ActionHint }) {
  if (!hint) return null
  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border px-3 py-1.5 text-[11px] font-medium shadow-xl backdrop-blur-md',
        hint.kind === 'error'
          ? 'border-red-500/30 bg-red-950/90 text-red-100'
          : 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100',
      )}
      role="status"
    >
      {hint.text}
      <span
        className={cn(
          'absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r',
          hint.kind === 'error'
            ? 'border-red-500/30 bg-red-950/90'
            : 'border-emerald-500/30 bg-emerald-950/90',
        )}
      />
    </div>
  )
}

/**
 * 清理墙体端点 —— 合并当前层里近似重合的墙端点。
 *
 * 用于洗掉 F1（全局精度守恒）之前画的历史数据里的浮点漂移：
 *   Schema 的 quantize transform 只在首次 parse 时生效，已在内存里的
 *   脏数据需要这个工具一次性洗干净。
 */
function CleanupWallsButton() {
  const selectedLevelId = useViewer((s) => s.selection.levelId)
  const { hint, flashHint } = useFlashHint()

  const handleCleanup = () => {
    const { nodes } = useScene.getState()

    // 找要清理的楼层：优先选中的，否则第一个有墙的
    let levelId: string | null = selectedLevelId
    if (!levelId) {
      const levelNode = Object.values(nodes).find((n) => {
        if ((n as any)?.type !== 'level') return false
        const children = (n as any).children as string[] | undefined
        return children?.some((id) => (nodes[id as keyof typeof nodes] as any)?.type === 'wall')
      })
      levelId = levelNode?.id ?? null
    }
    if (!levelId) {
      flashHint({ kind: 'error', text: '请先选择楼层' })
      return
    }

    const before = diagnoseWallGraph(levelId)
    if (before.walls === 0) {
      flashHint({ kind: 'error', text: '当前楼层没有墙体' })
      return
    }

    // 第一步：合并端点漂移（端点近似重合 → 统一坐标）
    const epResult = cleanupWallEndpoints({ levelId })

    // 第二步：去除共线重叠（重复描摹 / F3 残留重叠段）
    const colResult = cleanupCollinearDuplicates(levelId)

    // 第三步：追溯修复 T 型交叉（历史数据未打断的 T 型节点）
    const tjResult = splitTJunctions(levelId)

    const totalFixed =
      epResult.endpointsMerged +
      colResult.duplicatesRemoved +
      colResult.wallsMerged +
      tjResult.wallsSplit

    if (totalFixed === 0) {
      flashHint(
        { kind: 'success', text: `扫描 ${epResult.wallsScanned} 面墙，数据干净` },
        2000,
      )
      return
    }

    const after = diagnoseWallGraph(levelId)
    const fixedDangling = before.danglingVertices - after.danglingVertices
    const parts: string[] = []
    if (epResult.endpointsMerged > 0) parts.push(`端点合并 ${epResult.endpointsMerged}`)
    if (colResult.duplicatesRemoved > 0) parts.push(`重复墙 −${colResult.duplicatesRemoved}`)
    if (colResult.wallsMerged > 0) parts.push(`重叠合并 ${colResult.wallsMerged}`)
    if (tjResult.wallsSplit > 0) parts.push(`T型打断 ${tjResult.wallsSplit}`)
    if (fixedDangling > 0) parts.push(`悬挂修复 ${fixedDangling}`)
    flashHint({ kind: 'success', text: parts.join(' · ') })
  }

  return (
    <>
      <div className="mx-0.5 h-6 w-px bg-white/10" />
      <div className="relative">
        <button
          className="rounded-lg px-2 py-1.5 text-[11px] font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
          onClick={handleCleanup}
          title="合并端点漂移 + 去除重叠重复墙（共线去重）"
          type="button"
        >
          清理端点
        </button>
        <ActionHintBubble hint={hint} />
      </div>
    </>
  )
}

/**
 * 自动生成楼板 — 楼板工具激活时出现在工具栏
 *
 * 点击后沿当前层墙体外轮廓追踪一圈，自动创建楼板节点。支持非凸 (L 形/U 形) 平面，
 * 悬挂墙 (如内部隔墙末端未闭合) 会被自动剪枝，不会影响外轮廓结果。
 *
 * 失败时（空楼层 / 墙体未闭合 / 未选中楼层）在按钮旁边弹 3 秒的气泡提示，
 * 而不是静默 return——用户知道发生了什么，才知道下一步做什么。
 */

function AutoSlabButton() {
  const selectedLevelId = useViewer((s) => s.selection.levelId)
  const { hint, flashHint } = useFlashHint()

  const handleGenerate = () => {
    const { nodes, createNode, deleteNodes } = useScene.getState()

    // 优先用 viewer 里已选中的楼层；未选中时自动找第一个有墙的楼层
    let levelId: string | null = selectedLevelId
    if (!levelId) {
      const levelNode = Object.values(nodes).find((n) => {
        if ((n as any)?.type !== 'level') return false
        const children = (n as any).children as string[] | undefined
        return children?.some((id) => (nodes[id as keyof typeof nodes] as any)?.type === 'wall')
      })
      levelId = levelNode?.id ?? null
    }
    if (!levelId) {
      flashHint({ kind: 'error', text: '请先选择要生成楼板的楼层' })
      return
    }

    // 获取当前层所有墙体
    const level = nodes[levelId as keyof typeof nodes] as
      | { type: string; children: string[]; name?: string; level?: number }
      | undefined
    if (!level || level.type !== 'level') {
      flashHint({ kind: 'error', text: '楼层数据异常' })
      return
    }

    const walls = level.children
      .map((id) => nodes[id as keyof typeof nodes])
      .filter((n): n is WallNode => (n as any)?.type === 'wall')

    if (walls.length === 0) {
      flashHint({ kind: 'error', text: '当前楼层没有墙体，请先画一圈外墙' })
      return
    }

    // 按连通分量分组后各自追踪外轮廓 —— 一层多房间时会返回多个多边形
    const polygons = computeOuterBoundaries(walls)
    if (polygons.length === 0) {
      flashHint({ kind: 'error', text: '墙体未闭合，无法识别外轮廓' })
      return
    }

    // 幂等：若当前层已有楼板（不论是手画的还是自动生成的），先删除，避免堆叠
    const existingSlabIds = level.children.filter(
      (id) => (nodes[id as keyof typeof nodes] as any)?.type === 'slab',
    )
    if (existingSlabIds.length > 0) {
      deleteNodes(existingSlabIds as any)
    }

    // 创建楼板节点
    const levelLabel = level.name ?? `F${(level.level ?? 0) + 1}`
    const single = polygons.length === 1
    for (let i = 0; i < polygons.length; i++) {
      const name = single ? `楼板 ${levelLabel}` : `楼板 ${levelLabel}-${i + 1}`
      const slab = SlabNode.parse({ name, polygon: polygons[i] })
      createNode(slab, levelId as LevelNode['id'])
    }
    sfxEmitter.emit('sfx:structure-build')

    const action = existingSlabIds.length > 0 ? '已更新' : '已生成'
    const countText = single ? '' : `（${polygons.length} 个房间）`
    flashHint(
      { kind: 'success', text: `${action}楼板 ${levelLabel}${countText}` },
      2000,
    )
  }

  return (
    <>
      <div className="mx-0.5 h-6 w-px bg-white/10" />
      <div className="relative">
        <button
          className="rounded-lg px-2 py-1.5 text-[11px] font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
          onClick={handleGenerate}
          title="根据当前层墙体外轮廓自动生成楼板"
          type="button"
        >
          自动生成
        </button>
        <ActionHintBubble hint={hint} />
      </div>
    </>
  )
}
