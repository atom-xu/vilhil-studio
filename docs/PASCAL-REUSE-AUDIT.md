# Pascal 能力复用审计

> 目的：避免重复造轮子。在开发任何新功能前，先对照本表确认 Pascal 是否已有。

---

## 直接复用（不写新代码，直接用）

| 功能 | Pascal 文件 | VilHil 怎么用 |
|------|-----------|-------------|
| 设备放置 | `tools/item/placement-strategies.ts` | Device 复用 Item 的 floor/wall/ceiling 放置策略 |
| 墙面吸附 | `schema/nodes/item.ts`（wallId + wallT） | 面板/门锁用 wallId 吸附墙面 |
| 天花吸附 | `tools/item/use-placement-coordinator.tsx` | 灯具/传感器/AP 用 ceiling 策略 |
| 选中系统 | `viewer/selection-manager.tsx` | Device 节点自动参与选中 |
| Undo/Redo | `store/use-scene.ts`（Zundo） | 设备操作自动进入历史栈 |
| 保存/加载 | `hooks/use-auto-save.ts` | Device 数据在 scene graph 里，自动持久化 |
| 只读模式 | `store/use-scene.ts`（readOnly） | 展示模式设 readOnly=true，设备不可编辑 |
| 集合/分组 | `schema/collections.ts` | 可用于场景设备分组 |
| 网格/吸附 | `tools/item/placement-math.ts` | 设备放置复用 snapToGrid |
| 右键菜单 | `ui/primitives/context-menu.tsx` | 设备右键：复制/删除/属性 |
| 框选 | `tools/select/box-select-tool.tsx` | 框选设备自动生效 |
| 墙体剖切 | `systems/wall/wall-cutout.tsx` | 展示模式 cutaway 自动隐藏面向相机的外墙 |
| 楼层切换 | `store/use-viewer.ts`（levelMode） | stacked/solo 控制外部/内部视角 |

## 小改即可（扩展现有系统）

| 功能 | 改什么 | 工作量 |
|------|--------|--------|
| 属性面板 | `panels/panel-manager.tsx` 加 `case 'device'` | 1 天 |
| 复制设备 | `floating-action-menu.tsx` 加 DeviceNode 分支 | 半天 |
| 导出 Excel | `export-manager.tsx` 旁加 Excel 导出 | 1 天 |
| 尺寸标注 | 参考 `wall-measurement-label.tsx` 做设备覆盖标注 | 1-2 天 |
| 快捷键 | `use-keyboard.ts` 加设备相关快捷键 | 半天 |
| 相机预设 | schema 已有，加 UI 保存/切换 | 1 天 |

## 不需要做的（原计划中但 Pascal 已覆盖）

| 原计划 | Pascal 已有 | 省了多少 |
|--------|-----------|---------|
| 2D 蓝图编辑器 | FloorplanPanel | 2-3 周 |
| 墙体几何系统 | WallSystem + mitering + CSG | 2 周 |
| 门窗开洞 | three-bvh-csg | 1 周 |
| 楼层管理 | LevelSystem | 1 周 |
| 底图导入描摹 | ScanSystem + GuideSystem | 1 周 |
| 3D/2D/Split 切换 | EditorLayoutV2 | 1 周 |
| 选中轮廓线 | PostProcessing Outline | 3 天 |
| 全局光照 | SSGI | 3 天 |
| Undo/Redo | Zundo 50 步 | 3 天 |

**总计节省约 10-12 周开发时间。**
