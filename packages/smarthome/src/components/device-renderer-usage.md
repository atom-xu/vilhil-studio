# SmartDeviceRenderer 使用指南

## 替换现有 DeviceRenderer

### 1. 修改 node-renderer.tsx

```typescript
// packages/viewer/src/components/renderers/node-renderer.tsx

// 旧导入
// import { DeviceRenderer } from './device/device-renderer'

// 新导入
import { SmartDeviceRenderer } from '@vilhil/smarthome'

export const NodeRenderer = ({ nodeId }: { nodeId: AnyNode['id'] }) => {
  const node = useScene((state) => state.nodes[nodeId])

  if (!node) return null

  return (
    <>
      {/* ... 其他渲染器 ... */}
      {node.type === 'device' && (
        <SmartDeviceRenderer
          node={node}
          selected={selection.selectedIds?.includes(node.id)}
          hovered={hoveredId === node.id}
        />
      )}
    </>
  )
}
```

### 2. 使用预览组件

```typescript
// packages/editor/src/components/tools/device/device-tool.tsx

import { DevicePreview, DeviceCursor, getModel } from '@vilhil/smarthome'

export const DeviceTool: React.FC = () => {
  const selectedDevice = useEditor((state) => state.selectedDevice)
  const model = getModel(selectedDevice?.renderType)

  return (
    <>
      {/* 光标 */}
      <DeviceCursor visible={true} valid={canPlace} />

      {/* 设备预览 */}
      {model && (
        <DevicePreview
          definition={model}
          valid={canPlace}
          rotation={rotationY.current}
        />
      )}
    </>
  )
}
```

### 3. Proposal 模式只读

```typescript
// apps/editor/app/proposal-demo/page.tsx

import { useEffect } from 'react'
import { useScene } from '@pascal-app/core'
import { ProposalLayout } from '@pascal-app/editor'
import { SmartDeviceRenderer } from '@vilhil/smarthome'

export default function ProposalPage() {
  // 设置只读模式
  useEffect(() => {
    useScene.getState().setReadOnly(true)
    return () => useScene.getState().setReadOnly(false)
  }, [])

  return (
    <ProposalLayout>
      <Viewer>
        {/* 设备自动渲染，点击可交互但不能编辑 */}
      </Viewer>
    </ProposalLayout>
  )
}
```

## 状态绑定说明

SmartDeviceRenderer 自动绑定 `useDeviceState`，无需手动传递状态：

```typescript
// 在组件内部自动处理
const deviceState = useDeviceState((s) => s.deviceStates[node.id])
const toggleDevice = useDeviceState((s) => s.toggleDevice)

// 点击时自动触发状态切换
onClick={() => {
  if (node.subsystem === 'lighting') {
    toggleDevice(node.id)  // 开/关
  }
}}
```

## 事件回调

SmartDeviceRenderer 支持完整的事件回调：

```typescript
<SmartDeviceRenderer
  node={node}
  // 这些事件通过 useNodeEvents 自动处理
  // emitter.on('device:click', handler)
  // emitter.on('device:enter', handler)
  // emitter.on('device:leave', handler)
/>
```

## 覆盖范围可视化

```typescript
// 在 Proposal 模式中显示 AP 覆盖范围
const [showCoverage, setShowCoverage] = useState(false)

<SmartDeviceRenderer
  node={node}
  showCoverage={showCoverage}  // 显示/隐藏覆盖范围
/>
```

## 自定义交互

如果需要自定义交互逻辑，可以直接使用底层组件：

```typescript
import { DeviceMesh, DeviceInteractionZone } from '@vilhil/smarthome'

function CustomDevice({ node }) {
  return (
    <DeviceInteractionZone
      size={[0.3, 0.3, 0.3]}
      onClick={() => console.log('自定义点击')}
      onHover={(hovered) => console.log('悬停:', hovered)}
    >
      <DeviceMesh
        definition={model}
        state={deviceState}
      />
    </DeviceInteractionZone>
  )
}
```

## 性能优化

1. **材质缓存**：所有材质自动缓存，避免重复创建
2. **几何体复用**：相同几何体只创建一次
3. **动画优化**：使用 requestAnimationFrame，避免 React re-render

## 迁移检查清单

- [ ] 更新 node-renderer.tsx 导入
- [ ] 确保 useRegistry 已注册 device 类型
- [ ] 测试筒灯点击开关
- [ ] 测试墙面开关放置
- [ ] 测试 Proposal 模式只读
- [ ] 测试设备状态持久化
