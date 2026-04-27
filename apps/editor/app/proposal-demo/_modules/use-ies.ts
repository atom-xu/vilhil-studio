'use client'

/**
 * useIES —— 加载 IES 配光曲线并缓存为 DataTexture
 *
 * Three.js 的 IESLoader（在 examples/jsm/loaders/IESLoader.js）异步从 URL 拉
 * IES 文本，解析后生成一张 sampled 1D DataTexture（rgba 32-bit float）。
 * 这张贴图直接挂到 SpotLight.iesMap 上即可。
 *
 * 缓存策略：同一个 IES 文件被多盏灯引用是常态（一个项目几十盏筒灯走同一个
 * Aqara T2 IES）。模块级 Map 按 url 去重，全部并发请求合并成一次解析。
 */

import { useEffect, useState } from 'react'
import type { DataTexture } from 'three'
import { IESLoader } from 'three/examples/jsm/loaders/IESLoader.js'

const cache = new Map<string, Promise<DataTexture>>()

function loadIES(url: string): Promise<DataTexture> {
  const hit = cache.get(url)
  if (hit) return hit
  const p = new Promise<DataTexture>((resolve, reject) => {
    new IESLoader().load(
      url,
      (tex: DataTexture) => resolve(tex),
      undefined,
      (err) => reject(err),
    )
  })
  cache.set(url, p)
  return p
}

/**
 * Hook：传入 IES 路径（null 表示这盏灯不上 IES），返回已加载的 DataTexture
 * 或 null（未加载完 / 无 IES / 失败）。
 *
 * 加载失败不会抛错（IES 是"锦上添花"，缺了让 SpotLight 走默认数学锥即可），
 * 只在 console.warn。
 */
export function useIES(path: string | null): DataTexture | null {
  const [tex, setTex] = useState<DataTexture | null>(null)

  useEffect(() => {
    if (!path) {
      setTex(null)
      return
    }
    let alive = true
    loadIES(path)
      .then((t) => {
        if (alive) setTex(t)
      })
      .catch((err) => {
        // 静默降级 —— 没有 IES 仍然能用，只是光锥是数学完美的
        console.warn('[useIES] load failed', path, err)
        if (alive) setTex(null)
      })
    return () => {
      alive = false
    }
  }, [path])

  return tex
}
