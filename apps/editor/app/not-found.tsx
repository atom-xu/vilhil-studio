import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="font-barlow text-6xl font-semibold text-foreground/10">404</p>
      <h1 className="text-xl font-semibold text-foreground">页面不存在</h1>
      <p className="text-sm text-muted-foreground">你访问的页面可能已删除或地址有误</p>
      <Link
        className="vh-btn vh-btn-secondary mt-2 px-5 py-2 text-sm"
        href="/"
      >
        返回编辑器
      </Link>
    </div>
  )
}
