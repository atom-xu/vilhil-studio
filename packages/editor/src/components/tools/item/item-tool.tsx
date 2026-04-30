import type { AssetInput } from '@pascal-app/core'
import { sfxEmitter } from '../../../lib/sfx-bus'
import useEditor from '../../../store/use-editor'
import { useDraftNode } from './use-draft-node'
import { usePlacementCoordinator } from './use-placement-coordinator'

/**
 * 外壳：只读 selectedItem，没有就 early return —— 关键是不让下面的 hook 跑，
 * 否则 usePlacementCoordinator 会尝试读 null.dimensions 直接 TypeError 崩掉。
 *
 * 之前 `asset: selectedItem!` 用 ! 强转非空，运行时仍是 null，hook 内 asset.dimensions
 * 直接 throw。把 hook 移到 ItemToolImpl，外壳保证非空才挂载。
 */
export const ItemTool: React.FC = () => {
  const selectedItem = useEditor((state) => state.selectedItem)
  if (!selectedItem) return null
  return <ItemToolImpl asset={selectedItem} />
}

const ItemToolImpl: React.FC<{ asset: AssetInput }> = ({ asset }) => {
  const draftNode = useDraftNode()
  const cursor = usePlacementCoordinator({
    asset,
    draftNode,
    initDraft: (gridPosition) => {
      if (!asset.attachTo) {
        draftNode.create(gridPosition, asset)
      }
    },
    onCommitted: () => {
      sfxEmitter.emit('sfx:item-place')
      return true
    },
  })
  return <>{cursor}</>
}
