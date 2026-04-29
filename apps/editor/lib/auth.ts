/**
 * Better Auth 服务端配置
 *
 * - 数据库：复用同一 pg Pool
 * - 认证方式：邮箱+密码
 * - 邮件：Resend（RESEND_API_KEY 有值时启用，否则仅 console.log）
 * - 会话：Cookie-based
 */

import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { Resend } from 'resend'
import { SAMPLE_PROJECT_SLUG } from '../db/sample-scene'
import { db, pool } from './db'
import { projects } from './schema'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = 'VilHil Studio <support@vilhil.cn>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002'

/** 统一发信工具，无 API key 时降级到 console.log（开发环境） */
async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) {
    console.log(`[Email dev-only] To: ${to} | Subject: ${subject}`)
    return
  }
  await resend.emails.send({ from: FROM, to, subject, html })
}

export const auth = betterAuth({
  database: pool,
  baseURL: APP_URL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
      await sendEmail(
        user.email,
        '重置你的 VilHil Studio 密码',
        `<p>你好，</p>
         <p>点击下方链接重置密码（链接 1 小时内有效）：</p>
         <p><a href="${url}" style="color:#6366f1">${url}</a></p>
         <p>如果不是你操作的，请忽略此邮件。</p>
         <p>— VilHil Studio 团队</p>`,
      )
    },
  },
  advanced: {
    cookiePrefix: 'vilhil',
    defaultCookieAttributes: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
    },
  },
  plugins: [admin()],

  /**
   * 新用户注册后自动 fork 客厅样板间
   *
   * 如果 DB 里没有样板间（首次部署未跑 seed），静默跳过，不阻断注册。
   */
  databaseHooks: {
    user: {
      create: {
        async after(user: { id: string; email: string; name?: string | null }) {
          try {
            const sample = await db.query.projects.findFirst({
              where: eq(projects.slug, SAMPLE_PROJECT_SLUG),
            })
            if (!sample) return // seed 未运行，静默跳过

            const slug = `客厅样板间-${nanoid(6)}`
            await db.insert(projects).values({
              ownerId: user.id,
              name: '客厅样板间',
              slug,
              data: sample.data as any,
            })
          } catch (err) {
            // 不阻断注册流程，仅打日志
            console.error('[auth hook] auto-fork sample failed:', err)
          }
        },
      },
    },
  },
})

export type AuthSession = typeof auth.$Infer.Session
