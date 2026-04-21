/**
 * Next.js Middleware — 路由保护
 *
 * 当前策略：账号体系暂不激活，所有路由公开访问。
 * 上线前取消下方注释即可恢复登录保护。
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function middleware(request: NextRequest) {
  // 账号体系激活后，取消下方注释：
  // const PROTECTED_PATHS = ['/projects']
  // const { pathname } = request.nextUrl
  // const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path))
  // if (!isProtected) return NextResponse.next()
  // const session = await (await import('@/lib/auth')).auth.api.getSession({ headers: request.headers })
  // if (!session) {
  //   const loginUrl = new URL('/login', request.url)
  //   loginUrl.searchParams.set('redirect', pathname)
  //   return NextResponse.redirect(loginUrl)
  // }
  return NextResponse.next()
}

export const config = {
  matcher: ['/projects/:path*'],
}
