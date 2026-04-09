'use client'

import NextImage from 'next/image'
import { cn } from './../../../lib/utils'
import useEditor, { type CatalogCategory } from './../../../store/use-editor'
import { ActionButton } from './action-button'

export type FurnishToolConfig = {
  id: 'item'
  iconSrc: string
  label: string
  catalogCategory: CatalogCategory
}

// Furnish mode tools: furniture, appliances, decoration (painting is now a control mode)
export const furnishTools: FurnishToolConfig[] = [
  {
    id: 'item',
    iconSrc: '/icons/couch.png',
    label: '家具',
    catalogCategory: 'furniture',
  },
  {
    id: 'item',
    iconSrc: '/icons/appliance.png',
    label: '电器',
    catalogCategory: 'appliance',
  },
  {
    id: 'item',
    iconSrc: '/icons/kitchen.png',
    label: '厨房',
    catalogCategory: 'kitchen',
  },
  {
    id: 'item',
    iconSrc: '/icons/bathroom.png',
    label: '卫浴',
    catalogCategory: 'bathroom',
  },
  {
    id: 'item',
    iconSrc: '/icons/tree.png',
    label: '户外',
    catalogCategory: 'outdoor',
  },
]

export function FurnishTools() {
  const mode = useEditor((state) => state.mode)
  const activeTool = useEditor((state) => state.tool)
  const setActiveTool = useEditor((state) => state.setTool)
  const setMode = useEditor((state) => state.setMode)
  const catalogCategory = useEditor((state) => state.catalogCategory)
  const setCatalogCategory = useEditor((state) => state.setCatalogCategory)

  const isSmartActive = mode === 'build' && activeTool === 'device'

  return (
    <div className="flex items-center gap-1.5 px-1">
      {furnishTools.map((tool, index) => {
        const isActive =
          mode === 'build' && activeTool === 'item' && catalogCategory === tool.catalogCategory

        return (
          <ActionButton
            className={cn(
              'rounded-lg duration-300',
              isActive
                ? 'z-10 scale-110 bg-black/40 hover:bg-black/40'
                : 'scale-95 bg-transparent opacity-60 grayscale hover:bg-black/20 hover:opacity-100 hover:grayscale-0',
            )}
            key={`${tool.id}-${tool.catalogCategory ?? index}`}
            label={tool.label}
            onClick={() => {
              if (!isActive) {
                setCatalogCategory(tool.catalogCategory)
                setActiveTool('item')
                if (mode !== 'build') {
                  setMode('build')
                }
              }
            }}
            size="icon"
            variant="ghost"
          >
            <NextImage
              alt={tool.label}
              className="size-full object-contain"
              height={28}
              src={tool.iconSrc}
              width={28}
            />
          </ActionButton>
        )
      })}

      {/* 智能家居设备分类 */}
      <div className="mx-0.5 h-6 w-px bg-white/10" />
      <ActionButton
        className={cn(
          'rounded-lg duration-300',
          isSmartActive
            ? 'z-10 scale-110 bg-black/40 hover:bg-black/40'
            : 'scale-95 bg-transparent opacity-60 hover:bg-black/20 hover:opacity-100',
        )}
        label="智能"
        onClick={() => {
          if (!isSmartActive) {
            setCatalogCategory(null)
            setActiveTool('device')
            if (mode !== 'build') {
              setMode('build')
            }
          }
        }}
        size="icon"
        variant="ghost"
      >
        {/* 用品牌主色的小圆点作为图标，不依赖图片资源 */}
        <div className="flex flex-col items-center gap-0.5">
          <div
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: isSmartActive ? '#2D7FF9' : '#6b7280' }}
          />
          <span className="text-[8px] font-medium leading-none">智能</span>
        </div>
      </ActionButton>
    </div>
  )
}
