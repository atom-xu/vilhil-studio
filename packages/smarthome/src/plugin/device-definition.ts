/**
 * deviceDefinition — VilHil device 节点的 plugin 注册声明（Phase 2B）.
 *
 * 当前阶段：renderer / geometry / floorplan / tool / system / parametrics
 *   / handles / affordances / preview / toolHints / affordanceTools 等字段
 *   **全部留 undefined** —— VilHil 仍走 viewer/editor 的硬编码 dispatch 渲染
 *   device（packages/viewer/src/components/renderers/device/** + packages/
 *   editor/src/components/ui/sidebar/panels/device-panel/**）。
 *
 * 此 definition 的作用：
 *   1. 让 `nodeRegistry` 认识 `'device'` 这个 kind
 *   2. 让上游 capability 查询函数（`isRegistrySelectable('device')`、
 *      `getSelectableKinds()`、`kindsWithFloorplanScope('level')`、
 *      `isRegistryMovable('device')` 等）正确识别 device
 *   3. 为 Phase 3+ 真正接管渲染留接口
 *
 * 详见：
 *   - docs/NODES-PLUGIN-ARCHITECTURE.md
 *   - docs/ARCHITECTURE-LAYERING.md §5 路线图（Phase 2B）
 *   - docs/UPSTREAM-PATCHES.md L1（DeviceNode schema 仍在 core，逻辑归属 VilHil）
 */
import { DeviceNode, type NodeDefinition } from '@pascal-app/core'

export const deviceDefinition: NodeDefinition<typeof DeviceNode> = {
  kind: 'device',
  schemaVersion: 1,
  schema: DeviceNode,
  // Device 属于 Furnish 体系（不进 Structure 主流程）——
  // CLAUDE.md §2 硬规则 1。
  category: 'furnish',

  /**
   * 利用 schema 的 zod `.default()` annotation 计算完整的默认形状，避免在这里
   * 重复枚举 DeviceNode 的几十个字段（参考上游 door definition 的同款 pattern）。
   * 解析一个最小 stub，丢弃 id / type，返回其余。
   */
  defaults: () => {
    // DeviceNode 没有给 `parentId` / `subsystem` / `renderType` 提供 zod default，
    // 这里在解析 stub 时显式补齐——产出的 rest 仍是「占位默认值」，host app 在
    // 实际放置 device 时会用真实数据覆盖这些字段。
    const stub = DeviceNode.parse({
      id: 'device_default' as never,
      type: 'device',
      parentId: null,
      subsystem: 'lighting',
      renderType: '',
    })
    const { id: _id, type: _type, ...rest } = stub
    return rest
  },

  capabilities: {
    // 三轴自由移动（设备允许 xyz 平动）。
    movable: { axes: ['x', 'y', 'z'] },
    // 绕 Y 轴旋转（朝向调整）；roll / pitch 在 VilHil 当前业务里没有需求。
    rotatable: { axes: ['y'] },
    // 拾取靠 bounding box（GLB / parametric model 都适用）。
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
    // 可挂在 level（楼层底）、wall（墙挂面板/灯）、ceiling（吸顶灯/烟感等）。
    // `fromAsset: 'attachTo'` 与 item kind 对齐——具体的安装类型 (`mountType`)
    // 决定运行时挂在哪种 host 上，由 VilHil 现有 placement 逻辑处理。
    hostable: { parents: ['level', 'wall', 'ceiling'], fromAsset: 'attachTo' },
    // 与 host 关系相关的可剥离字段：preset 保存时由 host app 视情况剥离，
    // 重新放置时由墙下/吸顶下的命中重新派生。
    hostRefFields: ['wallId', 'wallT'],
  },

  presentation: {
    label: '智能设备',
    description: '智能家居设备节点 —— 灯光、面板、传感器、窗帘、暖通、影音、安防、网络等子系统。',
    icon: { kind: 'iconify', name: 'lucide:zap' },
    paletteSection: 'furnish',
  },

  // ─────────────────────────────────────────────────────────────────
  // 以下字段在 Phase 2B 一律留 undefined，VilHil 现有硬编码 dispatch
  // 继续工作。Phase 3+ 逐步迁移到 NodeDefinition 通用 dispatch 时再填。
  //
  //   renderer? / geometry? / geometryKey? / computeLevelData?
  //   floorplan? / floorplanScope? / floorplanAffordances?
  //   floorplanMoveTarget? / floorplanSiblingOverrides?
  //   system? / tool? / affordanceTools? / affordances?
  //   toolHints? / preview? / parametrics? / handles?
  //   keyboardActions? / relations? / mcp?
  // ─────────────────────────────────────────────────────────────────
}
