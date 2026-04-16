import dedent from 'ts-dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'
import { quantizePoint } from '../precision'

/**
 * 墙端点节点 —— F2 阶段新增的"一等公民"顶点
 *
 * 目的：让拐角成为一个有 id 的共享节点，而不是"一堆恰好重合的端点坐标"。
 * 拖动一个 VertexNode 就能联动所有引用它的墙，户型图从"一堆胶带"变成"橡皮泥"。
 *
 * 两种种类：
 *   - `input`    —— 用户直接点出来的拐角，position 是主数据（1cm 量化）
 *   - `derived`  —— 从其他几何派生出来的点（比如 F3 打断点：wall.start + (wall.end-wall.start)*t）
 *                   position 由运行时计算，保存的是 parentWallId + t 参数
 *                   派生点不被 quantize transform 覆盖（保留数学上的精确共线性）
 *
 * 当前阶段（最小版）：
 *   - Schema 已就绪，可以被 create/parse
 *   - WallNode 暴露 startNodeId / endNodeId 软引用（optional，老数据兼容）
 *   - 画墙工具 / 拖动联动 / 合并清理 未重写 —— 那是 F2 完整版的工作
 *   - 本文件打地基，不改现有画墙行为
 */
export const VertexNodeKind = z.enum(['input', 'derived'])
export type VertexNodeKind = z.infer<typeof VertexNodeKind>

export const VertexNode = BaseNode.extend({
  id: objectId('vtx'),
  type: nodeType('vertex'),

  /** 节点种类 —— input（用户直接点出来）/ derived（从其他几何派生） */
  kind: VertexNodeKind.default('input'),

  /**
   * 位置坐标 —— 输入节点的主数据；派生节点的缓存值。
   * 输入节点会被 F1 精度 transform 量化到 1cm；派生节点运行时计算，
   * 写入时应以调用方计算结果为准（不量化，保证共线）。
   */
  position: z
    .tuple([z.number(), z.number()])
    .default([0, 0])
    .transform(quantizePoint),

  /** 派生节点专用：依附的父墙 id */
  parentWallId: z.string().optional(),

  /** 派生节点专用：沿父墙的参数位置 (0-1)，position 可从 parent.start + (parent.end-parent.start)*t 算出 */
  parentT: z.number().min(0).max(1).optional(),

  /**
   * 反向索引 —— 引用这个节点的墙 id 列表。写入由创建/更新墙时维护，
   * 读取时用来支持"拖动节点联动所有墙"和"删除节点时级联处理"。
   */
  referencedByWallIds: z.array(z.string()).default([]),
}).describe(
  dedent`
  Vertex node —— 墙端点一等公民节点 (F2)
  - kind: 'input' | 'derived'
  - position: [x, z]
  - parentWallId / parentT: 仅 derived 节点用，表达参数化位置
  - referencedByWallIds: 反向索引，所有引用此节点的墙
  `,
)

export type VertexNode = z.infer<typeof VertexNode>
