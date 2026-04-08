'use client'

import { DeviceNode, emitter, generateId, type GridEvent, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { markToolCancelConsumed } from '../../../hooks/use-keyboard'
import { sfxEmitter } from '../../../lib/sfx-bus'
import useEditor from '../../../store/use-editor'
import { CursorSphere } from '../shared/cursor-sphere'

export const DeviceTool: React.FC = () => {
  const selectedDevice = useEditor((state) => state.selectedDevice)
  const levelId = useViewer((state) => state.selection.levelId)
  const createNode = useScene((state) => state.createNode)
  const cursorRef = useRef<THREE.Group>(null)
  const [canPlace, setCanPlace] = useState(false)
  const gridPosition = useRef(new THREE.Vector3(0, 0, 0))
  const rotationY = useRef(0)

  useEffect(() => {
    if (!selectedDevice || !levelId) return

    const onGridMove = (event: GridEvent) => {
      if (!cursorRef.current) return

      const newX = Math.round(event.position[0] * 2) / 2
      const newZ = Math.round(event.position[2] * 2) / 2

      // Check if position changed for snap sound
      if (gridPosition.current.x !== newX || gridPosition.current.z !== newZ) {
        sfxEmitter.emit('sfx:grid-snap')
      }

      gridPosition.current.set(newX, event.position[1], newZ)
      cursorRef.current.position.set(newX, event.position[1], newZ)
      cursorRef.current.rotation.y = rotationY.current

      // Can place if we have a valid level
      setCanPlace(true)
    }

    const onGridClick = (event: GridEvent) => {
      if (!canPlace || !levelId || !selectedDevice) return

      const deviceNode: Omit<DeviceNode, 'id'> & { id?: string } = {
        object: 'node',
        type: 'device',
        parentId: levelId,
        subsystem: selectedDevice.subsystem as DeviceNode['subsystem'],
        renderType: selectedDevice.renderType,
        mountType: selectedDevice.mountType as DeviceNode['mountType'],
        position: [gridPosition.current.x, gridPosition.current.y + (selectedDevice.defaultH ?? 0), gridPosition.current.z],
        rotation: [0, rotationY.current, 0],
        productId: selectedDevice.catalogId,
        productName: selectedDevice.name,
        brand: selectedDevice.brand,
        params: {},
        state: { on: false },
        showAnimation: true,
        visible: true,
        metadata: {},
      }

      createNode({ node: deviceNode as DeviceNode })
      sfxEmitter.emit('sfx:item-place')
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        rotationY.current += Math.PI / 2
        if (cursorRef.current) {
          cursorRef.current.rotation.y = rotationY.current
        }
        sfxEmitter.emit('sfx:item-rotate')
      }
    }

    const onCancel = () => {
      markToolCancelConsumed()
    }

    emitter.on('grid:move', onGridMove)
    emitter.on('grid:click', onGridClick)
    emitter.on('tool:cancel', onCancel)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      emitter.off('grid:move', onGridMove)
      emitter.off('grid:click', onGridClick)
      emitter.off('tool:cancel', onCancel)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedDevice, levelId, canPlace, createNode])

  if (!selectedDevice) {
    return null
  }

  return (
    <group ref={cursorRef}>
      <CursorSphere color={canPlace ? '#22c55e' : '#ef4444'} />
      {/* Rotation indicator */}
      <mesh position={[0.3, 0, 0]} visible={canPlace}>
        <boxGeometry args={[0.2, 0.02, 0.02]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
    </group>
  )
}
