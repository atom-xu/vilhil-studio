'use client'

import { Icon } from '@iconify/react'
import { emitter } from '@pascal-app/core'
import Image from 'next/image'
import useEditor from '../../../store/use-editor'
import { ActionButton } from './action-button'

export function CameraActions() {
  const goToTopView = () => {
    emitter.emit('camera-controls:top-view')
  }

  const orbitCW = () => {
    emitter.emit('camera-controls:orbit-cw')
  }

  const orbitCCW = () => {
    emitter.emit('camera-controls:orbit-ccw')
  }

  const enterStreetView = () => {
    useEditor.getState().setFirstPersonMode(true)
  }

  return (
    <div className="flex items-center gap-1">
      {/* Orbit CCW */}
      <ActionButton
        className="group hover:bg-white/5"
        label="向左环绕"
        onClick={orbitCCW}
        size="icon"
        variant="ghost"
      >
        <Image
          alt="向左环绕"
          className="h-[28px] w-[28px] -scale-x-100 object-contain opacity-70 transition-opacity group-hover:opacity-100"
          height={28}
          src="/icons/rotate.png"
          width={28}
        />
      </ActionButton>

      {/* Orbit CW */}
      <ActionButton
        className="group hover:bg-white/5"
        label="向右环绕"
        onClick={orbitCW}
        size="icon"
        variant="ghost"
      >
        <Image
          alt="向右环绕"
          className="h-[28px] w-[28px] object-contain opacity-70 transition-opacity group-hover:opacity-100"
          height={28}
          src="/icons/rotate.png"
          width={28}
        />
      </ActionButton>

      {/* Top View */}
      <ActionButton
        className="group hover:bg-white/5"
        label="顶视图"
        onClick={goToTopView}
        size="icon"
        variant="ghost"
      >
        <Image
          alt="顶视图"
          className="h-[28px] w-[28px] object-contain opacity-70 transition-opacity group-hover:opacity-100"
          height={28}
          src="/icons/topview.png"
          width={28}
        />
      </ActionButton>

      {/* Street View */}
      <ActionButton
        className="group hover:bg-white/5"
        label="街景视图"
        onClick={enterStreetView}
        size="icon"
        variant="ghost"
      >
        <Icon
          className="opacity-70 transition-opacity group-hover:opacity-100"
          color="currentColor"
          height={22}
          icon="mdi:walk"
          width={22}
        />
      </ActionButton>
    </div>
  )
}
