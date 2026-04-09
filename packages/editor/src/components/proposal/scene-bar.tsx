'use client'

import { useScene } from '@pascal-app/core'
import { applyScene } from '@vilhil/smarthome'
import { CheckCircle, Play } from 'lucide-react'
import { useMemo, useState } from 'react'
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
 *
 * S3-T3: 接入 applyScene，批量更新设备状态
 * S3-T4: activeSceneId 追踪当前激活场景，卡片高亮"已激活"
 */
export function SceneBar({ className, scenes = [], onSceneExecute }: SceneBarProps) {
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)

  // Use useShallow to avoid infinite re-renders when nodes object changes reference
  const nodes = useScene(useShallow((s: any) => s.nodes))
  const allNodes = useMemo(() => Object.values(nodes), [nodes])
  const sceneNodes = useMemo(() => allNodes.filter((n: any) => n?.type === 'scene'), [allNodes])

  // 如果没有传入场景，使用场景节点
  const displayScenes: Scene[] =
    scenes.length > 0
      ? scenes
      : sceneNodes.map((n: any) => ({
          id: n.id,
          name: n.name || '场景',
          icon: n.icon,
          description: n.description,
        }))

  const handleExecute = (scene: Scene) => {
    // 调用 applyScene，批量更新设备状态（单个 Zundo 快照，Undo 一步还原）
    const count = applyScene(scene.id)
    if (count > 0 || true) {
      // 无论是否有效果，都标记激活（count=0 可能是空场景或找不到设备）
      setActiveSceneId(scene.id)
    }
    onSceneExecute?.(scene.id)
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
        const isActive = activeSceneId === scene.id
        const icon = scene.icon

        return (
          <button
            key={scene.id}
            className={cn(
              'group relative flex min-w-[100px] items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200',
              'hover:bg-accent/50 active:scale-95',
              isActive
                ? 'bg-violet-500/15 ring-1 ring-violet-500/40'
                : 'hover:bg-accent/50'
            )}
            onClick={() => handleExecute(scene)}
            type="button"
          >
            {/* 场景图标 */}
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base transition-all duration-200',
                isActive
                  ? 'bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.5)]'
                  : 'bg-gradient-to-br from-violet-500 to-fuchsia-500'
              )}
            >
              {icon ? (
                <span>{icon}</span>
              ) : isActive ? (
                <CheckCircle className="h-4 w-4 text-white" />
              ) : (
                <Play className="h-4 w-4 text-white" fill="white" />
              )}
            </div>

            {/* 场景名称 + 激活状态 */}
            <div className="flex flex-col items-start">
              <span
                className={cn(
                  'font-medium text-sm transition-colors',
                  isActive ? 'text-violet-400' : 'text-foreground'
                )}
              >
                {scene.name}
              </span>
              {isActive ? (
                <span className="text-violet-500 text-xs font-medium">已激活</span>
              ) : scene.description ? (
                <span className="text-muted-foreground text-xs">{scene.description}</span>
              ) : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}
