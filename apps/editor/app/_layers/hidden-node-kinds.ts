/**
 * VilHil 隐藏节点类型清单
 *
 * 这些 Pascal 节点类型在 `packages/core/src/schema/nodes/**` 中代码完整存在
 * （Phase 1.1 已恢复，为了和上游 Pascal 保持零删除，便于双月同步），
 * 但 VilHil 的智能家居方案展示业务不需要把它们暴露给设计师。
 *
 * UI 层据此过滤：
 *   - 工具栏（structure-tools）按钮
 *   - 命令面板（command palette）的"添加 X"命令
 *   - 场景树（hierarchy）节点入口（注：tree-node.tsx 的 switch 已隐式过滤，
 *     未注册的 type 自动 fallback 到 `return null`；这里保留显式集合是为了未来
 *     如果上游为这些类型补了 tree-node 分支，VilHil 仍能挡住）
 *
 * 已存在于历史项目里的这些类型的节点**不会消失**，只是不在 UI 入口里露出，
 * 避免新增；也不会破坏渲染（viewer 包对未识别的 type 同样安全跳过）。
 *
 * 详见：
 *   - docs/ARCHITECTURE-LAYERING.md §5（Phase 1.3）
 *   - docs/UPSTREAM-PATCHES.md L3
 */
export const VILHIL_HIDDEN_NODE_KINDS = new Set<string>([
  'elevator',
  'fence',
  'column',
  'shelf',
  'spawn',
  'ridge-vent',
  'skylight',
  'solar-panel',
])

/** 判断给定节点类型是否在 VilHil 黑名单内。 */
export const isVilHilHiddenKind = (kind: string): boolean =>
  VILHIL_HIDDEN_NODE_KINDS.has(kind)

/**
 * 给定一组命令 id（或包含 id 的对象），过滤掉那些指向黑名单节点类型的项。
 *
 * 启发式匹配：检查 id 字符串是否包含 `.<kind>`、`-<kind>`、`/<kind>` 或
 * `:<kind>`（即作为完整 token 出现）。例如 `editor.tool.elevator`、
 * `add-fence` 都会被识别。仅做"包含" substring 匹配可能误伤
 * （如 `column-layout`），所以这里要求边界字符。
 */
export function isVilHilHiddenCommandId(commandId: string): boolean {
  for (const kind of VILHIL_HIDDEN_NODE_KINDS) {
    // 匹配 token 边界，避免 'column' 误中 'column-layout' 这类无关 id
    const re = new RegExp(`(^|[.\\-:/])${kind}($|[.\\-:/])`)
    if (re.test(commandId)) return true
  }
  return false
}
