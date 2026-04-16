/**
 * 全局精度守恒 —— 位置坐标的唯一原子单位
 *
 * 所有"位置类"坐标（墙端点 / 楼板顶点 / 家具锚点 / 门窗位置 / 设备位置）
 * 在写入 store 前都会被量化到 ATOM = 1cm，保证：
 *   1. 数据层不存在比 1cm 更细的位置差异
 *   2. 墙端点相遇时永远精确重合，不会有浮点漂移
 *   3. 图结构 key / 集合去重 / 顶点合并全部走整数比较，零 epsilon 容差
 *
 * 设计依据：国内建筑常用尺寸（墙厚/门洞/窗洞/层高/家具）全部天然对齐 1cm，
 * 用户鼠标点击的有效精度也到不了 mm 量级，1cm 是用户输入精度的自然上限。
 *
 * 例外：设备内部几何特征（如筒灯开孔 Ø75mm）属于产品目录数据，
 * 不参与世界坐标定位，保留原始精度存在 device metadata 中。
 */

/** 每米对应的原子数 —— 100 个 1cm 单位 */
const UNITS_PER_METER = 100

/** 位置精度原子单位 —— 1cm（米为单位）*/
export const ATOM = 1 / UNITS_PER_METER

/**
 * 将单个坐标量化到 1cm 网格。
 * 6.3094 → 6.31，3.9106 → 3.91
 *
 * 使用 `round(x*100)/100` 而非 `round(x/0.01)*0.01`：
 * 前者得到 IEEE-754 规范表示（与 `parseFloat("6.31")` 同），
 * 后者会产生 `6.3100000000000005` 这种 1e-15 的尾数噪声。
 */
export function quantize(v: number): number {
  return Math.round(v * UNITS_PER_METER) / UNITS_PER_METER
}

/** 将 2D 位置点量化。 */
export function quantizePoint(p: readonly [number, number]): [number, number] {
  return [quantize(p[0]), quantize(p[1])]
}

/** 将 3D 位置点量化（如 DoorNode.position / DeviceNode.position）。 */
export function quantizePoint3(
  p: readonly [number, number, number],
): [number, number, number] {
  return [quantize(p[0]), quantize(p[1]), quantize(p[2])]
}

/** 将多边形（闭合或开放的顶点列表）量化。 */
export function quantizePolygon(
  poly: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  return poly.map((p) => quantizePoint(p))
}

/**
 * 位置 hash key —— 整数 cm 字符串，用于 Map 键 / 集合去重 / 图结构顶点索引。
 *
 * 注意：调用前不需要先 quantize，本函数已经走 round(x*100)。
 * 对已量化和未量化的数据都能给出稳定 key。
 */
export function positionKey(p: readonly [number, number]): string {
  return `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`
}

/**
 * 对节点更新 patch 里的位置字段做量化。
 *
 * 背景：Zod 的 `.transform(quantizePoint)` 只在 `.parse()` 时生效，而 `updateNodes`
 * 走的是浅合并（`{...node, ...patch}`），会绕过 Zod 的 transform。
 * 任何拖拽/编辑位置字段的路径都会让脏浮点数直接进 store —— F1 的精度守恒在
 * update 路径上有漏洞。
 *
 * 解决方案：`updateNodes` 在写 store 前先把 patch 过一道 `quantizeNodePatch`，
 * 已知的位置字段（start/end/polygon/holes/position）自动量化。
 * 其它字段原样透传，不影响非位置 patch。
 */
export function quantizeNodePatch<T extends Record<string, any>>(patch: T): T {
  if (patch === null || typeof patch !== 'object') return patch
  const out: any = { ...patch }
  if (Array.isArray(out.start) && out.start.length === 2) {
    out.start = quantizePoint(out.start)
  }
  if (Array.isArray(out.end) && out.end.length === 2) {
    out.end = quantizePoint(out.end)
  }
  if (Array.isArray(out.polygon)) {
    out.polygon = quantizePolygon(out.polygon)
  }
  if (Array.isArray(out.holes)) {
    out.holes = out.holes.map((h: any) =>
      Array.isArray(h) ? quantizePolygon(h) : h,
    )
  }
  if (Array.isArray(out.position)) {
    if (out.position.length === 3) {
      out.position = quantizePoint3(out.position)
    } else if (out.position.length === 2) {
      out.position = quantizePoint(out.position)
    }
  }
  return out as T
}
