/**
 * 设备状态管理
 *
 * 管理所有设备的运行时状态（开关、亮度、温度等）
 * 使用 Zustand 实现跨组件状态共享
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { DeviceState, Subsystem } from '@pascal-app/core'

// ═══════════════════════════════════════════════════════════════
// 状态定义
// ═══════════════════════════════════════════════════════════════

interface DeviceStateEntry {
  on?: boolean
  brightness?: number
  colorTemp?: number
  color?: string
  position?: number // 窗帘位置 0-100
  angle?: number // 百叶角度 0-90
  targetTemp?: number // 目标温度
  currentTemp?: number // 当前温度
  mode?: 'cool' | 'heat' | 'fan' | 'auto' | 'dry' // HVAC 模式
  fanSpeed?: 'low' | 'medium' | 'high' | 'auto'
  locked?: boolean // 门锁状态
  triggered?: boolean // 传感器触发状态
  signalStrength?: number // 信号强度
  [key: string]: any
}

interface DeviceStateStore {
  // 设备状态映射表 deviceId -> state
  deviceStates: Record<string, DeviceStateEntry>

  // 子系统显隐状态
  visibleSubsystems: Record<Subsystem, boolean>

  // 当前选中的子系统（用于过滤显示）
  selectedSubsystem: Subsystem | null

  // 动画效果开关
  animationsEnabled: boolean

  // 覆盖范围显示
  showCoverage: boolean

  // Actions
  setDeviceState: (deviceId: string, state: Partial<DeviceStateEntry>) => void
  getDeviceState: (deviceId: string) => DeviceStateEntry
  toggleDevice: (deviceId: string) => void
  toggleSubsystem: (subsystem: Subsystem) => void
  setSubsystemVisible: (subsystem: Subsystem, visible: boolean) => void
  selectSubsystem: (subsystem: Subsystem | null) => void
  setAnimationsEnabled: (enabled: boolean) => void
  setShowCoverage: (show: boolean) => void
  resetAllStates: () => void
}

// ═══════════════════════════════════════════════════════════════
// 默认状态
// ═══════════════════════════════════════════════════════════════

const defaultVisibleSubsystems: Record<Subsystem, boolean> = {
  architecture: true,
  lighting: true,
  panel: true,
  sensor: true,
  curtain: true,
  hvac: true,
  av: true,
  security: true,
  network: true,
}

const defaultDeviceState: DeviceStateEntry = {
  on: false,
  brightness: 100,
  position: 0,
  angle: 0,
  targetTemp: 24,
  locked: true,
  triggered: false,
}

// ═══════════════════════════════════════════════════════════════
// Zustand Store
// ═══════════════════════════════════════════════════════════════

export const useDeviceState = create<DeviceStateStore>()(
  devtools(
    (set, get) => ({
      // State
      deviceStates: {},
      visibleSubsystems: { ...defaultVisibleSubsystems },
      selectedSubsystem: null,
      animationsEnabled: true,
      showCoverage: false,

      // Actions
      setDeviceState: (deviceId, state) =>
        set((store) => ({
          deviceStates: {
            ...store.deviceStates,
            [deviceId]: { ...store.deviceStates[deviceId], ...state },
          },
        })),

      getDeviceState: (deviceId) =>
        get().deviceStates[deviceId] ?? { ...defaultDeviceState },

      toggleDevice: (deviceId) => {
        const current = get().deviceStates[deviceId]?.on ?? false
        get().setDeviceState(deviceId, { on: !current })
      },

      toggleSubsystem: (subsystem) =>
        set((store) => ({
          visibleSubsystems: {
            ...store.visibleSubsystems,
            [subsystem]: !store.visibleSubsystems[subsystem],
          },
        })),

      setSubsystemVisible: (subsystem, visible) =>
        set((store) => ({
          visibleSubsystems: {
            ...store.visibleSubsystems,
            [subsystem]: visible,
          },
        })),

      selectSubsystem: (subsystem) =>
        set({ selectedSubsystem: subsystem }),

      setAnimationsEnabled: (enabled) =>
        set({ animationsEnabled: enabled }),

      setShowCoverage: (show) =>
        set({ showCoverage: show }),

      resetAllStates: () =>
        set({
          deviceStates: {},
          visibleSubsystems: { ...defaultVisibleSubsystems },
          selectedSubsystem: null,
        }),
    }),
    { name: 'DeviceStateStore' }
  )
)

// ═══════════════════════════════════════════════════════════════
// 便捷 Hook
// ═══════════════════════════════════════════════════════════════

/** 获取单个设备状态 */
export function useDevice(deviceId: string | null) {
  const deviceStates = useDeviceState((s) => s.deviceStates)
  const setDeviceState = useDeviceState((s) => s.setDeviceState)

  if (!deviceId) {
    return { state: null, setState: () => {} }
  }

  return {
    state: deviceStates[deviceId] ?? { ...defaultDeviceState },
    setState: (state: Partial<DeviceStateEntry>) =>
      setDeviceState(deviceId, state),
  }
}

/** 获取子系统可见性 */
export function useSubsystemVisibility(subsystem: Subsystem) {
  return useDeviceState((s) => s.visibleSubsystems[subsystem])
}

/** 切换子系统显隐 */
export function useToggleSubsystem() {
  return useDeviceState((s) => s.toggleSubsystem)
}

// ═══════════════════════════════════════════════════════════════
// 场景执行
// ═══════════════════════════════════════════════════════════════

interface SceneAction {
  deviceId: string
  state: Partial<DeviceStateEntry>
  delay: number // 延迟（毫秒）
}

/** 执行场景 */
export async function executeScene(
  actions: SceneAction[],
  setDeviceState: (deviceId: string, state: Partial<DeviceStateEntry>) => void
) {
  for (const action of actions) {
    if (action.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, action.delay))
    }
    setDeviceState(action.deviceId, action.state)
  }
}
