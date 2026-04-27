/**
 * 简单内存 rate limiter — 适用于单实例 / 低并发内测场景
 *
 * ⚠️  Vercel 多实例下不共享状态（各 worker 独立计数）。
 *    生产规模扩大后请替换为 @upstash/ratelimit + Redis：
 *    https://upstash.com/docs/redis/sdks/ratelimit/overview
 */

interface Window {
  count: number
  windowStart: number
}

const store = new Map<string, Window>()

interface RateLimitResult {
  success: boolean
  /** 距当前窗口重置的毫秒数 */
  retryAfterMs: number
}

/**
 * 检查 key 是否超出限制。
 *
 * @param key        限速 key，通常为 "route:ip"
 * @param limit      窗口内最大请求数
 * @param windowMs   窗口时长（毫秒）
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const existing = store.get(key)

  if (!existing || now - existing.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now })
    return { success: true, retryAfterMs: 0 }
  }

  existing.count++
  const retryAfterMs = windowMs - (now - existing.windowStart)

  if (existing.count > limit) {
    return { success: false, retryAfterMs }
  }

  return { success: true, retryAfterMs: 0 }
}

/** 从请求头取客户端 IP（兼容 Vercel / Cloudflare 代理） */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

/** 返回标准 429 Response */
export function rateLimitedResponse(retryAfterMs: number) {
  return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
    },
  })
}
