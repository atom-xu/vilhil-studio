/**
 * lighting-config.ts —— 灯光体系单一来源
 *
 * 之前所有数值散落各处（lighting.tsx 的 i*14、device-geometry.tsx 的 0.04、
 * bloom.tsx 的 0.30 等），导致每次调一个值要找 3 个文件，互相耦合后调不收敛。
 *
 * 这里是统一标定表，所有 emissive / 强度 / bloom / 曝光全部在此定义。
 * 任何组件需要这些值都从这里 import，禁止硬编码。
 *
 * 【标定逻辑】
 * - 物理光强（cd）：按真实灯具规格的 ~5-10% 标定（演示场景非物理仿真，需要适配
 *   ACES/AgX tonemap 的非线性曲线）
 * - 可视 emissive：保持 < 1.0（AgX 在 1.0 附近开始压缩），让灯具"看得见但不喂 bloom"
 * - SelectiveBloom：emitter mesh 单独走 selection 通道，被照亮的墙面物理排除
 * - 曝光：AgX 默认 0.40（比 ACES 0.62 等效降一档）
 */

export const LIGHTING_CONFIG = {
  /** ─── 曝光（toneMappingExposure 总闸）─── */
  exposure: {
    /** AgX 默认 —— 全屋多灯叠加不爆 */
    base: 0.40,
    /** 用户在 HUD 滑块的可调范围 */
    min: 0.15,
    max: 1.0,
    step: 0.02,
  },

  /** ─── Layer 1: 物理光强（candela / RectArea unit）─── */
  light: {
    /** 筒灯/射灯 SpotLight cd —— 单房间最多 8 盏同开不爆 */
    downlightSpot: 7,
    /** Panel 面板灯 RectAreaLight —— 单灯主光，2.0 在 AgX 下接近真实面光感 */
    panelRect: 1.5,
    /** Panel 补光 PointLight —— 当前禁用 */
    panelFill: 0,
    /** 灯带 SpotLight cd ——【2026-04-29 三次校准】slider 100% 仍过曝，再砍 4×。
        当前数值是初版的 ~1‰，相当于把 slider 上限"软封顶"在 25%。 */
    stripSpot: {
      down: 0.00008,
      up: 0.00005,
      wall: 0.00006,
    },
    stripPoint: 0.00004,
    /** RoomBaseLight 总光通量预算（房间无用户灯时的兜底）*/
    roomBaseSpotBudget: 10,
    roomBaseFillBudget: 0.8,
  },

  /** ─── Layer 2: 可视标记 emissive（被 SelectiveBloom 抓的"灯泡"）─── */
  emissive: {
    /** 筒灯端的 4cm 圆盘 emissive —— bloom 阈值 0.6，1.2 微跨过给小辉光 */
    downlightBulb: 1.0,
    /** Panel 发光面 emissive —— 0.5 微跨阈值给柔光 */
    panelFace: 0.5,
    /** 灯带 tube emissive ——【三次校准】slider 100% 还是太亮，0.05 → 0.012。
        灯带是连续长表面，单位 emissive 在大面积像素上累计感受很强。0.012 配合
        AgX tonemap 后大概表现为"暗暗发光的线条"，正是真实 LED 灯带的视觉量级。 */
    stripTube: 0.012,
  },

  /** ─── Layer 3: SelectiveBloom 后处理 ─── */
  bloom: {
    intensityNight: 0.30,
    intensityDay: 0.18,
    luminanceThreshold: 0.6,
    luminanceSmoothing: 0.5,
    mipmapBlur: true,
  },

  /** ─── Layer 1.5: 灯具属性 UI 范围 ─── */
  attribute: {
    brightness: { min: 0, max: 100, step: 1 },
    /** 色温范围（开尔文）——常见 2700K（暖白）到 6500K（日光白）*/
    colorTemp: { min: 2700, max: 6500, step: 100, default: 3000 },
    /** 色温视觉端点色（用于 slider 底色） */
    colorTempVisual: {
      warm: '#ffb060',  // 2700K 暖橙
      neutral: '#ffe9c2', // 4000K
      cool: '#cfe0ff',  // 6500K 冷白
    },
  },

  /** ─── Layer 0: 物理场景常量（材质 albedo）─── */
  material: {
    wallAlbedo: '#c8c0b8',  // 65% 反射率，住宅米白
    floorAlbedo: '#a89888', // 50% 反射率
  },
} as const

export type LightingConfig = typeof LIGHTING_CONFIG
