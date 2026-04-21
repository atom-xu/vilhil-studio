'use client'

import { useScene } from '@pascal-app/core'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { fetchProject } from '@/lib/project-api'

export function ProjectLoader() {
  const searchParams = useSearchParams()
  const projectIdFromUrl = searchParams.get('project')

  useEffect(() => {
    if (!projectIdFromUrl) return

    let cancelled = false

    fetchProject(projectIdFromUrl)
      .then((result) => {
        if (cancelled) return
        const { nodes, rootNodeIds } = result.project.data as {
          nodes: Record<string, any>
          rootNodeIds: string[]
        }
        useScene.getState().setScene(nodes, rootNodeIds as any)
        // 清理 URL 参数，避免刷新时重复加载
        window.history.replaceState({}, '', window.location.pathname)
      })
      .catch((err) => {
        console.error('[Load Project]', err)
        alert(`项目加载失败：${err.message}`)
      })

    return () => {
      cancelled = true
    }
  }, [projectIdFromUrl])

  return null
}
