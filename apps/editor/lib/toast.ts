import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info'
export type ToastItem = { id: string; message: string; type: ToastType }

const subscribers = new Set<(items: ToastItem[]) => void>()
let items: ToastItem[] = []

function publish() {
  const snapshot = [...items]
  subscribers.forEach((fn) => fn(snapshot))
}

export function toast(message: string, type: ToastType = 'info', duration = 3500) {
  const id = Math.random().toString(36).slice(2, 9)
  items = [...items, { id, message, type }]
  publish()
  setTimeout(() => {
    items = items.filter((i) => i.id !== id)
    publish()
  }, duration)
}

export function useToastItems() {
  const [list, setList] = useState<ToastItem[]>([])
  useEffect(() => {
    subscribers.add(setList)
    return () => {
      subscribers.delete(setList)
    }
  }, [])
  return list
}
