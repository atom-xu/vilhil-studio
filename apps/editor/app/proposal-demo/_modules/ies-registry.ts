/**
 * IES 配光曲线注册表 —— 把 catalog 里的 productId / renderType 映射到具体 IES 文件。
 *
 * IES（IES LM-63）是灯具厂商发布的"光强空间分布"标准格式，文件里描述
 * 不同角度的相对光强。Three.js r150+ 的 SpotLight 支持 `iesMap`：把 IES
 * 转成一张 1D 数据贴图，运行时按角度采样，让 SpotLight 的实际照射形状
 * 不再是数学完美的圆锥，而是接近真实灯具的扇形 / 椭圆 / 偏光等。
 *
 * 我们这里集成的是 **Aqara 智能家居灯具** 的实测 IES（来自苏州培训中心提供）。
 * 仅对**走 SpotLight 的灯具**生效：筒灯、射灯、吊灯、壁灯、轨道射灯等。
 *
 * 不应用 IES 的：
 *   - 平板灯（用 RectAreaLight，不支持 iesMap）
 *   - 灯带（StripLightArray 多个 SpotLight 平铺，IES 是整条灯的分布、平铺会重复采样）
 *
 * 文件位置：`apps/editor/public/ies/aqara/*.ies`，路径在 IES_PATHS 里。
 */

const PUBLIC_IES_BASE = '/ies/aqara'

/** 可用的 IES 文件清单（路径 + 描述）。catalogId 通过 productIdToIES 映射到这里 */
export const IES_PATHS = {
  downlightT2_10W: `${PUBLIC_IES_BASE}/downlight-t2-10w.ies`,
  spotT2_15deg: `${PUBLIC_IES_BASE}/spot-t2-15deg.ies`,
  spotT2_24deg: `${PUBLIC_IES_BASE}/spot-t2-24deg.ies`,
  spotT2_36deg: `${PUBLIC_IES_BASE}/spot-t2-36deg.ies`,
  trackSpot_10W: `${PUBLIC_IES_BASE}/track-spot-10w.ies`,
  trackPendant_10W: `${PUBLIC_IES_BASE}/track-pendant-10w.ies`,
  trackGrille6: `${PUBLIC_IES_BASE}/track-grille-6.ies`,
  trackGrille12: `${PUBLIC_IES_BASE}/track-grille-12.ies`,
  trackFlood_16W: `${PUBLIC_IES_BASE}/track-flood-16w.ies`,
  trackFlood_8W: `${PUBLIC_IES_BASE}/track-flood-8w.ies`,
  trackWash_10W: `${PUBLIC_IES_BASE}/track-wash-10w.ies`,
  trackFold_6W: `${PUBLIC_IES_BASE}/track-fold-6w.ies`,
} as const

export type IESKey = keyof typeof IES_PATHS

/**
 * Catalog productId → IES 文件 key 映射。
 * 没有匹配的 productId 走默认（基于 renderType / mountType 的兜底逻辑）。
 */
const PRODUCT_TO_IES: Record<string, IESKey> = {
  'LIGHT-DOWNLIGHT': 'downlightT2_10W',
  'LIGHT-PENDANT': 'trackPendant_10W',
  // 壁灯接近"洗墙"的偏光分布
  'LIGHT-WALL': 'trackWash_10W',
}

/**
 * 按 device 信息选 IES 文件路径。返回 null 表示这个灯不需要 IES（比如平板灯/灯带）。
 *
 * 优先级：
 *   1) productId 精确匹配
 *   2) renderType 兜底（panel / strip 不上 IES，downlight / spot 走默认筒灯）
 *   3) 都没命中返回 null
 */
export function getIESPathForDevice(args: {
  productId?: string
  renderType?: string
}): string | null {
  const { productId, renderType } = args

  if (productId && PRODUCT_TO_IES[productId]) {
    return IES_PATHS[PRODUCT_TO_IES[productId]]
  }

  // renderType 兜底
  switch (renderType) {
    case 'panel':
    case 'strip':
    case 'strip-wash-wall':
    case 'strip-cove':
    case 'strip-skirting':
      return null
    case 'downlight':
      return IES_PATHS.downlightT2_10W
    case 'spotlight':
    case 'spot':
      return IES_PATHS.spotT2_24deg
    case 'pendant':
      return IES_PATHS.trackPendant_10W
    case 'wall-light':
      return IES_PATHS.trackWash_10W
    default:
      return null
  }
}
