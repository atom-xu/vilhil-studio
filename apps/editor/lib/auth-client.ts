/**
 * Better Auth 客户端
 *
 * 用于 React 组件中的登录/注册/会话查询。
 */

import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002',
  plugins: [adminClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
