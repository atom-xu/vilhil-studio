'use client'

import { useScene } from '@pascal-app/core'
import { applyScene, subscribeSceneRunStatus, type SceneRunStatus } from '@vilhil/smarthome'
import { CheckCircle, LoaderCircle, Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { cn } from '../../lib/utils'
import { Button } from '../ui/primitives/button'

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
  const [runStatus, setRunStatus] = useState<SceneRunStatus>({
    sceneId: null,
    running: false,
    startedAt: null,
    expectedEndAt: null,
    completedAt: null,
  })

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

  useEffect(() => {
    return subscribeSceneRunStatus((status) => {
      setRunStatus(status)
      if (status.sceneId) setActiveSceneId(status.sceneId)
    })
  }, [])

  const handleExecute = (scene: Scene) => {
    // 调用 applyScene，按 delay / duration 顺序执行
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
        'vh-panel flex items-center gap-2 p-2',
        className,
      )}
    >
      {displayScenes.map((scene) => {
        const isActive = activeSceneId === scene.id
        const isRunning = runStatus.running && runStatus.sceneId === scene.id
        const icon = scene.icon

        return (
          <Button
            key={scene.id}
            className={cn(
              'group relative h-auto min-w-[100px] items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200',
              'hover:bg-accent/50 active:scale-95',
              isActive
                ? 'bg-primary/10 ring-1 ring-primary/40'
                : 'hover:bg-accent/50',
            )}
            onClick={() => handleExecute(scene)}
            type="button"
            variant="ghost"
          >
            {/* 场景图标 */}
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200',
                isRunning || isActive
                  ? 'bg-primary shadow-md'
                  : 'bg-accent/60',
              )}
            >
              {isRunning ? (
                <LoaderCircle className="h-4 w-4 animate-spin text-white" />
              ) : isActive ? (
                <CheckCircle className="h-4 w-4 text-white" />
              ) : (
                <Play className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>

            {/* 场景名称 + 激活状态 */}
            <div className="flex flex-col items-start">
              <span
                className={cn(
                  'font-medium text-sm transition-colors',
                  isRunning || isActive ? 'text-primary' : 'text-foreground'
                )}
              >
                {scene.name}
              </span>
              {isRunning ? (
                <span className="text-primary text-xs font-medium">执行中...</span>
              ) : isActive ? (
                <span className="text-primary text-xs font-medium">已激活</span>
              ) : scene.description ? (
                <span className="text-muted-foreground text-xs">{scene.description}</span>
              ) : null}
            </div>
          </Button>
        )
      })}
    </div>
  )
}
