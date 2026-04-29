import path from 'node:path'
import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

// Bun 对 monorepo peer 解析会基于"顶层消费者上下文"生成多份副本（apps/editor 和
// packages/viewer 的 R3F / zustand hash 不同），造成 React context 不通的诡异报错：
//   "R3F: Hooks can only be used within the Canvas component"
// 这里用 resolveAlias 强制跨包走单一实例，实现 singleton。
// 涉及 context 的库（R3F、drei、zustand、react）都要钉死，否则依然分裂。
//
// 注意：
//   - Turbopack 的 resolveAlias 只接受相对 project root 的路径（以 `./` 开头），
//     不支持绝对路径（绝对路径会被当作 server-relative 导致解析失败）。
//   - webpack 的 resolve.alias 要绝对路径。所以两份配置格式不同。
const TURBO_ALIAS: Record<string, string> = {
  '@react-three/fiber': './node_modules/@react-three/fiber',
  '@react-three/drei': './node_modules/@react-three/drei',
  zustand: './node_modules/zustand',
  three: './node_modules/three',
  react: './node_modules/react',
  'react-dom': './node_modules/react-dom',
}
const APP_DIR = process.cwd()
const WEBPACK_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(TURBO_ALIAS).map(([k, v]) => [k, path.resolve(APP_DIR, v)]),
)

const isProd = process.env.NODE_ENV === 'production'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@pascal-app/viewer', '@pascal-app/core', '@pascal-app/editor', '@vilhil/smarthome'],
  turbopack: {
    resolveAlias: TURBO_ALIAS,
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      ...WEBPACK_ALIAS,
    }
    return config
  },
  experimental: {
    // 独立输出模式 —— 让 Next.js 打包出一个可独立运行的 Node.js 服务
    // Docker / PM2 部署时 `node .next/standalone/apps/editor/server.js` 即可启动
    // outputFileTracingRoot 指向 monorepo 根，确保 packages/* 依赖被一并追踪
    outputFileTracingRoot: path.join(__dirname, '../../'),
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  output: 'standalone',
  // ─── 安全响应头（生产 + 开发都加，生产额外加 HSTS）───────────────
  async headers() {
    const securityHeaders = [
      // 禁止被 iframe 嵌入（防 clickjacking）
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      // 禁止浏览器猜测 MIME 类型（防 XSS via MIME sniffing）
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // 跨站请求只带 origin，不带完整 Referer
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // 禁止不必要的浏览器特权 API
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // 生产环境强制 HTTPS（1 年）
      ...(isProd
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }]
        : []),
    ]
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  images: {
    unoptimized: !isProd,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
}

// Sentry：只在设置了 DSN 时才真正注入（dev / CI 无 DSN 时 zero-cost）
const hasSentry = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)

export default hasSentry
  ? withSentryConfig(nextConfig, {
      // Sentry organization / project（CI 通过环境变量注入）
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // 上传 sourcemap 时静默输出，避免 build 日志太杂
      silent: true,
      // 不把 sourcemap 打进 client bundle（安全）
      sourcemaps: { disable: false, deleteSourcemapsAfterUpload: true },
      // 关闭 tree-shaking 警告
      disableLogger: true,
      widenClientFileUpload: true,
    })
  : nextConfig
