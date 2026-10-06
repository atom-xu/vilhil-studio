import * as THREE from 'three'

// Isolated visual fixture, in metres. No DeviceNode or persistent scene state.
export const CLOTH = {
  halfWidth: 1.92,
  height: 2.62,
  bunchWidth: 0.32,
  folds: 14,
  segmentsPerFold: 12,
  rows: 32,
  top: 2.84,
} as const

export const clamp = (value: number) => Math.min(1, Math.max(0, value))
const smooth = (value: number) => value * value * (3 - 2 * value)

/** Compress successive pleats from the moving leading edge toward the fixed anchor. */
export function foldWidth(fold: number, openness: number): number {
  const stagger = 0.48
  const progress = smooth(
    clamp(openness * (1 + stagger) - stagger * (1 - fold / (CLOTH.folds - 1))),
  )
  return (CLOTH.halfWidth * (1 - progress) + CLOTH.bunchWidth * progress) / CLOTH.folds
}

// Numerically match a sinusoid's arc length instead of scaling the entire cloth.
function amplitudeForPitch(pitch: number): number {
  const length = (CLOTH.halfWidth * 1.85) / CLOTH.folds
  let lo = 0
  let hi = length / 4
  for (let pass = 0; pass < 16; pass++) {
    const amplitude = (lo + hi) / 2
    let arc = 0
    for (let sample = 0; sample < 48; sample++) {
      const slope = 2 * Math.PI * amplitude * Math.cos((2 * Math.PI * (sample + 0.5)) / 48)
      arc += Math.hypot(pitch, slope) / 48
    }
    if (arc < length) lo = amplitude
    else hi = amplitude
  }
  return (lo + hi) / 2
}

/** Allocate once; all animation updates reuse typed arrays and the geometry. */
export class SheerCloth {
  readonly geometry: THREE.PlaneGeometry
  private readonly widths = new Float32Array(CLOTH.folds)
  private readonly offsets = new Float32Array(CLOTH.folds + 1)
  private readonly amplitudes = new Float32Array(257)

  private lastOpenness = Number.NaN
  private lastVelocity = Number.NaN
  private wasBreezy = false

  constructor() {
    this.geometry = new THREE.PlaneGeometry(1, 1, CLOTH.folds * CLOTH.segmentsPerFold, CLOTH.rows)
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute
    position.setUsage(THREE.DynamicDrawUsage)
    for (let index = 0; index <= 256; index++) {
      const pitch =
        (CLOTH.bunchWidth + ((CLOTH.halfWidth - CLOTH.bunchWidth) * index) / 256) / CLOTH.folds
      this.amplitudes[index] = amplitudeForPitch(pitch)
    }
    // Fixed conservative bounds cover every opening and breeze phase.
    if (!this.geometry.boundingSphere) {
      this.geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(CLOTH.halfWidth / 2, -CLOTH.height / 2, 0),
        1.8,
      )
    }
    this.update(0, 0, 0, false)
  }

  update(openness: number, velocity: number, time: number, breeze: boolean): void {
    if (
      !breeze &&
      !this.wasBreezy &&
      openness === this.lastOpenness &&
      velocity === this.lastVelocity
    )
      return
    this.lastOpenness = openness
    this.lastVelocity = velocity
    this.wasBreezy = breeze
    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const columns = CLOTH.folds * CLOTH.segmentsPerFold
    for (let row = 0; row <= CLOTH.rows; row++) {
      const v = row / CLOTH.rows
      // The leading edge pulls the top first; the lower fabric catches up on settling.
      const localOpen = clamp(openness - velocity * 0.15 * v * v)
      this.offsets[0] = 0
      for (let fold = 0; fold < CLOTH.folds; fold++) {
        this.widths[fold] = foldWidth(fold, localOpen)
        this.offsets[fold + 1] = this.offsets[fold]! + this.widths[fold]!
      }
      for (let column = 0; column <= columns; column++) {
        const u = column / columns
        const fold = Math.min(CLOTH.folds - 1, Math.floor(column / CLOTH.segmentsPerFold))
        const phase = column / CLOTH.segmentsPerFold - fold
        const pitch = this.widths[fold]!
        const lookup =
          clamp((pitch * CLOTH.folds - CLOTH.bunchWidth) / (CLOTH.halfWidth - CLOTH.bunchWidth)) *
          256
        const a = Math.floor(lookup)
        const amplitude = THREE.MathUtils.lerp(
          this.amplitudes[a]!,
          this.amplitudes[Math.min(256, a + 1)]!,
          lookup - a,
        )
        const edge = Math.sin(Math.PI * u)
        const weight = v * v
        const sway = breeze ? Math.sin(time * 0.85 + u * 7) * 0.013 * weight * edge : 0
        const x =
          this.offsets[fold]! + phase * pitch + pitch * 0.16 * Math.sin(v * 2.2 + u * 9) * edge * v
        const y = -v * CLOTH.height - Math.sin(Math.PI * phase) ** 2 * 0.009 * v
        const z =
          Math.sin(2 * Math.PI * (phase + 0.07 * Math.sin(v * 3.4 + u * 6) * v)) *
            amplitude *
            (1 + 0.1 * weight) +
          Math.sin(Math.PI * v) * edge * 0.028 +
          sway
        positions.setXYZ(row * (columns + 1) + column, x, y, z)
      }
    }
    positions.needsUpdate = true
    // Finite differences reuse the existing normal buffer (no per-frame Vector3 allocation).
    const normals = this.geometry.getAttribute('normal') as THREE.BufferAttribute
    for (let row = 0; row <= CLOTH.rows; row++) {
      for (let col = 0; col <= columns; col++) {
        const left = row * (columns + 1) + Math.max(0, col - 1)
        const right = row * (columns + 1) + Math.min(columns, col + 1)
        const top = Math.max(0, row - 1) * (columns + 1) + col
        const bottom = Math.min(CLOTH.rows, row + 1) * (columns + 1) + col
        const ax = positions.getX(right) - positions.getX(left)
        const ay = positions.getY(right) - positions.getY(left)
        const az = positions.getZ(right) - positions.getZ(left)
        const bx = positions.getX(bottom) - positions.getX(top)
        const by = positions.getY(bottom) - positions.getY(top)
        const bz = positions.getZ(bottom) - positions.getZ(top)
        const nx = by * az - bz * ay
        const ny = bz * ax - bx * az
        const nz = bx * ay - by * ax
        const length = Math.hypot(nx, ny, nz) || 1
        normals.setXYZ(row * (columns + 1) + col, nx / length, ny / length, nz / length)
      }
    }
    normals.needsUpdate = true
  }

  dispose(): void {
    this.geometry.dispose()
  }
}

/** MSAA fibre coverage writes depth without transparent-object sorting. */
export function createSheerMaterial(): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#f8f5ed',
    roughness: 0.95,
    metalness: 0,
    sheen: 0.06,
    specularIntensity: 0.35,
    sheenColor: '#ffffff',
    sheenRoughness: 0.9,
    side: THREE.DoubleSide,
    opacity: 0.36,
    alphaToCoverage: true,
    depthWrite: true,
    transparent: false,
  })
  material.onBeforeCompile = (shader) => {
    // UVs mark the woven selvedge/hem. Derivatives give denser coverage at grazing angles.
    shader.vertexShader = `varying vec2 clothUv;\n${shader.vertexShader}`.replace(
      '#include <uv_vertex>',
      '#include <uv_vertex>\nclothUv = uv;',
    )
    shader.fragmentShader = `varying vec2 clothUv;\n${shader.fragmentShader}`.replace(
      '#include <alphahash_fragment>',
      `vec3 fabricNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
       float facing = abs(dot(fabricNormal, normalize(vViewPosition)));
       float hem = 1.0 - smoothstep(0.0015, 0.003, min(clothUv.y, 1.0-clothUv.y));
       float edge = 1.0 - smoothstep(0.001, 0.002, min(clothUv.x, 1.0-clothUv.x));
       diffuseColor.a = min(0.60, opacity + 0.12 * pow(1.0-facing, 2.0) + 0.04*max(hem,edge));
       #include <alphahash_fragment>`,
    )
  }
  material.customProgramCacheKey = () => 'vilhil-sheer-lab-v2-lighter'
  return material
}

/** Time-based critically damped follow; opposite targets start at the current shape. */
export function advanceMotion(
  state: { position: number; velocity: number },
  target: number,
  dt: number,
): void {
  const elapsed = Math.min(1, Math.max(0, dt))
  const omega = 3.8
  const displacement = state.position - clamp(target)
  const impulse = state.velocity + omega * displacement
  const decay = Math.exp(-omega * elapsed)
  state.position = clamp(target + (displacement + impulse * elapsed) * decay)
  state.velocity = (state.velocity - omega * impulse * elapsed) * decay
  if (Math.abs(state.position - target) < 0.0003 && Math.abs(state.velocity) < 0.001) {
    state.position = clamp(target)
    state.velocity = 0
  }
}
