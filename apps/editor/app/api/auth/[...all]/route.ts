/**
 * Better Auth API 路由挂载点
 *
 * 所有 auth 相关端点（/api/auth/sign-in, /api/auth/sign-up, /api/auth/session 等）
 * 由 Better Auth handler 统一处理。
 */

import { auth } from '@/lib/auth'

export const GET = (req: Request) => auth.handler(req)
export const POST = (req: Request) => auth.handler(req)
