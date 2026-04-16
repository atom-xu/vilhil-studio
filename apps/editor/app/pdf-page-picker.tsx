'use client'

import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'

interface PdfPagePickerProps {
  pdf: PDFDocumentProxy
  numPages: number
  onSelect: (result: { dataUrl: string; width: number; height: number }) => void
  onClose: () => void
}

/**
 * 多页 PDF 页面选择器弹窗
 *
 * 渐进加载缩略图，点击选择页面后渲染全分辨率
 */
export function PdfPagePicker({ pdf, numPages, onSelect, onClose }: PdfPagePickerProps) {
  const [thumbs, setThumbs] = useState<(string | null)[]>(() => Array(numPages).fill(null))
  const [rendering, setRendering] = useState<number | null>(null)
  const cancelledRef = useRef(false)

  // 渐进加载缩略图
  useEffect(() => {
    cancelledRef.current = false
    ;(async () => {
      for (let i = 1; i <= numPages; i++) {
        if (cancelledRef.current) break
        try {
          const page = await pdf.getPage(i)
          const vp = page.getViewport({ scale: 1 })
          const dpr = window.devicePixelRatio || 1
          const targetWidth = 300 * dpr
          const scale = targetWidth / vp.width
          const viewport = page.getViewport({ scale })

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport }).promise

          if (cancelledRef.current) break
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          setThumbs((prev) => {
            const next = [...prev]
            next[i - 1] = dataUrl
            return next
          })
        } catch {
          // skip failed page
        }
      }
    })()
    return () => { cancelledRef.current = true }
  }, [pdf, numPages])

  const handleSelect = async (pageNum: number) => {
    setRendering(pageNum)
    try {
      const page = await pdf.getPage(pageNum)
      const dpr = window.devicePixelRatio || 1
      const scale = Math.min(4, Math.max(2, Math.round(dpr * 2)))
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise

      onSelect({
        dataUrl: canvas.toDataURL('image/png'),
        width: viewport.width,
        height: viewport.height,
      })
    } catch (err) {
      console.error('[PdfPagePicker] render failed:', err)
      setRendering(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border/40 bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
          <span className="font-medium text-foreground text-sm">
            选择页面（共 {numPages} 页）
          </span>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>

        {/* 缩略图网格 */}
        <div className="grid max-h-[65vh] grid-cols-3 gap-3 overflow-y-auto p-4">
          {thumbs.map((thumb, i) => {
            const pageNum = i + 1
            const isRendering = rendering === pageNum
            return (
              <button
                className="group relative flex flex-col items-center gap-1.5 rounded-lg border border-border/30 p-2 transition-all hover:border-primary/50 hover:bg-accent/30 disabled:opacity-50"
                disabled={rendering !== null}
                key={pageNum}
                onClick={() => handleSelect(pageNum)}
                type="button"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-accent/20">
                  {thumb ? (
                    <img
                      alt={`第 ${pageNum} 页`}
                      className="h-full w-full object-contain"
                      draggable={false}
                      src={thumb}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                    </div>
                  )}
                  {isRendering && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
                  {pageNum}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
