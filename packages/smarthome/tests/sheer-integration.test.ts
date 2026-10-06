import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  SheerCloth as ReferenceCloth,
  createSheerMaterial as referenceMaterial,
} from '../../../apps/editor/app/curtain-lab/cloth'
import { Curtain3D } from '../../viewer/src/components/renderers/device/animations/curtain/curtain-3d-class'
import {
  clothDimensions,
  createSheerMaterial,
  SheerCloth,
} from '../src/renderers/curtain/sheer-cloth'
import { SheerCurtain, sheerHousingDimensions } from '../src/renderers/curtain/sheer-curtain'

describe('approved sheer integration', () => {
  test('parameterized model reproduces the frozen approved mesh and material', () => {
    const reference = new ReferenceCloth()
    const actual = new SheerCloth()
    for (const [position, velocity] of [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [0.3, 0.8],
      [0.5, -0.6],
    ]) {
      reference.update(position!, velocity!, 2, false)
      actual.update(position!, velocity!, 2, false)
      expect(actual.geometry.getAttribute('position').array).toEqual(
        reference.geometry.getAttribute('position').array,
      )
      expect(actual.geometry.getAttribute('normal').array).toEqual(
        reference.geometry.getAttribute('normal').array,
      )
    }
    const a = createSheerMaterial(),
      b = referenceMaterial()
    for (const key of [
      'opacity',
      'roughness',
      'sheen',
      'specularIntensity',
      'depthWrite',
      'transparent',
      'alphaToCoverage',
    ] as const)
      expect(a[key]).toEqual(b[key])
    expect(a.color.equals(b.color)).toBe(true)
    a.dispose()
    b.dispose()
    actual.dispose()
    reference.dispose()
  })
  test('device dimensions retain finite, monotonic geometry and fixed buffers', () => {
    for (const width of [0.4, 1.2, 3.84, 6, 12]) {
      const cloth = new SheerCloth(clothDimensions(width, 3.2))
      const buffer = cloth.geometry.getAttribute('position').array
      const columns = cloth.dimensions.folds * 12
      for (const opening of [0, 0.5, 1]) {
        cloth.update(opening, 0, 0, false)
        const pos = cloth.geometry.getAttribute('position')
        let valid = true
        for (let row = 0; row <= 32; row++)
          for (let col = 0; col <= columns; col++) {
            const i = row * (columns + 1) + col
            valid &&= Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))
            if (col) valid &&= pos.getX(i) > pos.getX(i - 1)
          }
        expect(valid).toBe(true)
        expect(pos.getX(columns)).toBeCloseTo(
          opening === 0 ? width / 2 : opening === 1 ? width / 12 : (width * 7) / 24,
          5,
        )
        expect(pos.array).toBe(buffer)
      }
      cloth.dispose()
    }
  })
  test('targets reverse from current shape and settle without mesh churn; idle/hidden geometry sleeps', () => {
    const curtain = new SheerCurtain(3.84, 2.62, 0.35, 0)
    const floor = new THREE.Group()
    floor.add(curtain.group)
    expect(curtain.motion.position).toBe(0.35)
    expect(curtain.material.alphaHash).toBe(false)
    expect(curtain.material.transparent).toBe(true)
    expect(curtain.material.depthWrite).toBe(false)
    const positions = curtain.cloth.geometry.getAttribute('position') as THREE.BufferAttribute
    const geometry = curtain.cloth.geometry
    curtain.setTarget(1)
    for (let i = 0; i < 30; i++) curtain.update(1 / 60)
    const before = curtain.motion.position
    curtain.setTarget(0)
    curtain.update(1 / 60)
    expect(Math.abs(curtain.motion.position - before)).toBeLessThan(0.04)
    for (let i = 0; i < 360; i++) curtain.update(1 / 60)
    expect(curtain.motion).toEqual({ position: 0, velocity: 0 })
    const idleVersion = positions.version
    for (let i = 0; i < 120; i++) curtain.update(1 / 60)
    expect(positions.version).toBe(idleVersion)
    floor.visible = false
    curtain.setTarget(0.75)
    for (let i = 0; i < 120; i++) curtain.update(1 / 60)
    expect(positions.version).toBe(idleVersion)
    floor.visible = true
    curtain.update(1 / 60)
    expect(curtain.motion).toEqual({ position: 0.75, velocity: 0 })
    expect(curtain.cloth.geometry).toBe(geometry)
    let disposed = 0
    geometry.addEventListener('dispose', () => disposed++)
    curtain.material.addEventListener('dispose', () => disposed++)
    curtain.dispose()
    curtain.dispose()
    expect(disposed).toBe(2)
    expect(floor.children.length).toBe(0)
  })
  test('external sheer preserves blackout geometry, and dual tracks clear the cloth envelope', () => {
    for (const width of [0.4, 3.84, 6]) {
      const dimensions = sheerHousingDimensions(width)
      const baseline = new Curtain3D({
        material: 'both',
        trackLength: width,
        breathing: false,
        openness: 0.6,
      })
      const adapter = new Curtain3D({
        material: 'both',
        trackLength: width,
        breathing: false,
        openness: 0.6,
        externalSheer: true,
        dualRailZ: dimensions.railZ,
        boxDepthDual: dimensions.dualDepth,
      })
      expect(adapter.curtainGroup.children.length).toBe(2)
      for (let i = 0; i < 2; i++)
        expect(
          (adapter.curtainGroup.children[i] as THREE.Mesh).geometry.getAttribute('position').array,
        ).toEqual(
          (baseline.curtainGroup.children[i] as THREE.Mesh).geometry.getAttribute('position').array,
        )
      const sheer = new SheerCloth(clothDimensions(width, 2.4))
      let maxDepth = 0,
        headerDepth = 0
      const positions = sheer.geometry.getAttribute('position')
      for (let i = 0; i <= 20; i++) {
        sheer.update(i / 20, 0.5, i / 10, false)
        for (let v = 0; v < positions.count; v++) {
          maxDepth = Math.max(maxDepth, Math.abs(positions.getZ(v)))
          if (positions.getY(v) > -0.03)
            headerDepth = Math.max(headerDepth, Math.abs(positions.getZ(v)))
        }
      }
      expect(
        2 * dimensions.railZ - maxDepth - baseline.getCurrentAmplitude() * 1.18,
      ).toBeGreaterThan(0)
      expect(dimensions.dualDepth / 2 - 0.018 - dimensions.railZ - headerDepth).toBeGreaterThan(0)
      // Mount pelmet rear face outside the wall; even deepest cloth stays in front.
      expect(dimensions.dualDepth / 2 + 0.012 - dimensions.railZ - maxDepth).toBeGreaterThan(0)
      expect(dimensions.singleDepth / 2 + 0.012 - maxDepth).toBeGreaterThan(0)
      sheer.dispose()
      baseline.dispose()
      adapter.dispose()
    }
  })
})
