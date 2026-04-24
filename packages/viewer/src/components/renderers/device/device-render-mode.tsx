'use client'

import { createContext, type ReactNode, useContext } from 'react'

/**
 * DeviceRenderMode —— 设备渲染强度上下文
 *
 * - 'base'（默认）：仅渲染 DeviceGeometry（位置/朝向/基础 3D 模型），
 *   无光锥、无粒子、无实时光照 —— 编辑器后台用，保持快速和直接。
 *
 * - 'demo'：在 base 之上叠加 DeviceEffects（9 子系统动画 + LightCone +
 *   LaserScanCone + HvacAirflow 等）—— 演示页用，追求美观流畅。
 *
 * 这是 UI 渲染层的开关，和 useScene / useDeviceState 的数据流完全正交。
 *
 * 扩展第三种模式（如未来的 'walkthrough' 沉浸漫游模式）时：
 * 1. 在 DeviceRenderMode 类型联合中追加新 key。
 * 2. 在 device-renderer.tsx 的渲染分支中增加对应逻辑。
 * 3. 不需要改 Context / Provider / hook，结构保持不变。
 *
 * 引用位置：device-renderer.tsx（渲染分流）、proposal-demo/page.tsx（Provider 入口）。
 */
export type DeviceRenderMode = 'base' | 'demo'

const DeviceRenderModeContext = createContext<DeviceRenderMode>('base')

export function useDeviceRenderMode(): DeviceRenderMode {
  return useContext(DeviceRenderModeContext)
}

interface DeviceRenderModeProviderProps {
  mode: DeviceRenderMode
  children: ReactNode
}

export function DeviceRenderModeProvider({ mode, children }: DeviceRenderModeProviderProps) {
  return <DeviceRenderModeContext.Provider value={mode}>{children}</DeviceRenderModeContext.Provider>
}
