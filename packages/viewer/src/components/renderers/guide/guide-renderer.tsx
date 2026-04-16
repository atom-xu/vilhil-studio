import { type GuideNode, useRegistry } from '@pascal-app/core'
import { useLoader } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import { DoubleSide, type Group, RepeatWrapping, type Texture, TextureLoader } from 'three'
import { float, texture } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { useAssetUrl } from '../../../hooks/use-asset-url'
import useViewer from '../../../store/use-viewer'
import { ErrorBoundary } from '../../error-boundary'

export const GuideRenderer = ({ node }: { node: GuideNode }) => {
  const showGuides = useViewer((s) => s.showGuides)
  const ref = useRef<Group>(null!)
  useRegistry(node.id, 'guide', ref)

  const resolvedUrl = useAssetUrl(node.url)
  const isVisible = showGuides && node.visible !== false

  return (
    <group
      position={node.position}
      ref={ref}
      rotation={[0, node.rotation[1], 0]}
      visible={isVisible}
    >
      {/* 条件渲染子组件：仅当可见时才挂载 GuidePlane，
          避免 R3F demand 模式下 visible prop 不立即生效的问题 */}
      {isVisible && resolvedUrl && (
        <ErrorBoundary fallback={<></>}>
          <Suspense>
            <GuidePlane opacity={node.opacity} scale={node.scale} url={resolvedUrl} />
          </Suspense>
        </ErrorBoundary>
      )}
    </group>
  )
}

const GuidePlane = ({ url, scale, opacity }: { url: string; scale: number; opacity: number }) => {
  const tex = useLoader(TextureLoader, url) as Texture

  const { width, height, material } = useMemo(() => {
    // ── 坐标系对齐 ──────────────────────────────────────────────────────────
    // 2D 平面图的 SVG 坐标系：toSvgX(x) = -x，即 X 轴取反。
    // 世界 +X（右） 在 2D 中对应 SVG 左侧，图片左边缘显示世界右侧内容。
    //
    // 3D 平面 UV：U=0 在平面左侧（世界 -X），U=1 在右侧（世界 +X）。
    // 不做处理时横向镜像。修复：沿 U 轴翻转纹理，使 U=0→图右、U=1→图左。
    //
    // flipY=false：修复垂直方向。2D 中 toSvgY(z) = -z，世界 +Z 在 SVG 上方，
    // 关闭 flipY 后 V=0 映射到图片顶部行，与 2D 的"正 Z = 上"一致。
    tex.flipY = false
    tex.repeat.x = -1     // 水平翻转：U 从 1→0 而非 0→1
    tex.offset.x = 1      // 偏移补偿，使映射范围回到 [0,1]
    tex.wrapS = RepeatWrapping
    tex.needsUpdate = true

    const img = tex.image as HTMLImageElement | ImageBitmap
    const w = img.width || 1
    const h = img.height || 1
    const aspect = w / h

    // Default: 10 meters wide, height from aspect ratio
    const planeWidth = 10 * scale
    const planeHeight = (10 / aspect) * scale

    const normalizedOpacity = opacity / 100

    const mat = new MeshBasicNodeMaterial({
      transparent: true,
      colorNode: texture(tex),
      opacityNode: float(normalizedOpacity),
      side: DoubleSide,
      depthWrite: false,
    })

    return { width: planeWidth, height: planeHeight, material: mat }
  }, [tex, scale, opacity])

  return (
    <mesh
      frustumCulled={false}
      material={material}
      raycast={() => {}}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[width, height]} boundingBox={null} boundingSphere={null} />
    </mesh>
  )
}
