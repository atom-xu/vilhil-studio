'use client'

import { useScene } from '@pascal-app/core'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { setCurrentProject } from '@/lib/current-project'
import { fetchProject } from '@/lib/project-api'
import { toast } from '@/lib/toast'

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
        setCurrentProject({ id: result.project.id, name: result.project.name })
        window.history.replaceState({}, '', window.location.pathname)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[Load Project]', err)
        toast(`项目加载失败：${err.message}`, 'error')
      })

    return () => {
      cancelled = true
    }
  }, [projectIdFromUrl])

  return null
}
