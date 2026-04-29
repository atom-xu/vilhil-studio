/**
 * Sentry 客户端配置（Browser）
 *
 * 在浏览器中捕获 JS 错误、未处理的 Promise rejection，以及 Replay。
 * 仅在 NEXT_PUBLIC_SENTRY_DSN 存在时激活（避免 dev/CI 产生噪音）。
 */
import * as Sentry from '@sentry/nextjs'

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,

    // 生产错误采 100%，性能采 5%（内测期间省配额）
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,

    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // 过滤掉 pdfjs-dist 内部的 Worker 终止警告（非业务错误）
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Worker was destroyed',
    ],
  })
}
