'use client'

import {
  emitter,
  type CeilingEvent,
  type GridEvent,
  type WallEvent,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { placeDevice } from '@vilhil/smarthome'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { markToolCancelConsumed } from '../../../hooks/use-keyboard'
import { sfxEmitter } from '../../../lib/sfx-bus'
import useEditor from '../../../store/use-editor'
import { CursorSphere } from '../shared/cursor-sphere'

// mountType → 吸附面类型映射
const CEILING_MOUNT_TYPES = new Set(['ceiling', 'ceiling_suspended', 'hidden'])
const WALL_MOUNT_TYPES = new Set(['wall', 'wall_switch', 'wall_panel', 'wall_side'])

type Surface = 'floor' | 'wall' | 'ceiling'

/**
 * 计算墙面法线对应的 Y 轴旋转角（让设备朝外）
 * normal[2] > 0 → front face → rotation 0
 * normal[2] < 0 → back face  → rotation π
 */
function wallRotationFromNormal(normal: [number, number, number] | undefined): number {
  if (!normal) return 0
  return normal[2] > 0 ? 0 : Math.PI
}

/** 是否为有效的墙侧面法线（过滤顶面、边缘） */
function isValidWallFace(normal: [number, number, number] | undefined): boolean {
  if (!normal) return false
  return Math.abs(normal[2]) > 0.7
}

/** 吸附到 0.5m 网格 */
function snapHalf(v: number): number {
  return Math.round(v * 2) / 2
}

export const DeviceTool: React.FC = () => {
  const selectedDevice = useEditor((state) => state.selectedDevice)
  const levelId = useViewer((state) => state.selection.levelId)
  const cursorRef = useRef<THREE.Group>(null)
  const [canPlace, setCanPlace] = useState(false)

  // 内部状态用 ref 避免触发 re-render（useFrame 规范同理）
  const surfaceRef = useRef<Surface>('floor')
  const gridPosition = useRef(new THREE.Vector3())
  const rotationY = useRef(0)

  useEffect(() => {
    if (!selectedDevice || !levelId) return

    const mountType = selectedDevice.mountType ?? 'floor'
    const prefersCeiling = CEILING_MOUNT_TYPES.has(mountType)
    const prefersWall = WALL_MOUNT_TYPES.has(mountType)

    // ─── FLOOR 事件 ───────────────────────────────────────────────────────────
    const onGridMove = (event: GridEvent) => {
      if (surfaceRef.current !== 'floor') return
      if (!cursorRef.current) return

      const x = snapHalf(event.position[0])
      const z = snapHalf(event.position[2])

      if (gridPosition.current.x !== x || gridPosition.current.z !== z) {
        sfxEmitter.emit('sfx:grid-snap')
      }

      const y = selectedDevice.defaultH ?? 0
      gridPosition.current.set(x, y, z)
      cursorRef.current.position.set(x, y, z)
      cursorRef.current.rotation.y = rotationY.current
      setCanPlace(true)
    }

    const onGridClick = (_event: GridEvent) => {
      if (surfaceRef.current !== 'floor') return
      if (!canPlace || !levelId) return
      placeDevice(levelId, selectedDevice.catalogId, [
        gridPosition.current.x,
        gridPosition.current.y,
        gridPosition.current.z,
      ], { direction: rotationY.current * (180 / Math.PI) })
      sfxEmitter.emit('sfx:item-place')
    }

    // ─── CEILING 事件 ─────────────────────────────────────────────────────────
    const onCeilingEnter = (event: CeilingEvent) => {
      if (!prefersCeiling) return
      event.stopPropagation()
      surfaceRef.current = 'ceiling'

      const x = snapHalf(event.position[0])
      const z = snapHalf(event.position[2])
      const y = event.position[1] // 天花板底面 Y

      gridPosition.current.set(x, y, z)
      if (cursorRef.current) {
        cursorRef.current.position.set(x, y, z)
        cursorRef.current.rotation.y = rotationY.current
      }
      setCanPlace(true)
    }

    const onCeilingMove = (event: CeilingEvent) => {
      if (!prefersCeiling || surfaceRef.current !== 'ceiling') return
      event.stopPropagation()

      const x = snapHalf(event.position[0])
      const z = snapHalf(event.position[2])
      const y = event.position[1]

      if (gridPosition.current.x !== x || gridPosition.current.z !== z) {
        sfxEmitter.emit('sfx:grid-snap')
      }

      gridPosition.current.set(x, y, z)
      if (cursorRef.current) {
        cursorRef.current.position.set(x, y, z)
      }
      setCanPlace(true)
    }

    const onCeilingLeave = (_event: CeilingEvent) => {
      if (surfaceRef.current !== 'ceiling') return
      surfaceRef.current = 'floor'
      setCanPlace(false)
    }

    const onCeilingClick = (event: CeilingEvent) => {
      if (!prefersCeiling || surfaceRef.current !== 'ceiling') return
      if (!canPlace || !levelId) return
      event.stopPropagation()
      placeDevice(levelId, selectedDevice.catalogId, [
        gridPosition.current.x,
        gridPosition.current.y,
        gridPosition.current.z,
      ], { direction: rotationY.current * (180 / Math.PI) })
      sfxEmitter.emit('sfx:item-place')
    }

    // ─── WALL 事件 ────────────────────────────────────────────────────────────
    const onWallEnter = (event: WallEvent) => {
      if (!prefersWall) return
      if (!isValidWallFace(event.normal)) return
      event.stopPropagation()
      surfaceRef.current = 'wall'

      const x = snapHalf(event.position[0])
      const y = snapHalf(event.position[1])
      const z = snapHalf(event.position[2])
      const rot = wallRotationFromNormal(event.normal)

      gridPosition.current.set(x, y, z)
      rotationY.current = rot
      if (cursorRef.current) {
        cursorRef.current.position.set(x, y, z)
        cursorRef.current.rotation.y = rot
      }
      setCanPlace(true)
    }

    const onWallMove = (event: WallEvent) => {
      if (!prefersWall || surfaceRef.current !== 'wall') return
      if (!isValidWallFace(event.normal)) return
      event.stopPropagation()

      const x = snapHalf(event.position[0])
      const y = snapHalf(event.position[1])
      const z = snapHalf(event.position[2])
      const rot = wallRotationFromNormal(event.normal)

      if (gridPosition.current.x !== x || gridPosition.current.y !== y) {
        sfxEmitter.emit('sfx:grid-snap')
      }

      gridPosition.current.set(x, y, z)
      rotationY.current = rot
      if (cursorRef.current) {
        cursorRef.current.position.set(x, y, z)
        cursorRef.current.rotation.y = rot
      }
    }

    const onWallLeave = (_event: WallEvent) => {
      if (surfaceRef.current !== 'wall') return
      surfaceRef.current = 'floor'
      rotationY.current = 0
      setCanPlace(false)
    }

    const onWallClick = (event: WallEvent) => {
      if (!prefersWall || surfaceRef.current !== 'wall') return
      if (!isValidWallFace(event.normal)) return
      if (!canPlace || !levelId) return
      event.stopPropagation()
      placeDevice(levelId, selectedDevice.catalogId, [
        gridPosition.current.x,
        gridPosition.current.y,
        gridPosition.current.z,
      ], { direction: rotationY.current * (180 / Math.PI) })
      sfxEmitter.emit('sfx:item-place')
    }

    // ─── 键盘 ─────────────────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && surfaceRef.current === 'floor') {
        rotationY.current += Math.PI / 2
        if (cursorRef.current) cursorRef.current.rotation.y = rotationY.current
        sfxEmitter.emit('sfx:item-rotate')
      }
    }

    const onCancel = () => {
      markToolCancelConsumed()
    }

    // 注册所有事件
    emitter.on('grid:move', onGridMove)
    emitter.on('grid:click', onGridClick)
    emitter.on('ceiling:enter', onCeilingEnter)
    emitter.on('ceiling:move', onCeilingMove)
    emitter.on('ceiling:leave', onCeilingLeave)
    emitter.on('ceiling:click', onCeilingClick)
    emitter.on('wall:enter', onWallEnter)
    emitter.on('wall:move', onWallMove)
    emitter.on('wall:leave', onWallLeave)
    emitter.on('wall:click', onWallClick)
    emitter.on('tool:cancel', onCancel)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      emitter.off('grid:move', onGridMove)
      emitter.off('grid:click', onGridClick)
      emitter.off('ceiling:enter', onCeilingEnter)
      emitter.off('ceiling:move', onCeilingMove)
      emitter.off('ceiling:leave', onCeilingLeave)
      emitter.off('ceiling:click', onCeilingClick)
      emitter.off('wall:enter', onWallEnter)
      emitter.off('wall:move', onWallMove)
      emitter.off('wall:leave', onWallLeave)
      emitter.off('wall:click', onWallClick)
      emitter.off('tool:cancel', onCancel)
      window.removeEventListener('keydown', onKeyDown)
      // 离开工具时重置状态
      surfaceRef.current = 'floor'
      setCanPlace(false)
    }
  }, [selectedDevice, levelId, canPlace])

  if (!selectedDevice) return null

  return (
    <group ref={cursorRef}>
      <CursorSphere color={canPlace ? '#22c55e' : '#ef4444'} />
      {/* 旋转方向指示器（仅地板模式显示） */}
      <mesh position={[0.3, 0, 0]} visible={canPlace && surfaceRef.current === 'floor'}>
        <boxGeometry args={[0.2, 0.02, 0.02]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
    </group>
  )
}
