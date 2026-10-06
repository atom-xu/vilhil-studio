import * as THREE from 'three'
import { advanceMotion, clothDimensions, createSheerMaterial, SheerCloth } from './sheer-cloth'

/** Conservative separation of the new sheer folds and the unchanged blackout folds. */
export function sheerHousingDimensions(width: number) {
  const dimensions = clothDimensions(width)
  const amplitude = (dimensions.halfWidth * 1.85) / (4 * dimensions.folds)
  const sheerDepth = amplitude * 1.1 + 0.028 + 0.013
  const blackoutFolds = Math.max(5, Math.round(dimensions.halfWidth * 13))
  const blackoutDepth = ((dimensions.halfWidth * 2) / (4 * blackoutFolds)) * 1.18
  const railZ = (sheerDepth + blackoutDepth + 0.012) / 2
  return {
    railZ,
    singleDepth: Math.max(0.2, 2 * (amplitude + 0.028 + 0.013 + 0.024)),
    dualDepth: 2 * (railZ + amplitude + 0.028 + 0.013 + 0.024),
  }
}

/** Render-only motion: targets come from DeviceNode.state; never writes to the scene store. */
export class SheerCurtain {
  readonly group = new THREE.Group()
  readonly cloth: SheerCloth
  readonly material = createSheerMaterial()
  readonly motion: { position: number; velocity: number }
  private target: number
  private time = 0
  private suspended = false
  private disposed = false
  private coverage: boolean | undefined

  constructor(width: number, height: number, openness: number, samples: number) {
    this.cloth = new SheerCloth(clothDimensions(width, height))
    this.target = normalizeOpen(openness)
    this.motion = { position: this.target, velocity: 0 }
    this.group.name = 'vilhil-sheer-v2'
    this.material.name = 'vilhil-sheer-v2'
    this.setCoverage(samples)
    const left = new THREE.Mesh(this.cloth.geometry, this.material)
    const right = new THREE.Mesh(this.cloth.geometry, this.material)
    left.name = 'sheer-left'
    right.name = 'sheer-right'
    left.position.x = -this.cloth.dimensions.halfWidth
    right.position.x = this.cloth.dimensions.halfWidth
    right.scale.x = -1
    // A postprocessing target may have different sampling from the default framebuffer.
    left.onBeforeRender = (renderer) => {
      const target = renderer.getRenderTarget()
      this.setCoverage(target ? target.samples : samples)
    }
    this.group.add(left, right)
    this.cloth.update(this.target, 0, 0, false)
  }

  setTarget(openness: number): void {
    this.target = normalizeOpen(openness)
  }

  private setCoverage(samples: number): void {
    const coverage = samples > 0
    if (this.coverage === coverage) return
    this.coverage = coverage
    this.material.alphaToCoverage = coverage
    // Studio disables MSAA (including Bloom targets). Continuous alpha avoids the
    // visibly grainy alphaHash fallback; the surface is monotonic across each panel.
    this.material.alphaHash = false
    this.material.transparent = !coverage
    this.material.depthWrite = coverage
    this.material.needsUpdate = true
  }

  update(dt: number): void {
    // Invisible ancestors include hidden floors. No geometry work until visible again.
    let ancestor: THREE.Object3D | null = this.group
    while (ancestor) {
      if (!ancestor.visible) {
        this.suspended = true
        return
      }
      ancestor = ancestor.parent
    }
    if (this.suspended) {
      this.motion.position = this.target
      this.motion.velocity = 0
      this.suspended = false
    } else {
      advanceMotion(this.motion, this.target, dt)
    }
    this.time += Math.min(0.05, Math.max(0, dt))
    // The accepted default has no idle breeze; idle geometry therefore stops updating.
    this.cloth.update(this.motion.position, this.motion.velocity, this.time, false)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cloth.dispose()
    this.material.dispose()
    this.group.removeFromParent()
    this.group.clear()
  }
}

function normalizeOpen(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}
