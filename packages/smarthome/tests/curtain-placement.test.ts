import { expect, test } from 'bun:test'
import { Euler, Group, Quaternion, Vector3 } from 'three'
import { curtainLocalTransform } from '../src/renderers/curtain/placement-transform'

test('linked, wall-aligned and unbound curtains apply their level-space anchor exactly once', () => {
  const cases = [
    { position: [1, 1.52, 0], rotation: [0, 0, 0], anchor: [1, 1.52, 0], facing: [0, 0, 0] },
    {
      position: [4, 2, -3],
      rotation: [0, Math.PI / 2, 0],
      anchor: [2, 1.5, 6],
      facing: [0, -Math.PI / 2, 0],
    },
    { position: [4, 2, -3], rotation: [0.2, 0.7, -0.1], anchor: [4, 2, -3], facing: [0, 0.5, 0] },
    {
      position: [-4, 1, 3],
      rotation: [0.2, 0.7, -0.1],
      anchor: [-4, 1, 3],
      facing: [0.2, 0.7, -0.1],
    },
  ] as const
  for (const fixture of cases) {
    const floor = new Group()
    floor.position.set(7, 5.5, -8)
    floor.rotation.y = 0.4
    const device = new Group()
    device.position.fromArray(fixture.position)
    device.rotation.set(...fixture.rotation)
    floor.add(device)
    const local = curtainLocalTransform(
      [...fixture.position],
      [...fixture.rotation],
      [...fixture.anchor],
      [...fixture.facing],
    )
    const curtain = new Group()
    curtain.position.fromArray(local.position)
    curtain.quaternion.fromArray(local.quaternion)
    device.add(curtain)
    floor.updateMatrixWorld(true)
    const expected = floor.localToWorld(new Vector3(...fixture.anchor))
    expect(curtain.getWorldPosition(new Vector3()).distanceTo(expected)).toBeLessThan(1e-10)
    const expectedRotation = floor
      .getWorldQuaternion(new Quaternion())
      .multiply(new Quaternion().setFromEuler(new Euler(...fixture.facing)))
    expect(curtain.getWorldQuaternion(new Quaternion()).angleTo(expectedRotation)).toBeLessThan(
      1e-7,
    )
    // A cloth-local point catches orientation mistakes that comparing centers misses.
    const clothPoint = new Vector3(-1.92, 1.322, 0.3)
    const actualPoint = curtain.localToWorld(clothPoint.clone())
    const expectedPoint = clothPoint
      .applyQuaternion(new Quaternion().setFromEuler(new Euler(...fixture.facing)))
      .add(new Vector3(...fixture.anchor))
      .applyMatrix4(floor.matrixWorld)
    expect(actualPoint.distanceTo(expectedPoint)).toBeLessThan(1e-10)
  }
})
