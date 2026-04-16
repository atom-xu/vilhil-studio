/**
 * PDF 导入 — 用 pdfjs-dist 在浏览器端渲染 PDF 页面为图片
 *
 * 移植自 3Dhouse 项目，适配 TypeScript + VilHil Studio
 * 用途：设计师上传 PDF 户型图 → 渲染为图片 → 贴在地面做底图描摹
 */

import * as pdfjsLib from 'pdfjs-dist'

let workerInitialized = false

function ensureWorker() {
  if (workerInitialized) return
  // pdfjs-dist v5 的 worker 路径
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString()
  workerInitialized = true
}

export interface PdfPageResult {
  dataUrl: string
  width: number
  height: number
  pdfScale: number
}

/** 渲染指定页面为 dataUrl */
async function renderPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale: number,
): Promise<PdfPageResult> {
  const page = await pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: viewport.width,
    height: viewport.height,
    pdfScale: scale,
  }
}

function getFullScale(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.min(4, Math.max(2, Math.round(dpr * 2)))
}

/** 取第一页全分辨率 */
export async function pdfFirstPageToDataUrl(file: File): Promise<PdfPageResult> {
  ensureWorker()
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  return renderPage(pdf, 1, getFullScale())
}

/** 打开 PDF 返回文档对象 + 页数（供多页选择器用） */
export async function pdfOpen(file: File): Promise<{
  pdf: pdfjsLib.PDFDocumentProxy
  numPages: number
}> {
  ensureWorker()
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  return { pdf, numPages: pdf.numPages }
}

/** 渲染缩略图（Retina 适配） */
export async function pdfRenderThumbnail(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
): Promise<PdfPageResult> {
  const page = await pdf.getPage(pageNum)
  const defaultVp = page.getViewport({ scale: 1 })
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const targetWidth = 420 * dpr
  const thumbScale = targetWidth / defaultVp.width
  return renderPage(pdf, pageNum, thumbScale)
}

/** 渲染选中页全分辨率 */
export async function pdfRenderFullPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
): Promise<PdfPageResult> {
  return renderPage(pdf, pageNum, getFullScale())
}
