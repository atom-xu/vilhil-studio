'use client'

import { selectionContext, type SelectApi } from '@react-three/postprocessing'
import { useContext, useEffect, useRef } from 'react'
import type { Group, Object3D } from 'three'

/** App adapter for 3.0.4's Select: registration must not depend on its own selected array. */
export function BloomSelect({ enabled = false, children, ...props }: SelectApi) {
  const group = useRef<Group>(null)
  const select = useContext(selectionContext)?.select
  useEffect(() => {
    if (!select || !enabled || !group.current) return
    const meshes: Object3D[] = []
    group.current.traverse((object) => {
      if (object.type === 'Mesh') meshes.push(object)
    })
    if (!meshes.length) return
    select((current) => {
      const added = meshes.filter((mesh) => !current.includes(mesh))
      return added.length ? [...current, ...added] : current
    })
    return () => {
      select((current) => {
        const remaining = current.filter((mesh) => !meshes.includes(mesh))
        return remaining.length === current.length ? current : remaining
      })
    }
  }, [select, enabled, children])
  return <group ref={group} {...props}>{children}</group>
}
