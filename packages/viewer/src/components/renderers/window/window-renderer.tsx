import { useRegistry, type WindowNode } from '@pascal-app/core'
import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { createMaterial, DEFAULT_WINDOW_MATERIAL } from '../../../lib/materials'

/** Semi-transparent ghost shown while the window is being drawn (transient draft). */
const GHOST_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x2d_7f_f9,   // brand blue
  transparent: true,
  opacity: 0.15,
  depthWrite: false,
  side: THREE.DoubleSide,
})

export const WindowRenderer = ({ node }: { node: WindowNode }) => {
  const ref = useRef<Mesh>(null!)

  useRegistry(node.id, 'window', ref)
  const handlers = useNodeEvents(node, 'window')
  const isTransient = !!(node.metadata as Record<string, unknown> | null)?.isTransient

  const material = useMemo(() => {
    const mat = node.material
    if (!mat) return DEFAULT_WINDOW_MATERIAL
    return createMaterial(mat)
  }, [node.material, node.material?.preset, node.material?.properties, node.material?.texture])

  return (
    <mesh
      castShadow={!isTransient}
      material={isTransient ? GHOST_MATERIAL : material}
      position={node.position}
      receiveShadow={!isTransient}
      ref={ref}
      rotation={node.rotation}
      visible={node.visible}
      {...(isTransient ? {} : handlers)}
    >
      {isTransient ? (
        <boxGeometry args={[node.width, node.height, 0.07]} />
      ) : (
        <boxGeometry args={[0, 0, 0]} />
      )}
    </mesh>
  )
}
