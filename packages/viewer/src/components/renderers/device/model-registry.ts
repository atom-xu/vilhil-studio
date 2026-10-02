/**
 * model-registry —— 设备品牌 3D 模型注册表
 *
 * 把 (productId | renderType) 映射到具体 GLB 路径 + 摆放变换。
 * 复刻 ies-registry 的"productId/renderType → 资产"模式。
 *
 * 查表优先级：
 *   1. productId 精确命中（device.productId === 某个真实型号 SKU）
 *   2. renderType 默认品牌模型（让通用 catalog 设备也用上真实品牌模型）
 *   3. 都不命中 → 返回 null，DeviceGeometry 走程序化白模兜底
 *
 * 资产位置：apps/editor/public/items/<sku>/model.glb
 *
 * 【扩展】路创面板建模产出后，把 lutron-* 的 productId → GLB 加到 MODEL_BY_PRODUCT 即可，
 * 渲染层零改动。
 */

export interface ModelEntry {
  /** GLB 路径（public 下的绝对路径） */
  path: string
  /** 额外旋转（弧度，[x,y,z]）—— GLB 朝向和我们约定不一致时校正 */
  rotation?: [number, number, number]
  /** 均匀缩放（GLB 单位和米不一致时校正） */
  scale?: number
  /** Y 偏移（米）—— 锚点不在底/中心时校正 */
  yOffset?: number
}

const PUB = '/items'

// ── 1. productId 精确映射（真实 SKU）──────────────────────────────────────
// UniFi 官方公开发布的 GLB，已在 public/items/unifi-*。
export const MODEL_BY_PRODUCT: Record<string, ModelEntry> = {
  // 摄像头
  'unifi-uvc-g6-pro-360':       { path: `${PUB}/unifi-g6-pro-360/model.glb` },
  'unifi-uvc-ai-pro':           { path: `${PUB}/unifi-uvc-ai-pro/model.glb` },
  'unifi-uvc-g5-turret-ultra':  { path: `${PUB}/unifi-uvc-g5-turret-ultra/model.glb` },
  'unifi-uvc-g6-180':           { path: `${PUB}/unifi-uvc-g6-180/model.glb` },
  'unifi-uvc-g6-pro-entry':     { path: `${PUB}/unifi-uvc-g6-pro-entry/model.glb` },
  'unifi-uvc-g6-pro-turret':    { path: `${PUB}/unifi-uvc-g6-pro-turret/model.glb` },
  // WiFi AP
  'unifi-u7-pro-xgs':           { path: `${PUB}/unifi-u7-pro-xgs/model.glb` },
  'unifi-u7-pro-xg-wall':       { path: `${PUB}/unifi-u7-pro-xg-wall/model.glb` },
  'unifi-ux7':                  { path: `${PUB}/unifi-ux7/model.glb` },
  // ── 网络设备（弱电箱内,阶段2才用,先登记不默认启用）──
  'unifi-ucg-fiber':            { path: `${PUB}/unifi-ucg-fiber/model.glb` },
  'unifi-udr7':                 { path: `${PUB}/unifi-udr7/model.glb` },
  'unifi-usw-pro-xg-8-poe':     { path: `${PUB}/unifi-usw-pro-xg-8-poe/model.glb` },
  'unifi-unas-4':               { path: `${PUB}/unifi-unas-4/model.glb` },
}

// ── 2. renderType 默认品牌模型 ─────────────────────────────────────────────
// 让通用 catalog 设备（没指定具体 SKU）也显示真实品牌模型，提升演示质感。
// 仅对"客户可见"的摄像头 / AP 设默认；网络设备(网关/路由/交换/NAS)不设默认
// （阶段2 弱电箱内才展示，避免散落房间）。
export const DEFAULT_MODEL_BY_RENDERTYPE: Record<string, ModelEntry> = {
  // 摄像头：半球/吸顶类 → 360 吸顶机；枪机/挑臂类 → AI 一体机
  dome:            { path: `${PUB}/unifi-g6-pro-360/model.glb` },
  'camera-bullet': { path: `${PUB}/unifi-uvc-ai-pro/model.glb` },
  // WiFi AP：吸顶 → U7 Pro XGS；面板/壁挂 → U7 Pro XG Wall
  ceiling:         { path: `${PUB}/unifi-u7-pro-xgs/model.glb` },
  'ap-ceiling':    { path: `${PUB}/unifi-u7-pro-xgs/model.glb` },
  wall:            { path: `${PUB}/unifi-u7-pro-xg-wall/model.glb` },
  'ap-wall':       { path: `${PUB}/unifi-u7-pro-xg-wall/model.glb` },
}

/**
 * 查询设备应该用的品牌 GLB。命不中返回 null（走白模兜底）。
 */
export function getDeviceModel(opts: {
  productId?: string
  renderType?: string
}): ModelEntry | null {
  if (opts.productId) {
    const byProduct = MODEL_BY_PRODUCT[opts.productId]
    if (byProduct) return byProduct
  }
  if (opts.renderType) {
    const byType = DEFAULT_MODEL_BY_RENDERTYPE[opts.renderType]
    if (byType) return byType
  }
  return null
}

/** 预加载用的全部路径（DeviceGeometry preload 调用）*/
export function getAllModelPaths(): string[] {
  const set = new Set<string>()
  for (const e of Object.values(MODEL_BY_PRODUCT)) set.add(e.path)
  for (const e of Object.values(DEFAULT_MODEL_BY_RENDERTYPE)) set.add(e.path)
  return [...set]
}
