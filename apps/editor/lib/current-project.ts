import { useEffect, useState } from 'react'

export type CurrentProject = { id: string; name: string } | null

const subscribers = new Set<(p: CurrentProject) => void>()
let current: CurrentProject = null

export function setCurrentProject(p: CurrentProject) {
  current = p
  subscribers.forEach((fn) => fn(p))
}

export function getCurrentProject(): CurrentProject {
  return current
}

export function useCurrentProject() {
  const [project, setProject] = useState<CurrentProject>(current)
  useEffect(() => {
    subscribers.add(setProject)
    return () => {
      subscribers.delete(setProject)
    }
  }, [])
  return project
}
