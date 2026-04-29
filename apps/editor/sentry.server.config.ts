/**
 * Sentry 服务端配置（Node.js / Edge）
 *
 * 捕获 API Route 未处理的异常、数据库错误等服务端错误。
 */
import * as Sentry from '@sentry/nextjs'

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,

    // 不上报预期的 4xx 错误
    beforeSend(event) {
      const status = event.extra?.status as number | undefined
      if (status && status >= 400 && status < 500) return null
      return event
    },
  })
}
