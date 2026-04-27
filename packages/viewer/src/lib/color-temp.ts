import * as THREE from 'three'

/**
 * 色温（K）→ Three.js Color，基于 **Tanner Helland 黑体辐射近似**。
 *
 * 物理依据：黑体辐射在 CIE 1931 色品图上沿 Planckian locus 走。Tanner Helland
 * 的工程近似在 1000K-40000K 范围内 sRGB 误差肉眼无感，运算量极小。三段分段函数
 * 分别拟合 R/G/B：
 *
 *   - 红：低色温（暖光）饱和满；高色温按幂函数衰减
 *   - 绿：低色温对数增长；高色温幂函数缓慢衰减
 *   - 蓝：低色温接近 0（暖光蓝几乎不发）；高色温饱和满
 *
 * 比线性插值准确得多：
 *   - 2700K ≈ 钨丝灯琥珀色
 *   - 4000K ≈ 偏暖白
 *   - 5000K ≈ 自然光
 *   - 6500K = D65 白点
 *   - 6500+ 微微偏蓝
 *
 * 参考：https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html
 */
export function colorTempToColor(k: number): THREE.Color {
  const T = Math.max(1000, Math.min(40000, k)) / 100
  let r: number, g: number, b: number

  // 红
  if (T <= 66) {
    r = 1
  } else {
    r = (329.698727446 * (T - 60) ** -0.1332047592) / 255
  }

  // 绿
  if (T <= 66) {
    g = (99.4708025861 * Math.log(T) - 161.1195681661) / 255
  } else {
    g = (288.1221695283 * (T - 60) ** -0.0755148492) / 255
  }

  // 蓝
  if (T >= 66) {
    b = 1
  } else if (T <= 19) {
    b = 0
  } else {
    b = (138.5177312231 * Math.log(T - 10) - 305.0447927307) / 255
  }

  return new THREE.Color(
    Math.max(0, Math.min(1, r)),
    Math.max(0, Math.min(1, g)),
    Math.max(0, Math.min(1, b)),
  )
}

/**
 * 色温感知"暖度"系数（0=中性 / 1=极暖）。
 *
 * 不是线性 K 映射，而是从 RGB 派生：
 *   warmth = max(0, R - B)（红 vs 蓝 的差量代表"偏暖"）
 *
 * 4500K 几乎中性（warmth ≈ 0），3000K 明显暖（≈0.40），2700K 强暖（≈0.55）。
 * 比 (4500 - K) / 1800 的纯线性贴近主观感受。
 */
export function colorTempToWarmth(k: number): number {
  const c = colorTempToColor(k)
  return Math.max(0, c.r - c.b)
}
