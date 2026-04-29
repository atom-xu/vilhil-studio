/**
 * Next.js Middleware — 路由保护
 *
 * 受保护页面：/projects（项目列表/管理）、/admin（后台）
 * 公开页面：/（编辑器，支持游客模式）、/login、/share/[token]、/api/**
 *
 * 游客模式说明：
 *   - 主编辑器 / 无需登录，数据本地保存（localStorage / IndexedDB）
 *   - 登录后自动开启云端自动保存，并可访问 /projects 项目列表
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** 需要登录才能访问的路径前缀（编辑器 / 已改为公开） */
const PROTECTED_PATHS = ['/projects', '/admin']

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
  // 匹配所有页面路由（排除 _next 静态资源、API、图标、分享页、登录页）
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|share/|login|register|verify-email).*)'],
}
