'use client'

// 扩容触发线：当 effects 总数 > 15 或 device-geometry renderType > 40 时，
// 必须拆分为 registry 架构。参考 docs/DEVICE-SPEC-DESIGN.md 决策 1。

import { type DeviceNode, useScene } from '@pascal-app/core'
import { useSelectedSubsystem } from '@vilhil/smarthome'
import {
  APCoverage,
  ArchitectureHub,
  CurtainContainer,
  HvacAirflow,
  HvacRibbonFlow,
  LaserScanCone,
  LightCone,
  PIRCoverage,
  SpeakerWaves,
} from './animations'
import { DeviceIndicator } from './device-indicator'
import { DeviceLight } from './device-light'

/**
 * DeviceEffects —— 演示页专用的设备动态效果层
 *
 * 所有会"动"的东西：
 *   - 状态光晕（DeviceIndicator）
 *   - 场景光照（DeviceLight）
 *   - 光锥（LightCone）
 *   - 覆盖圆环（APCoverage / PIRCoverage）
 *   - 激光扫描锥（LaserScanCone）
 *   - 空调气流（HvacAirflow / HvacRibbonFlow）
 *   - 窗帘组件（CurtainContainer）
 *   - 音箱音波（SpeakerWaves）
 *   - 架构粒子环（ArchitectureHub）
 *
 * 编辑器不 import 这个组件 —— 保持编辑器"建模工具"的定位，
 * 所有性能开销都只在演示页上，和真实设备接入（未来）一个入口。
 */

interface DeviceEffectsProps {
  node: DeviceNode
  /** 是否被当前聚焦子系统选中（非选中时降强度而非隐藏） */
  isFocusedBySubsystem?: boolean
}

export const DeviceEffects = ({ node, isFocusedBySubsystem }: DeviceEffectsProps) => {
  const selectedSubsystem = useSelectedSubsystem()
  const focused =
    isFocusedBySubsystem ??
    (selectedSubsystem === null || selectedSubsystem === node.subsystem)

  // 合并为单一订阅，避免两次 selector 遍历（每次 store 变化只触发一次重渲染）
  const { deviceState, deviceParams } = useScene((state) => {
    const devNode = state.nodes[node.id] as DeviceNode | undefined
    return {
      deviceState: devNode?.state as Record<string, unknown> | undefined,
      deviceParams: devNode?.params,
    }
  })

  const isOn = (deviceState?.on as boolean) ?? false

  return (
    <>
      {/* Status indicator (colored halo) */}
      <DeviceIndicator
        isOn={isOn}
        subsystem={node.subsystem}
        showAnimation={node.showAnimation}
      />

      {/* Light emission for lighting devices
          always rendered for lighting devices, brightness=0 when off.
          DeviceLight internally lerps brightness & colorTemp, giving smooth
          fade-in / fade-out. No Zustand writes during animation. */}
      {node.subsystem === 'lighting' && (
        <DeviceLight
          brightness={isOn ? ((deviceState?.brightness as number | undefined) ?? 100) : 0}
          color={(deviceState?.color as string | undefined) ?? '#ffffff'}
          colorTemp={deviceState?.colorTemp as number | undefined}
          renderType={node.renderType}
        />
      )}

      {/* Coverage visualization for sensors/network */}
      {node.subsystem === 'network' && deviceParams?.coverageRadius && (
        <APCoverage radius={deviceParams.coverageRadius as number} position={[0, 0, 0]} />
      )}
      {node.subsystem === 'sensor' && node.renderType === 'pir' && (
        <PIRCoverage
          radius={
            (deviceState?.coverageRadius as number | undefined) ??
            (deviceParams?.coverageRadius as number | undefined) ??
            5
          }
          position={[0, 0, 0]}
          triggered={Boolean(deviceState?.triggered)}
        />
      )}

      {/* Light cone — always rendered, brightness=0 when off for smooth fade-out */}
      {node.subsystem === 'lighting' && (
        <LightCone
          position={[0, 0, 0]}
          brightness={isOn ? ((deviceState?.brightness as number) ?? 100) / 100 : 0}
          beamAngle={(deviceParams?.beamAngle as number) ?? 30}
          height={node.position[1]}
        />
      )}

      {/* 安防摄像头 FOV —— 激光扫描锥 */}
      {node.subsystem === 'security' &&
        (node.renderType === 'dome' || node.renderType === 'camera-bullet') && (
          <LaserScanCone
            position={[0, 0, 0]}
            fovDeg={
              (deviceState?.coverageAngle as number | undefined) ??
              (deviceParams?.coverageAngle as number | undefined) ??
              90
            }
            range={
              (deviceState?.coverageRadius as number | undefined) ??
              (deviceParams?.coverageRadius as number | undefined) ??
              5
            }
            rotationY={((deviceParams?.direction as number | undefined) ?? 0) * (Math.PI / 180)}
            color="#f59e0b"
            intensity={focused ? 1 : 0.25}
          />
        )}

      {/* HVAC airflow */}
      {node.subsystem === 'hvac' && node.renderType === 'vent-4way' && (
        <HvacAirflow
          position={[0, 0, 0]}
          mode={
            (deviceState?.mode as 'cold' | 'hot' | 'off' | undefined) ?? (isOn ? 'cold' : 'off')
          }
          intensity={isOn ? 1 : 0}
          height={node.position[1]}
        />
      )}
      {node.subsystem === 'hvac' && node.renderType === 'ac-wall' && (
        <HvacRibbonFlow
          position={[0, 0, 0]}
          mode={
            (deviceState?.mode as 'cold' | 'hot' | 'off' | undefined) ?? (isOn ? 'cold' : 'off')
          }
          intensity={isOn ? 1 : 0}
        />
      )}

      {/* 窗帘：4 种类型 + 多层 + 窗户关联 */}
      {node.subsystem === 'curtain' && <CurtainContainer node={node} />}

      {/* 影音音箱：音波环 */}
      {node.subsystem === 'av' && node.renderType === 'smart-speaker' && (
        <SpeakerWaves
          position={[0, 0.005, 0]}
          intensity={isOn ? 1 : 0}
          volume={(deviceState?.volume as number | undefined) ?? 60}
          playing={isOn}
        />
      )}

      {/* 架构：KNX（黄） / 智能主机（蓝） */}
      {node.subsystem === 'architecture' && (
        <ArchitectureHub
          position={[0, 0, 0]}
          intensity={isOn ? 1 : 0.25}
          color={node.renderType === 'knx' ? '#d4a853' : '#4ea8ff'}
        />
      )}
    </>
  )
}
