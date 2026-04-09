/**
 * VilHil 智能设备 3D 模型库 - 模型注册表
 *
 * 设计师维护的模型注册中心
 * 所有新模型必须在此注册才能被系统识别
 */

import type { DeviceModelDefinition, ModelRenderType } from './core/types'
import { lightingModels } from './lighting/downlight'
import { panelModels } from './panel/switch'
import { sensorModels } from './sensor/pir'
import { curtainModels } from './curtain/motor'
import { hvacModels } from './hvac/vent'
import { networkModels } from './network/ap'
import { securityModels } from './security/lock'
import { architectureModels } from './architecture/gateway'

// ═══════════════════════════════════════════════════════════════
// 模型注册表
// ═══════════════════════════════════════════════════════════════

class ModelRegistry {
  private models = new Map<ModelRenderType, DeviceModelDefinition>()

  constructor() {
    this.registerAll()
  }

  private registerAll() {
    // 注册所有子系统模型
    const allModels = [
      ...lightingModels,
      ...panelModels,
      ...sensorModels,
      ...curtainModels,
      ...hvacModels,
      ...networkModels,
      ...securityModels,
      ...architectureModels,
    ]

    for (const model of allModels) {
      if (this.models.has(model.renderType)) {
        console.warn(`[ModelRegistry] 重复的 renderType: ${model.renderType}，将被覆盖`)
      }
      this.models.set(model.renderType, model)
    }

    console.log(`[ModelRegistry] 已注册 ${this.models.size} 个模型`)
  }

  /**
   * 获取模型定义
   */
  get(renderType: ModelRenderType): DeviceModelDefinition | undefined {
    return this.models.get(renderType)
  }

  /**
   * 检查模型是否存在
   */
  has(renderType: ModelRenderType): boolean {
    return this.models.has(renderType)
  }

  /**
   * 获取所有模型
   */
  getAll(): DeviceModelDefinition[] {
    return Array.from(this.models.values())
  }

  /**
   * 获取所有 renderType
   */
  getAllRenderTypes(): ModelRenderType[] {
    return Array.from(this.models.keys())
  }

  /**
   * 按子系统分组获取模型
   */
  getBySubsystem(subsystem: string): DeviceModelDefinition[] {
    const subsystemRenderTypes: Record<string, ModelRenderType[]> = {
      lighting: ['downlight', 'strip', 'pendant', 'wall-light'],
      panel: ['switch-1key', 'switch-2key', 'switch-3key', 'dimmer-knob', 'scene-4key', 'scene-6key', 'thermostat'],
      sensor: ['pir', 'smoke', 'dome', 'door-sensor'],
      curtain: ['curtain-motor', 'blind-motor'],
      hvac: ['vent-4way', 'vent-linear', 'ac-unit'],
      network: ['ap-ceiling', 'ap-wall', 'router'],
      security: ['door-lock', 'camera-bullet'],
      architecture: ['gateway', 'smart-host'],
    }

    const types = subsystemRenderTypes[subsystem] || []
    return types.map((t) => this.models.get(t)).filter((m): m is DeviceModelDefinition => !!m)
  }
}

// ═══════════════════════════════════════════════════════════════
// 导出单例
// ═══════════════════════════════════════════════════════════════

export const modelRegistry = new ModelRegistry()

// ═══════════════════════════════════════════════════════════════
// 便捷函数
// ═══════════════════════════════════════════════════════════════

/**
 * 获取模型定义
 */
export function getModel(renderType: ModelRenderType): DeviceModelDefinition | undefined {
  return modelRegistry.get(renderType)
}

/**
 * 获取模型显示名称
 */
export function getModelDisplayName(renderType: ModelRenderType): string {
  return modelRegistry.get(renderType)?.displayName || renderType
}

/**
 * 获取模型尺寸
 */
export function getModelDimensions(renderType: ModelRenderType): [number, number, number] | undefined {
  return modelRegistry.get(renderType)?.dimensions
}

/**
 * 获取模型默认高度
 */
export function getModelDefaultHeight(renderType: ModelRenderType): number | undefined {
  return modelRegistry.get(renderType)?.defaultHeight
}

/**
 * 获取模型缩略图颜色
 */
export function getModelThumbnailColor(renderType: ModelRenderType): string {
  return modelRegistry.get(renderType)?.thumbnailColor || '#888888'
}

/**
 * 检查模型是否支持动画
 */
export function hasModelAnimation(renderType: ModelRenderType): boolean {
  const model = modelRegistry.get(renderType)
  return model?.parts.some((p) => p.animated) ?? false
}

/**
 * 检查模型是否有覆盖范围可视化
 */
export function hasModelCoverage(renderType: ModelRenderType): boolean {
  return !!modelRegistry.get(renderType)?.coverage
}

/**
 * 获取所有已注册的 renderType 列表
 */
export function getAllModelRenderTypes(): ModelRenderType[] {
  return modelRegistry.getAllRenderTypes()
}

/**
 * 模型统计信息
 */
export function getModelStats(): {
  total: number
  bySubsystem: Record<string, number>
  withAnimations: number
  withCoverage: number
} {
  const all = modelRegistry.getAll()
  return {
    total: all.length,
    bySubsystem: {
      lighting: lightingModels.length,
      panel: panelModels.length,
      sensor: sensorModels.length,
      curtain: curtainModels.length,
      hvac: hvacModels.length,
      network: networkModels.length,
      security: securityModels.length,
      architecture: architectureModels.length,
    },
    withAnimations: all.filter((m) => m.animations && m.animations.length > 0).length,
    withCoverage: all.filter((m) => !!m.coverage).length,
  }
}
