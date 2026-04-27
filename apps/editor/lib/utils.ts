import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isDevelopment = process.env.NODE_ENV === 'development'
export const isProduction = process.env.NODE_ENV === 'production'

/**
 * 应用根 URL。
 *
 * 来源优先级：
 *   1. NEXT_PUBLIC_APP_URL 环境变量（生产必须设置）
 *   2. PORT 端口的本地地址（开发 fallback）
 *
 * 生产环境请在 .env.production.local / 服务器环境变量里设置：
 *   NEXT_PUBLIC_APP_URL=https://studio.vilhil.cn
 */
export const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  `http://localhost:${process.env.PORT || 3002}`
