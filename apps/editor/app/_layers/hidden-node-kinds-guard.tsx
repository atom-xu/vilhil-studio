'use client'

/**
 * VilHil 隐藏节点类型 · 运行时守卫
 *
 * 在 VilHil 编辑器路由里 mount 一次。当前职责：
 *
 *   1. 订阅 `useCommandRegistry`，把所有指向黑名单节点类型的 CommandAction
 *      自动剔除。这样即便 packages/editor（或上游同步后的新版本）注册了
 *      `editor.tool.elevator` / `add-fence` 之类的命令，VilHil 命令面板也不会
 *      展示给设计师。
 *
 *   2. 用 setState 的"过滤后写回"方式实现；不在 packages/editor 里改注册数组，
 *      也不需要 packages/editor 暴露 filter prop。
 *
 * 不在这里做的：
 *   - **工具栏（structure-tools）**当前不包含黑名单类型，无需运行时过滤；
 *     如果未来上游加上了 elevator/skylight 工具按钮，需要单独的 React Context
 *     方案（或推动 packages/editor 暴露 `hiddenTools` prop）。
 *   - **场景树（tree-node.tsx）**当前 switch fallback 已经返回 null，
 *     未注册的 type 不会渲染；无需运行时过滤。
 *
 * 详见 `docs/ARCHITECTURE-LAYERING.md §5`、`docs/UPSTREAM-PATCHES.md L3`。
 */

import { useCommandRegistry } from '@pascal-app/editor'
import { useEffect } from 'react'
import { isVilHilHiddenCommandId } from './hidden-node-kinds'

export function HiddenNodeKindsGuard() {
  useEffect(() => {
    // 立即过滤一次当前已注册的命令
    const prune = () => {
      const { actions } = useCommandRegistry.getState()
      const filtered = actions.filter((a) => !isVilHilHiddenCommandId(a.id))
      if (filtered.length !== actions.length) {
        useCommandRegistry.setState({ actions: filtered })
      }
    }

    prune()

    // 后续每次注册新命令时再过滤；EditorCommands 在 mount/dependencies 变化时
    // 会重新 register 一批，我们订阅 store 变化即可拦截。
    const unsubscribe = useCommandRegistry.subscribe(prune)

    return unsubscribe
  }, [])

  return null
}
