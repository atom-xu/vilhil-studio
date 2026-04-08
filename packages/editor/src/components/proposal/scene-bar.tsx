'use client'

import { useScene } from '@pascal-app/core'
import { executeScene, useDeviceState } from '@vilhil/smarthome'
import { Play } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { cn } from '../../lib/utils'

interface Scene {
  id: string
  name: string
  icon?: string
  description?: string
}

interface SceneBarProps {
  className?: string
  scenes?: Scene[]
  onSceneExecute?: (sceneId: string) => void
}

/**
 * 场景栏 - 底部场景卡片
 * 用于提案模式，执行智能场景
 */
export function SceneBar({ className, scenes = [], onSceneExecute }: SceneBarProps) {
  const [executingScene, setExecutingScene] = useState<string | null>(null)
  const setDeviceState = useDeviceState((s) => s.setDeviceState)
  // Use useShallow to avoid infinite re-renders when nodes object changes reference
  const nodes = useScene(useShallow((s: any) => s.nodes))
  // Use useMemo to avoid creating new array on every render
  const allNodes = useMemo(() => Object.values(nodes), [nodes])
  const sceneNodes = useMemo(() => allNodes.filter((n: any) => n?.type === 'scene'), [allNodes])

  // 如果没有传入场景，使用场景节点
  const displayScenes: Scene[] =
    scenes.length > 0
      ? scenes
      : sceneNodes.map((n) => ({
          id: n.id,
          name: (n as any).name || '场景',
          icon: (n as any).icon,
          description: (n as any).description,
        }))

  const handleExecute = async (scene: Scene) => {
    if (executingScene) return

    setExecutingScene(scene.id)
    onSceneExecute?.(scene.id)

    // 获取场景节点的效果
    const sceneNode = allNodes.find((n) => n.id === scene.id) as any
    if (sceneNode?.effects) {
      const actions = sceneNode.effects.map((effect: any) => ({
        deviceId: effect.deviceId,
        state: effect.state,
        delay: effect.delay || 0,
      }))
      await executeScene(actions, setDeviceState)
    }

    setExecutingScene(null)
  }

  if (displayScenes.length === 0) return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-2xl border border-border/40 bg-background/95 p-2 shadow-lg backdrop-blur-xl',
        className
      )}
    >
      {displayScenes.map((scene) => {
        const isExecuting = executingScene === scene.id

        return (
          <button
            key={scene.id}
            className={cn(
              'group relative flex min-w-[100px] items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200',
              'hover:bg-accent/50 active:scale-95',
              isExecuting && 'pointer-events-none animate-pulse bg-accent/30'
            )}
            onClick={() => handleExecute(scene)}
            type="button"
          >
            {/* 场景图标 */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500">
              <Play className="h-4 w-4 text-white" fill="white" />
            </div>

            {/* 场景名称 */}
            <div className="flex flex-col items-start">
              <span className="font-medium text-foreground text-sm">{scene.name}</span>
              {scene.description && (
                <span className="text-muted-foreground text-xs">{scene.description}</span>
              )}
            </div>

            {/* 执行中的光晕效果 */}
            {isExecuting && (
              <div className="absolute inset-0 rounded-xl ring-2 ring-violet-500/50 ring-offset-2 ring-offset-background animate-ping" />
            )}
          </button>
        )
      })}
    </div>
  )
}
