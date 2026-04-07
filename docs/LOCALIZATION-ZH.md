# VilHil Studio 汉化对照表

> 供 Kimi 执行，直接搜索替换
> 方式：在 `packages/editor/src/` 目录下全局搜索英文，替换为中文

---

## P0 — 工具栏 + 导航（优先）

### 顶部导航
```
Scene → 场景
3D → 3D
2D → 2D
Split → 分屏
Stack → 堆叠
Full height → 全高
Preview → 预览
```

### 结构工具 (Structure)
```
Structure → 结构
Wall → 墙体
Slab → 楼板
Ceiling → 天花板
Gable Roof → 人字屋顶
Stairs → 楼梯
Door → 门
Window → 窗
Zone → 区域
```

### 家具工具 (Furnish)
```
Furnish → 家具
Furniture → 家具
Appliance → 电器
Kitchen → 厨房
Bathroom → 卫浴
Outdoor → 户外
```

### 视图控制
```
Pan → 平移
Rotate → 旋转
Zoom → 缩放
Grid → 网格
Guides → 参考图
Scans → 扫描图
Orbit → 环绕
```

### 左侧栏
```
Site → 项目
Building → 建筑
Level → 楼层
Add level → 添加楼层
Upload scan/floorplan → 上传底图
No elements on this level → 本层暂无元素
Zones → 区域
Settings → 设置
```

---

## P1 — 属性面板

### 通用属性
```
Position → 位置
Rotation → 旋转
Scale → 缩放
Dimensions → 尺寸
Height → 高度
Width → 宽度
Depth → 深度
Length → 长度
Thickness → 厚度
Material → 材质
Color → 颜色
Roughness → 粗糙度
Metalness → 金属度
Opacity → 透明度
Info → 信息
Actions → 操作
Move → 移动
Duplicate → 复制
Delete → 删除
Done → 完成
```

### 墙体面板
```
Wall thickness → 墙体厚度
Wall height → 墙体高度
```

### 门面板
```
Frame → 门框
Swing → 开启方向
Threshold → 门槛
Handle → 把手
Hardware → 五金
Closer → 闭门器
Horizontal → 水平
Vertical → 垂直
```

### 窗面板
```
Grid → 格栅
Columns → 列数
Rows → 行数
Divider → 分隔条
Sill → 窗台
```

### 楼板/天花面板
```
Holes → 开洞
Elevation → 标高
```

### 屋顶面板
```
Segments → 分段
Overhang → 出挑
Pitch → 坡度
Ridge → 屋脊
```

### 楼梯面板
```
Steps → 踏步数
Add flight → 添加梯段
Add landing → 添加平台
Type → 类型
Attachment → 连接方式
```

### 物品面板
```
Collections → 集合
```

---

## P2 — 设置 + 对话框

### 设置面板
```
Export → 导出
Save → 保存
Load → 加载
Audio Settings → 音频设置（删除此功能）
Keyboard Shortcuts → 快捷键
Scene Graph → 场景树
```

### 快捷键分类
```
Editor Navigation → 编辑器导航
Modes & History → 模式与历史
Selection → 选择
Drawing Tools → 绘图工具
Item Placement → 物品放置
Camera → 相机
```

### 快捷键描述
```
Set wall start / end → 设置墙体起点/终点
Allow non-45° angles → 允许非45°角度
Cancel → 取消
Left click → 左键点击
Right click → 右键点击
Undo → 撤销
Redo → 重做
Select all → 全选
Box select → 框选
```

### 导出
```
Export as GLB → 导出 GLB
Export as STL → 导出 STL
Export as OBJ → 导出 OBJ
```

---

## P3 — 错误提示 + Toast

```
Loading... → 加载中...
Processing... → 处理中...
No active project → 暂无活动项目
Invalid file type → 文件类型无效
Please upload a .glb/.gltf scan or an image → 请上传 .glb/.gltf 扫描文件或图片
```

---

## 执行方式

1. 在 `packages/editor/src/` 目录下搜索英文字符串
2. 替换为对应中文
3. 注意 `label=`、`title=`、`alt=`、`placeholder=` 中的文本
4. 注意 JSX 文本节点中的英文
5. **不改** className、变量名、函数名、注释
6. **不改** `packages/core/` 和 `packages/viewer/` 中的代码
7. 每替换一批后跑 `bun dev` 确认没报错
