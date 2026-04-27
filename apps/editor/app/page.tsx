'use client'

import { generateId, saveAsset, useScene } from '@pascal-app/core'
import { Editor, useEditor, ViewerToolbarLeft, ViewerToolbarRight } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { getCurrentProject, setCurrentProject, useCurrentProject } from '@/lib/current-project'
import { saveProjectToCloud } from '@/lib/project-api'
import { UserNavbar } from '@/components/user-navbar'
import { DevBridge } from './dev-bridge'
import { PdfPagePicker } from './pdf-page-picker'
import { ProjectLoader } from './project-loader'

/**
 * 创建 guide 节点 + 自动引导设计师进入底图描摹模式：
 * 1. 创建 guide 节点
 * 2. 切到 2D 视图（底图看得最清楚）
 * 3. 打开参考图显示
 * 4. 选中 guide 节点（弹出 ReferencePanel 调比例/位置）
 */
function createGuideNode(levelId: string, url: string, opacity = 50) {
  const id = generateId('guide' as any)
  useScene.getState().createNode(
    {
      id,
      type: 'guide',
      parentId: levelId,
      object: 'node',
      visible: true,
      metadata: {},
      url,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: 1,
      opacity,
    } as any,
    levelId as any,
  )

  // 自动引导
  setTimeout(() => {
    // 切到 2D 视图
    useEditor.getState().setViewMode('2d')
    // 确保参考图可见
    useViewer.getState().setShowGuides(true)
    // 选中刚创建的 guide（弹出 ReferencePanel）
    useEditor.getState().setSelectedReferenceId(id)
  }, 100)
}

const MAX_IMAGE_DIMENSION = 4096

/**
 * 压缩图片到 MAX_IMAGE_DIMENSION 以内，返回压缩后的 File 对象。
 * 不生成 URL，只做像素压缩，URL 由调用方决定存储方式。
 */
async function compressImageToFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  return new Promise((resolve) => {
    const blobUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      const { width, height } = img

      if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION) {
        resolve(file)
        return
      }

      const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height)
      const newW = Math.round(width * ratio)
      const newH = Math.round(height * ratio)

      const canvas = document.createElement('canvas')
      canvas.width = newW
      canvas.height = newH
      canvas.getContext('2d')!.drawImage(img, 0, 0, newW, newH)
      canvas.toBlob(
        (blob) => resolve(new File([blob!], file.name, { type: 'image/jpeg' })),
        'image/jpeg',
        0.85,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl)
      resolve(file)
    }
    img.src = blobUrl
  })
}

/** 初始化 pdfjs worker（只做一次） */
let pdfjsReady: typeof import('pdfjs-dist') | null = null
async function getPdfjsLib() {
  if (pdfjsReady) return pdfjsReady
  const lib = await import('pdfjs-dist')
  lib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString()
  pdfjsReady = lib
  return lib
}

/** 打开 PDF 返回文档对象 + 页数 */
async function pdfOpen(file: File): Promise<{ pdf: PDFDocumentProxy; numPages: number }> {
  const lib = await getPdfjsLib()
  const buf = await file.arrayBuffer()
  const pdf = await lib.getDocument({ data: buf }).promise
  return { pdf, numPages: pdf.numPages }
}

/**
 * 渲染 PDF 指定页为 File 对象（JPEG），供 saveAsset 存储到 IndexedDB。
 */
async function pdfPageToFile(pdf: PDFDocumentProxy, pageNum: number): Promise<File> {
  const page = await pdf.getPage(pageNum)
  const dpr = window.devicePixelRatio || 1
  const scale = Math.min(4, Math.max(2, Math.round(dpr * 2)))
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await (page.render as any)({ canvasContext: ctx, viewport }).promise

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(new File([blob!], `page-${pageNum}.jpg`, { type: 'image/jpeg' })),
      'image/jpeg',
      0.88,
    )
  })
}

export default function Home() {
  return (
    <>
      <Suspense fallback={null}>
        <ProjectLoader />
      </Suspense>
      <HomeContent />
    </>
  )
}

function HomeContent() {
  // ── 登录态 & 当前项目 ────────────────────────────────────────────
  const { data: session } = useSession()
  const currentProject = useCurrentProject()

  // Ref 避免 onSave 闭包过期（autosave debounce 期间 session/project 可能变）
  const sessionRef = useRef(session)
  const currentProjectRef = useRef(currentProject)
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { currentProjectRef.current = currentProject }, [currentProject])

  // ── 云端自动保存回调（传给 Editor.onSave）────────────────────────
  const handleSave = useCallback(async (scene: { nodes: Record<string, unknown>; rootNodeIds: string[] }) => {
    if (!sessionRef.current?.user) return // 未登录只走 localStorage

    const project = getCurrentProject()
    try {
      const result = await saveProjectToCloud(
        project?.name ?? '未命名项目',
        { nodes: scene.nodes, rootNodeIds: scene.rootNodeIds },
        project?.id,
      )
      // 首次保存后记录云端项目 ID，后续更新同一项目
      if (!project?.id) {
        setCurrentProject({ id: result.project.id, name: project?.name ?? '未命名项目' })
      }
    } catch (err: any) {
      const msg = String(err?.message ?? '')
      if (msg.includes('请先登录') || msg.includes('401')) {
        // session 已过期，跳转登录
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
        return
      }
      console.error('[autosave cloud]', err)
    }
  }, []) // 稳定引用，通过 ref 读取最新值

  // ── 多页 PDF 选择器状态 ──────────────────────────────────────────
  const [pdfPicker, setPdfPicker] = useState<{
    pdf: PDFDocumentProxy
    numPages: number
    levelId: string
  } | null>(null)

  const effectiveProjectId = currentProject?.id ?? 'local-editor'

  const onUploadAsset = useCallback(
    async (_projectId: string, levelId: string, file: File, type: 'scan' | 'guide') => {
      const lowerName = file.name.toLowerCase()

      // ── PDF
      if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
        try {
          const { pdf, numPages } = await pdfOpen(file)
          if (numPages === 1) {
            // 单页 PDF → 渲染为 File → saveAsset → asset:// URL（持久化）
            const pdfFile = await pdfPageToFile(pdf, 1)
            const url = await saveAsset(pdfFile)
            createGuideNode(levelId, url)
          } else {
            // 多页 PDF → 弹出页面选择器
            setPdfPicker({ pdf, numPages, levelId })
          }
        } catch (err) {
          console.error('[PDF Import]', err)
        }
        return
      }

      // ── DXF（存 IndexedDB）
      if (lowerName.endsWith('.dxf')) {
        const url = await saveAsset(file)
        createGuideNode(levelId, url)
        return
      }

      // ── 图片（先压缩，再存 IndexedDB）/ GLB（直接存 IndexedDB）
      const fileToSave = file.type.startsWith('image/') ? await compressImageToFile(file) : file
      const url = await saveAsset(fileToSave)
      if (type === 'scan') {
        const id = generateId('scan' as any)
        useScene.getState().createNode(
          {
            id,
            type: 'scan',
            parentId: levelId,
            object: 'node',
            visible: true,
            metadata: {},
            url,
            position: [0, 0, 0] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            scale: 1,
            opacity: 100,
          } as any,
          levelId as any,
        )
      } else {
        createGuideNode(levelId, url)
      }
    },
    [],
  )

  const handlePdfPageSelect = useCallback(
    async (result: { dataUrl: string; width: number; height: number }) => {
      if (!pdfPicker) return
      // data URL → Blob → saveAsset → asset:// URL（持久化到 IndexedDB）
      const resp = await fetch(result.dataUrl)
      const blob = await resp.blob()
      const pdfFile = new File([blob], 'page.jpg', { type: 'image/jpeg' })
      const url = await saveAsset(pdfFile)
      createGuideNode(pdfPicker.levelId, url)
      setPdfPicker(null)
    },
    [pdfPicker],
  )

  return (
    <div className="h-screen w-screen">
      <DevBridge />
      <Editor
        layoutVersion="v2"
        projectId={effectiveProjectId}
        onSave={handleSave}
        sitePanelProps={{
          projectId: effectiveProjectId,
          onUploadAsset,
        }}
        navbarSlot={<UserNavbar />}
        viewerToolbarLeft={<ViewerToolbarLeft />}
        viewerToolbarRight={<ViewerToolbarRight />}
      />

      {/* 多页 PDF 选择器 */}
      {pdfPicker && (
        <PdfPagePicker
          numPages={pdfPicker.numPages}
          onClose={() => setPdfPicker(null)}
          onSelect={handlePdfPageSelect}
          pdf={pdfPicker.pdf}
        />
      )}
    </div>
  )
}
