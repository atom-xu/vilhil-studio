/**
 * Curtain3D —— 参数化 3D 开合帘类（imperative）
 *
 * 来源：原型在 ~/Downloads/files/Curtain3D.js（4 轮迭代收敛后的工程模块）
 * 端口到 TS、纳入 viewer 包，物理算法 / 不变量 / 默认参数全部保留不变。
 *
 * ─── 物理算法（不要轻动）─────────────────────────────────────────────
 *
 * 1) 单褶振幅（弧长守恒）
 *      c     = visW / fabricL          压缩比 0..1
 *      A_max = fabricL / (4 · N)       极限振幅（之字形折叠）
 *      A     = A_max · √(1 - c²)       平滑过渡
 *    标准参数 (gatherFactor=2, pleatsPerMeter=13) 下振幅 ~3-4cm，刚好塞进 10cm 窗帘盒。
 *
 * 2) 收边 envelope
 *      edgeFade(u) = 0.55 + 0.45·sin(π·u)
 *      z_pleat     = A · sin(2πNu) · edgeFade(u)
 *    解决相接处硬切 / 全开堆叠外缘"切刀"感。
 *
 * 3) 飘动叠加波（每帧 vertex 位移）
 *      breath = dampV(v) · edgeFade(u) · (slow + wave1 + wave2) · A · k
 *    三种频率叠加 + sideIdx 错相，仅 z 位移保 X/Y 不变。
 *
 * 4) 底角自重下垂
 *      yDroop ~ smoothstep · 2.2cm，仅 visW > 35cm 时启用。
 *
 * ─── 不变量（请保留）─────────────────────────────────────────────────
 *   1. 振幅 ≤ 盒内一半（gatherFactor / pleatsPerMeter 改了要重验）
 *   2. 关闭状态两片在 x=0 处相接（sin(2πN·1)=0）
 *   3. 顶部隐藏在盒内（PANEL_TOP_Y = -boxHeight + 0.012）
 *   4. 飘动只动 z
 *   5. opennessSheer 仅 'both' 模式生效
 *
 * 详细 ADR / KNX 集成 / 性能基准见同目录 HANDOFF.md。
 */

import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────
export interface Curtain3DOptions {
  /** 轨道长度 m */
  trackLength: number
  /** 面板下垂高度 m */
  height: number
  /** 主层开合度 0..1（双层下控制遮光层）*/
  openness: number
  /** 双层下纱帘开合度 0..1（单层时回退到 openness）*/
  opennessSheer: number
  /** 'blackout' | 'sheer' | 'both' */
  material: 'blackout' | 'sheer' | 'both'

  /** Fabric 拉伸比（fabricLength / visibleWidth），1.5 偏挺 / 2.0 标准 / 2.5 蓬松 */
  gatherFactor: number
  /** 每米褶皱数（wave-fold 风格）*/
  pleatsPerMeter: number
  /** 完全堆叠时单片最小宽度（防止极端塌缩）*/
  minBunch: number

  /** Pelmet 几何 */
  boxHeight: number
  boxEndExtend: number
  boxDepthSingle: number
  boxDepthDual: number
  dualRailZ: number

  /** 网格分辨率 */
  segmentsHeight: number
  segmentsPerPleat: number

  /** 飘动 */
  breathFactorBlackout: number
  breathFactorSheer: number
  breathing: boolean

  /** 视觉 */
  blackoutColor: number
  sheerColor: number
  sheerOpacity: number
  boxColor: number
  railColor: number
}

const DEFAULTS: Curtain3DOptions = {
  trackLength: 3.2,
  height: 2.4,
  openness: 0,
  opennessSheer: 0,
  material: 'blackout',

  gatherFactor: 2.0,
  pleatsPerMeter: 13,
  minBunch: 0.16,

  boxHeight: 0.18,
  boxEndExtend: 0.18,
  boxDepthSingle: 0.10,
  boxDepthDual: 0.20,
  dualRailZ: 0.05,

  segmentsHeight: 9,
  segmentsPerPleat: 8,

  breathFactorBlackout: 0.18,
  breathFactorSheer: 0.26,
  breathing: true,

  blackoutColor: 0xf0ece4,
  sheerColor: 0xfafbfd,
  sheerOpacity: 0.28,
  boxColor: 0xf5f3ee,
  railColor: 0xc8c4bc,
}

interface PanelRecord {
  mesh: THREE.Mesh
  basePositions: Float32Array
  segW: number
  segH: number
  baseAmp: number
  sideIdx: number
  isLight: boolean
}

// ─────────────────────────────────────────────────────────────────────
// 主类
// ─────────────────────────────────────────────────────────────────────
export class Curtain3D {
  opts: Curtain3DOptions
  group: THREE.Group
  boxGroup: THREE.Group
  curtainGroup: THREE.Group

  blackoutMat!: THREE.MeshPhysicalMaterial
  sheerMat!: THREE.MeshPhysicalMaterial
  boxMat!: THREE.MeshStandardMaterial
  railMat!: THREE.MeshStandardMaterial

  private _panels: PanelRecord[] = []
  private _t = 0
  private _dirty = { box: true, curtain: true }

  constructor(opts: Partial<Curtain3DOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts }

    this.group = new THREE.Group()
    this.boxGroup = new THREE.Group()
    this.curtainGroup = new THREE.Group()
    this.group.add(this.boxGroup)
    this.group.add(this.curtainGroup)

    this._initMaterials()
    this._rebuild()
  }

  // ───────── public ─────────

  /** Three.js Object3D，加到外部 scene */
  get object3D(): THREE.Group { return this.group }

  /** 每帧调用，dt 单位秒 */
  update(dt = 1 / 60): void {
    this._t += dt
    if (this._dirty.box || this._dirty.curtain) this._rebuild()
    if (this.opts.breathing) this._applyBreath(this._t)
  }

  setOpenness(v: number): void {
    this.opts.openness = clamp01(v)
    this._dirty.curtain = true
  }

  setOpennessSheer(v: number): void {
    this.opts.opennessSheer = clamp01(v)
    this._dirty.curtain = true
  }

  setTrackLength(m: number): void {
    this.opts.trackLength = Math.max(0.4, +m)
    this._dirty.box = true
    this._dirty.curtain = true
  }

  setHeight(m: number): void {
    const next = Math.max(0.4, +m)
    if (Math.abs(next - this.opts.height) < 1e-3) return
    this.opts.height = next
    this._dirty.curtain = true
  }

  setMaterial(type: Curtain3DOptions['material']): void {
    if (!['blackout', 'sheer', 'both'].includes(type)) return
    this.opts.material = type
    this._dirty.box = true
    this._dirty.curtain = true
  }

  setBreathing(on: boolean): void {
    this.opts.breathing = !!on
    if (!on) this._resetBreath()
  }

  /** 当前单褶振幅（米），用于检查/断言 */
  getCurrentAmplitude(): number {
    const halfL = this.opts.trackLength / 2
    const fabricL = halfL * this.opts.gatherFactor
    const N = Math.max(5, Math.round(halfL * this.opts.pleatsPerMeter))
    return computePleatAmplitude(this._visibleWidth(this.opts.openness), fabricL, N)
  }

  /** 当前盒子进深（米）*/
  getBoxDepth(): number {
    return this.opts.material === 'both'
      ? this.opts.boxDepthDual
      : this.opts.boxDepthSingle
  }

  /** 销毁：dispose geometry/material，移出父节点 */
  dispose(): void {
    this._disposeBox()
    this._disposePanels()
    ;[this.blackoutMat, this.sheerMat, this.boxMat, this.railMat].forEach((m) => m.dispose())
    if (this.group.parent) this.group.parent.remove(this.group)
  }

  // ───────── private ─────────

  private _initMaterials(): void {
    this.blackoutMat = new THREE.MeshPhysicalMaterial({
      color: this.opts.blackoutColor,
      roughness: 0.92,
      metalness: 0,
      sheen: 1.0,
      sheenColor: new THREE.Color(0xffffff),
      sheenRoughness: 0.55,
      side: THREE.DoubleSide,
    })
    this.sheerMat = new THREE.MeshPhysicalMaterial({
      color: this.opts.sheerColor,
      roughness: 0.4,
      metalness: 0,
      transparent: true,
      opacity: this.opts.sheerOpacity,
      sheen: 1.0,
      sheenColor: new THREE.Color(0xffffff),
      sheenRoughness: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    this.boxMat = new THREE.MeshStandardMaterial({
      color: this.opts.boxColor,
      roughness: 0.85,
    })
    this.railMat = new THREE.MeshStandardMaterial({
      color: this.opts.railColor,
      roughness: 0.45,
      metalness: 0.35,
    })
  }

  private _visibleWidth(openness: number): number {
    const halfL = this.opts.trackLength / 2
    return halfL - openness * (halfL - this.opts.minBunch)
  }

  private _railZs(): number[] {
    return this.opts.material === 'both'
      ? [this.opts.dualRailZ, -this.opts.dualRailZ]
      : [0]
  }

  private _layerZ(layer: 'blackout' | 'sheer'): number {
    if (this.opts.material === 'both') {
      return layer === 'blackout' ? this.opts.dualRailZ : -this.opts.dualRailZ
    }
    return 0
  }

  private _panelTopY(): number {
    return -this.opts.boxHeight + 0.012
  }

  private _rebuild(): void {
    if (this._dirty.box) { this._buildBox(); this._dirty.box = false }
    if (this._dirty.curtain) { this._buildCurtain(); this._dirty.curtain = false }
  }

  private _disposeBox(): void {
    while (this.boxGroup.children.length) {
      const c = this.boxGroup.children[0] as THREE.Mesh
      this.boxGroup.remove(c)
      if (c.geometry) c.geometry.dispose()
    }
  }

  private _disposePanels(): void {
    for (const p of this._panels) {
      if (p.mesh.geometry) p.mesh.geometry.dispose()
      this.curtainGroup.remove(p.mesh)
    }
    this._panels = []
  }

  private _buildBox(): void {
    this._disposeBox()
    const L = this.opts.trackLength
    const W = L + this.opts.boxEndExtend * 2
    const H = this.opts.boxHeight
    const D = this.getBoxDepth()
    const m = this.boxMat

    const lid = new THREE.Mesh(new THREE.BoxGeometry(W, 0.018, D), m)
    lid.position.set(0, -0.009, 0)
    this.boxGroup.add(lid)

    const front = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.018), m)
    front.position.set(0, -H / 2 - 0.018, D / 2 - 0.009)
    this.boxGroup.add(front)

    const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.018), m)
    back.position.set(0, -H / 2 - 0.018, -D / 2 + 0.009)
    this.boxGroup.add(back)

    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, H + 0.018, D - 0.018), m
      )
      side.position.set(sx * (W / 2 - 0.009), -H / 2 - 0.009, 0)
      this.boxGroup.add(side)
    }

    for (const z of this._railZs()) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(L, 0.012, 0.022),
        this.railMat,
      )
      rail.position.set(0, -0.018, z)
      this.boxGroup.add(rail)
    }
  }

  private _buildCurtain(): void {
    this._disposePanels()

    const halfL = this.opts.trackLength / 2
    const fabricL = halfL * this.opts.gatherFactor
    const N = Math.max(5, Math.round(halfL * this.opts.pleatsPerMeter))
    const segH = this.opts.segmentsHeight
    const segW = Math.max(60, N * this.opts.segmentsPerPleat)

    const oBlackout = this.opts.openness
    const oSheer = this.opts.material === 'both'
      ? this.opts.opennessSheer
      : this.opts.openness

    let idx = 0
    if (this.opts.material === 'blackout' || this.opts.material === 'both') {
      this._addPanelPair(this.blackoutMat, this._layerZ('blackout'),
        oBlackout, halfL, fabricL, N, segW, segH, idx)
      idx += 2
    }
    if (this.opts.material === 'sheer' || this.opts.material === 'both') {
      this._addPanelPair(this.sheerMat, this._layerZ('sheer'),
        oSheer, halfL, fabricL, N, segW, segH, idx)
      idx += 2
    }
  }

  private _addPanelPair(
    mat: THREE.MeshPhysicalMaterial,
    zOff: number,
    openness: number,
    halfL: number,
    fabricL: number,
    N: number,
    segW: number,
    segH: number,
    baseSideIdx: number,
  ): void {
    const visW = this._visibleWidth(openness)
    const A = computePleatAmplitude(visW, fabricL, N)
    const isLight = mat === this.sheerMat

    for (let side = 0; side < 2; side++) {
      const mirrored = side === 1
      const xAnchor = mirrored ? halfL : -halfL
      const geo = buildPanelGeometry(visW, fabricL, this.opts.height, segW, segH, N, A)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(xAnchor, this._panelTopY(), zOff)
      mesh.scale.x = mirrored ? -1 : 1
      if (isLight) mesh.renderOrder = 1
      this.curtainGroup.add(mesh)

      this._panels.push({
        mesh,
        basePositions: new Float32Array(geo.attributes.position!.array as Float32Array),
        segW, segH,
        baseAmp: A,
        sideIdx: baseSideIdx + side,
        isLight,
      })
    }
  }

  private _applyBreath(t: number): void {
    const fB = this.opts.breathFactorBlackout
    const fS = this.opts.breathFactorSheer

    for (const p of this._panels) {
      const pos = p.mesh.geometry.attributes.position!.array as Float32Array
      const base = p.basePositions
      const segW = p.segW
      const segH = p.segH
      const factor = (p.isLight ? fS : fB) * p.baseAmp
      const sIdx = p.sideIdx

      for (let j = 0; j <= segH; j++) {
        const v = j / segH
        const dampV = Math.pow(v, 1.4)

        for (let i = 0; i <= segW; i++) {
          const u = i / segW
          const idx = (j * (segW + 1) + i) * 3
          const edgeFade = 0.55 + 0.45 * Math.sin(Math.PI * u)
          const slow = Math.sin(t * 0.55 + sIdx * 1.31) * 0.45
          const wave1 = Math.sin(u * 6 + t * 1.10 + sIdx * 0.61) * 0.35
          const wave2 = Math.sin(u * 13 - t * 1.70 + sIdx * 1.73) * 0.12
          const breath = dampV * edgeFade * (slow + wave1 + wave2) * factor
          pos[idx + 2] = base[idx + 2]! + breath
        }
      }
      p.mesh.geometry.attributes.position!.needsUpdate = true
      p.mesh.geometry.computeVertexNormals()
    }
  }

  private _resetBreath(): void {
    for (const p of this._panels) {
      const pos = p.mesh.geometry.attributes.position!.array as Float32Array
      pos.set(p.basePositions)
      p.mesh.geometry.attributes.position!.needsUpdate = true
      p.mesh.geometry.computeVertexNormals()
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// 纯函数 helpers（导出供测试）
// ─────────────────────────────────────────────────────────────────────

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, +v || 0))
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * 单褶振幅 —— 弧长守恒推导
 *   c     = visW / fabricL
 *   A_max = fabricL / (4 · N)
 *   A     = A_max · √(1 - c²)
 */
export function computePleatAmplitude(visW: number, fabricL: number, N: number): number {
  const c = Math.min(1, Math.max(0.04, visW / fabricL))
  const Amax = fabricL / (4 * N)
  return Amax * Math.sqrt(Math.max(0, 1 - c * c))
}

/**
 * 单片面板几何 —— 从 (0,0,0) 起，向下 -H 延伸到 (visW, -H, 0)
 *
 * 三层效果叠加：
 *   1) 正弦褶皱           z = A · sin(2πNu)
 *   2) 收边 envelope       · (0.55 + 0.45·sin(πu))
 *   3) 底角自重下垂        + smoothstep window 在 y 方向
 */
export function buildPanelGeometry(
  visW: number,
  fabricL: number,
  H: number,
  segW: number,
  segH: number,
  N: number,
  A: number,
): THREE.BufferGeometry {
  void fabricL
  const verts = (segW + 1) * (segH + 1)
  const positions = new Float32Array(verts * 3)
  const uvs = new Float32Array(verts * 2)
  const indices: number[] = []

  const visWFactor = smoothstep(0.35, 1.0, visW)

  let p = 0
  let q = 0
  for (let j = 0; j <= segH; j++) {
    const v = j / segH
    const y0 = -H * v

    for (let i = 0; i <= segW; i++) {
      const u = i / segW
      const x = u * visW

      const edgeFade = 0.55 + 0.45 * Math.sin(Math.PI * u)
      const phase = u * N * 2 * Math.PI
      const z = A * Math.sin(phase) * edgeFade

      const lateralDist = Math.min(u, 1 - u)
      const cornerVMask = smoothstep(0.85, 1.0, v)
      const cornerHMask = 1 - smoothstep(0.05, 0.20, lateralDist)
      const yDroop = -cornerVMask * cornerHMask * visWFactor * 0.022

      positions[p++] = x
      positions[p++] = y0 + yDroop
      positions[p++] = z
      uvs[q++] = u
      uvs[q++] = v
    }
  }

  for (let j = 0; j < segH; j++) {
    for (let i = 0; i < segW; i++) {
      const a = j * (segW + 1) + i
      const b = a + 1
      const c = a + (segW + 1)
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}
