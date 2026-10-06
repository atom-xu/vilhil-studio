import { Euler, Quaternion, Vector3 } from 'three'

type Position = [number, number, number]

/** Convert a level-space curtain anchor into the enclosing device's local frame. */
export function curtainLocalTransform(
  devicePosition: Position,
  deviceRotation: Position,
  anchorPosition: Position,
  anchorRotation: Position,
): { position: Position; quaternion: [number, number, number, number] } {
  const inverse = new Quaternion().setFromEuler(new Euler(...deviceRotation)).invert()
  const position = new Vector3(...anchorPosition)
    .sub(new Vector3(...devicePosition))
    .applyQuaternion(inverse)
  const rotation = inverse.multiply(new Quaternion().setFromEuler(new Euler(...anchorRotation)))
  return { position: position.toArray(), quaternion: rotation.toArray() }
}
