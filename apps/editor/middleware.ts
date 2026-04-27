/**
 * Next.js Middleware — 路由保护
 *
 * 受保护页面：/ (编辑器) 和 /projects (项目列表)
 * 公开页面：/login、/share/[token]、/api/**
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** 需要登录才能访问的路径前缀 */
const PROTECTED_PATHS = ['/', '/projects']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))
  if (!isProtected) return NextResponse.next()

  const session = await (await import('@/lib/auth')).auth.api.getSession({ headers: request.headers })
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // 匹配所有页面路由（排除 _next 静态资源、API、图标）
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|share/|login).*)'],
}
