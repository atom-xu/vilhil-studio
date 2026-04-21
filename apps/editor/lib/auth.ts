/**
 * Better Auth 服务端配置
 *
 * - 数据库：复用同一 pg Pool
 * - 认证方式：邮箱+密码（最简）
 * - 会话：Cookie -based
 */

import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { pool } from './db'

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002',
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
    // TODO: 接入邮件服务后启用自动发送
    sendVerificationEmail: async ({ user, url }: { user: any; url: string }) => {
      console.log(`[Email Verification] To: ${user.email}, URL: ${url}`)
    },
  },
  plugins: [admin()],
})

export type AuthSession = typeof auth.$Infer.Session
