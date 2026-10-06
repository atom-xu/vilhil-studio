'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { advanceMotion, CLOTH, createSheerMaterial, SheerCloth } from './cloth'

export interface PreviewParameters {
  target: number
  animate: boolean
  breeze: boolean
  angle: number
  onReady: () => void
  readout: React.RefObject<HTMLOutputElement | null>
}

function Fabric({ target, animate, breeze, onReady, readout }: PreviewParameters) {
  const { gl } = useThree()
  const group = useRef<THREE.Group>(null)
  const cloth = useRef<SheerCloth | null>(null)
  const motion = useRef({ position: target, velocity: 0 })
  const elapsed = useRef(0)
  const lastReadout = useRef(-1)

  useEffect(() => {
    const parent = group.current!
    const model = new SheerCloth()
    const material = createSheerMaterial()
    const context = gl.getContext()
    const samples = context.getParameter(context.SAMPLES) as number
    gl.domElement.dataset.samples = String(samples)
    if (samples === 0) {
      material.alphaToCoverage = false
      material.alphaHash = true
    }
    gl.domElement.dataset.coverage = samples > 0 ? 'msaa' : 'hash'
    const left = new THREE.Mesh(model.geometry, material)
    const right = new THREE.Mesh(model.geometry, material)
    left.position.set(-CLOTH.halfWidth, CLOTH.top, 0.22)
    right.position.set(CLOTH.halfWidth, CLOTH.top, 0.22)
    right.scale.x = -1
    left.name = 'sheer-left'
    right.name = 'sheer-right'
    parent.add(left, right)
    cloth.current = model
    onReady()
    return () => {
      cloth.current = null
      parent.remove(left, right)
      model.dispose()
      material.dispose()
    }
  }, [gl, onReady])

  useEffect(() => {
    // UI sampling stays outside useFrame; no React render on each animation frame.
    const refresh = () => {
      const percent = Math.round(motion.current.position * 100)
      const moving = motion.current.position !== target
      const key = percent * 2 + Number(moving)
      if (readout.current && lastReadout.current !== key) {
        lastReadout.current = key
        readout.current.value = moving ? `开合中 · ${percent}%` : `已到位 · ${percent}%`
        readout.current.dataset.position = String(motion.current.position)
        readout.current.dataset.moving = String(moving)
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 100)
    return () => window.clearInterval(timer)
  }, [target, readout])

  useFrame((_, dt) => {
    if (!cloth.current) return
    if (animate) advanceMotion(motion.current, target, dt)
    else {
      motion.current.position = target
      motion.current.velocity = 0
    }
    elapsed.current += Math.min(dt, 0.05)
    cloth.current.update(motion.current.position, motion.current.velocity, elapsed.current, breeze)
  })
  return <group ref={group} />
}

function Box({
  size,
  position,
  color,
  roughness = 0.9,
}: {
  size: [number, number, number]
  position: [number, number, number]
  color: string
  roughness?: number
}) {
  const args = useMemo(() => size, [size[0], size[1], size[2]])
  return (
    <mesh position={position} receiveShadow castShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  )
}

function Room() {
  return (
    <group>
      <hemisphereLight args={['#fffdf5', '#a5a397', 1.1]} />
      <directionalLight
        position={[-3, 6, 5]}
        intensity={1.1}
        color="#fff6e4"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-normalBias={0.02}
        shadow-radius={4}
      />
      <directionalLight position={[1, 3, -2]} intensity={0.8} color="#e3f0f5" />
      {/* A single wall with a true opening; no coplanar transparent glass behind the sheer. */}
      <Box size={[1.25, 5.4, 0.24]} position={[-2.525, 2.7, -0.13]} color="#ddd8cc" />
      <Box size={[1.25, 5.4, 0.24]} position={[2.525, 2.7, -0.13]} color="#ddd8cc" />
      <Box size={[3.8, 2.56, 0.24]} position={[0, 4.12, -0.13]} color="#ddd8cc" />
      <Box size={[3.8, 0.32, 0.24]} position={[0, 0.16, -0.13]} color="#ddd8cc" />
      <Box size={[6.6, 0.1, 5.6]} position={[0, -0.05, 1.2]} color="#bcb09a" />
      <Box size={[6.32, 0.09, 0.045]} position={[0, 0.045, 0.035]} color="#e8e2d6" />
      {/* Soft outdoor backdrop, visible through both fibres and the centre opening. */}
      <Box size={[7, 5, 0.08]} position={[0, 2, -1.2]} color="#bfd0ce" />
      <Box size={[7, 0.7, 0.1]} position={[0, 0.5, -1.12]} color="#9aa897" />
      <Box size={[0.075, 2.5, 0.16]} position={[-1.86, 1.58, -0.04]} color="#7c8178" />
      <Box size={[0.075, 2.5, 0.16]} position={[1.86, 1.58, -0.04]} color="#7c8178" />
      <Box size={[3.78, 0.07, 0.16]} position={[0, 2.8, -0.04]} color="#7c8178" />
      <Box size={[3.78, 0.07, 0.16]} position={[0, 0.36, -0.04]} color="#7c8178" />
      <Box size={[0.042, 2.43, 0.1]} position={[0, 1.58, -0.04]} color="#7c8178" />
      <Box size={[3.72, 0.032, 0.1]} position={[0, 1.23, -0.04]} color="#7c8178" />
      <Box size={[3.98, 0.065, 0.42]} position={[0, 0.32, 0.045]} color="#e9e5dc" />
      <Box size={[4.16, 0.16, 0.32]} position={[0, 2.93, 0.19]} color="#ede7dd" />
      <Box size={[3.94, 0.02, 0.045]} position={[0, 2.845, 0.22]} color="#b0a99c" />
      {/* Low relief floorboard seams give scale without external assets. */}
      {[-2.7, -2.1, -1.5, -0.9, -0.3, 0.3, 0.9, 1.5, 2.1, 2.7].map((x) => (
        <Box key={x} size={[0.006, 0.002, 5.5]} position={[x, 0.002, 1.2]} color="#afa28e" />
      ))}
    </group>
  )
}

function Camera({ angle }: { angle: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const distance = size.width / size.height < 1.15 ? 9.8 : 7.8
    camera.position.set(Math.sin(angle) * distance, 2.5, Math.cos(angle) * distance)
    camera.lookAt(0, 1.57, 0)
    camera.updateProjectionMatrix()
  }, [camera, angle, size.width, size.height])
  return null
}

export default function CurtainStage(parameters: PreviewParameters) {
  return (
    <Canvas
      shadows="percentage"
      dpr={1.25}
      camera={{ fov: 38, near: 0.1, far: 40 }}
      onCreated={({ gl }) => {
        gl.shadowMap.autoUpdate = false
        gl.shadowMap.needsUpdate = true
      }}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
    >
      <color attach="background" args={['#e9e6df']} />
      <Camera angle={parameters.angle} />
      <Room />
      <Fabric {...parameters} />
    </Canvas>
  )
}
