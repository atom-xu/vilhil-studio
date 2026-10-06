import { describe, expect, test } from 'bun:test'
import {
  advanceMotion,
  CLOTH,
  createSheerMaterial,
  foldWidth,
  SheerCloth,
} from '../apps/editor/app/curtain-lab/cloth'

const widthAt = (openness: number) =>
  Array.from({ length: CLOTH.folds }, (_, fold) => foldWidth(fold, openness)).reduce(
    (a, b) => a + b,
    0,
  )

describe('independent sheer fixture', () => {
  test('closed edges meet; half-open reveals the window; open retains both bunches', () => {
    expect(widthAt(0)).toBeCloseTo(CLOTH.halfWidth, 6)
    expect(widthAt(0.5)).toBeCloseTo((CLOTH.halfWidth + CLOTH.bunchWidth) / 2, 6)
    expect(widthAt(1)).toBeCloseTo(CLOTH.bunchWidth, 6)
    expect(foldWidth(0, 0.5)).toBeGreaterThan(foldWidth(CLOTH.folds - 1, 0.5))
  })
  test('opening has no self-intersection in x, no NaNs, and no mesh/buffer churn', () => {
    const cloth = new SheerCloth()
    const geometry = cloth.geometry
    const positions = geometry.getAttribute('position')
    const buffer = positions.array
    const columns = CLOTH.folds * CLOTH.segmentsPerFold
    for (let step = 0; step <= 100; step++) {
      cloth.update(step / 100, 0.3, step / 10, true)
      let valid = true
      for (let row = 0; row <= CLOTH.rows; row++) {
        for (let col = 0; col <= columns; col++) {
          const i = row * (columns + 1) + col
          valid &&= Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))
          if (col) valid &&= positions.getX(i) > positions.getX(i - 1)
        }
      }
      expect(valid).toBe(true)
    }
    expect(cloth.geometry).toBe(geometry)
    expect(positions.array).toBe(buffer)
    cloth.dispose()
  })
  test('individual fold arc lengths remain within 2% at the stationary header', () => {
    const cloth = new SheerCloth()
    const positions = cloth.geometry.getAttribute('position')
    const expectedLength = (CLOTH.halfWidth * 1.85) / CLOTH.folds
    for (const openness of [0, 0.5, 1]) {
      cloth.update(openness, 0, 0, false)
      for (let fold = 0; fold < CLOTH.folds; fold++) {
        let length = 0
        for (let vertex = 1; vertex <= CLOTH.segmentsPerFold; vertex++) {
          const i = fold * CLOTH.segmentsPerFold + vertex
          length += Math.hypot(
            positions.getX(i) - positions.getX(i - 1),
            positions.getZ(i) - positions.getZ(i - 1),
          )
        }
        expect(Math.abs(length / expectedLength - 1)).toBeLessThan(0.02)
      }
    }
    cloth.dispose()
  })
  test('bottom lags a moving header, then returns to the exact static endpoint', () => {
    const cloth = new SheerCloth()
    const positions = cloth.geometry.getAttribute('position')
    const columns = CLOTH.folds * CLOTH.segmentsPerFold
    cloth.update(0.5, 0.3, 2, false)
    expect(positions.getX(positions.count - 1)).toBeGreaterThan(positions.getX(columns))
    cloth.update(1, 0, 0, false)
    const snapshot = positions.array.slice()
    cloth.update(0, 0, 0, false)
    cloth.update(1, 0, 8, false)
    expect(positions.array).toEqual(snapshot)
    cloth.dispose()
  })
  test('motion reverses continuously and reaches exact endpoints at different frame rates', () => {
    for (const rate of [24, 60, 120]) {
      const motion = { position: 0, velocity: 0 }
      for (let frame = 0; frame < rate; frame++) advanceMotion(motion, 1, 1 / rate)
      const before = motion.position
      advanceMotion(motion, 0, 1 / rate)
      expect(Math.abs(motion.position - before)).toBeLessThan(0.04)
      for (let frame = 0; frame < rate * 5; frame++) advanceMotion(motion, 0, 1 / rate)
      expect(motion).toEqual({ position: 0, velocity: 0 })
      for (let frame = 0; frame < rate * 5; frame++) advanceMotion(motion, 1, 1 / rate)
      expect(motion).toEqual({ position: 1, velocity: 0 })
    }
  })
  test('low frame rates preserve wall-clock motion duration', () => {
    const slow = { position: 0, velocity: 0 }
    const fast = { position: 0, velocity: 0 }
    for (let frame = 0; frame < 5; frame++) advanceMotion(slow, 1, 0.2)
    for (let frame = 0; frame < 60; frame++) advanceMotion(fast, 1, 1 / 60)
    expect(slow.position).toBeCloseTo(fast.position, 8)
    expect(slow.velocity).toBeCloseTo(fast.velocity, 8)
  })
  test('sheer coverage participates in depth and owned resources dispose once', () => {
    const material = createSheerMaterial()
    const cloth = new SheerCloth()
    expect(material.transparent).toBe(false)
    expect(material.depthWrite).toBe(true)
    expect(material.alphaToCoverage).toBe(true)
    expect(material.opacity).toBeGreaterThan(0)
    expect(material.opacity).toBeLessThan(1)
    let released = 0
    material.addEventListener('dispose', () => released++)
    cloth.geometry.addEventListener('dispose', () => released++)
    material.dispose()
    cloth.dispose()
    expect(released).toBe(2)
  })
})
