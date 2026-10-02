# GLB 模型渲染标准

> 所有设备目录页的 3D Hero 渲染和缩略图生成必须遵循本规范。
> 参考对标：UniFi Store 产品页（`<model-viewer>` + `neutral` IBL + `exposure=0.9`）。

## 1. 黄金渲染参数（不可随意修改）

```
Canvas:
  flat: true                        # 关闭默认 ACES 色调映射
  camera.fov: 24°                   # 窄视角，产品感（UniFi 用 23.24°）
  camera.position: [1.2, 1.4, 2.2]  # 偏前上方 3/4 视角
  gl.antialias: true

ToneMapping:
  gl.toneMapping: THREE.NoToneMapping   # 白色保真，不被压灰

灯光:
  directionalLight: 【禁止】         # 方向光会在光滑表面产生镜面高光条纹
  ambientLight:     【禁止】         # 环境光会压平对比度，丢失立体感
  pointLight:       【禁止】         # 同上

  唯一光源 → Environment IBL:
    preset: "studio"
    environmentIntensity: 0.75          # 兼顾纯白模型（防过曝）与深色模型（保细节）

背景:
  BackgroundPlane:
    color: "#ffffff"
    toneMapped: false               # 背景不受色调映射影响，保持纯白

阴影:
  ContactShadows:
    opacity: 0.45
    blur: 0.5
    far: 1
    resolution: 512
    width: 1
    height: 1
    position.y: 动态计算（-height/2，由 Center.onCentered 回调获取）
```

### 为什么禁止 directionalLight

| 问题 | 原因 |
|---|---|
| 黑色/光滑表面出现白色反光条 | directionalLight 产生镜面高光 |
| 白色偏灰 | 多光源叠加后需要 tone mapping 压缩，导致白色被压灰 |
| 不同模型需要不同灯光角度 | IBL 是全方位照明，对所有模型一致 |

### 为什么用 NoToneMapping

UniFi 的 `<model-viewer>` 使用接近 linear 的渲染管线 + exposure 控制。
Three.js 默认的 `ACESFilmicToneMapping` 会将接近 1.0 的白色值压缩到 0.83-0.96（sRGB），
导致白色设备永远看起来偏灰。`NoToneMapping` + 纯 IBL 是最接近 model-viewer 效果的组合。

## 2. 模型处理规则

### 2.1 尺寸归一化

所有 GLB 模型加载后，按最大维度归一化到 `0.7` 单位：

```ts
const box = new THREE.Box3().setFromObject(scene)
const size = box.getSize(new THREE.Vector3())
const maxDim = Math.max(size.x, size.y, size.z)
const normalizedScale = maxDim > 0 ? 0.7 / maxDim : 1
```

### 2.2 居中

使用 drei `<Center>` 组件自动居中，并通过 `onCentered` 回调获取模型高度，
动态定位 ContactShadows 的 Y 坐标。

### 2.3 朝向

每个模型通过 `MODEL_ROTATION_Y` 表指定 Y 轴旋转弧度，确保正面朝向相机。
新模型入库时必须设置此值。

### 2.4 材质要求

- GLB 模型应使用 `glTF` PBR 材质（metallic-roughness 工作流）
- 白色部件：baseColor 接近 `#ffffff`，roughness ≥ 0.35（避免镜面反射过强导致 IBL 热点过曝）
- 黑色部件：baseColor 接近 `#1a1a1a`，roughness ≥ 0.4（哑光质感）
- 避免过低的 roughness（< 0.15），`NoToneMapping` + IBL 环境下低 roughness 白色表面会剪切为纯白丢失细节
- **纯白模型特别注意**：当整体外壳均为白色时，建议 roughness ≥ 0.4，否则 IBL 的 studio 热点会在曲面上产生过曝区域与白色背景融合。参考标杆：UniFi G6 Pro 360 的白色外壳 roughness ≈ 0.35–0.45

### 2.5 颜色变体

支持同一设备的多色变体（如白色/黑色款）：
- 默认款：`/items/{catalogId}/model.glb`
- 黑色款：`/items/{catalogId}/model-black.glb`
- 在 `DEVICE_COLOR_VARIANTS` 中注册变体信息

## 3. 缩略图规则

### 3.1 目录列表缩略图

| 属性 | 值 |
|---|---|
| 尺寸 | 至少 400x400px |
| 格式 | WebP（通用设备）/ PNG（带透明通道的 UniFi 设备） |
| 背景 | 透明或 #ffffff |
| 命名 | `thumbnail.webp` 或 `thumbnail.png` |
| 变体 | `thumbnail-black.png` |
| 存放路径 | `/public/items/{catalogId}/` |

### 3.2 缩略图渲染要求

缩略图必须使用与 3D Hero **相同的渲染参数**生成：

- 纯 IBL 照明（studio preset, intensity 0.75）
- NoToneMapping
- 白色背景（或透明）
- 相同的相机 FOV (24°) 和 3/4 视角
- 包含 ContactShadows

**禁止**：使用不同的灯光设置、色调映射、或手动截图替代标准渲染。

### 3.3 文件目录结构

```
/public/items/{catalogId}/
  ├── model.glb              # 默认/白色款模型
  ├── model-black.glb        # 黑色款模型（如有）
  ├── thumbnail.webp         # 默认缩略图
  ├── thumbnail.png          # PNG 格式（UniFi 品牌）
  └── thumbnail-black.png    # 黑色款缩略图（如有）
```

## 4. 新模型入库检查清单

- [ ] GLB 文件放入 `/public/items/{catalogId}/model.glb`
- [ ] 在 `CATALOG_GLB_MAP` 中注册路径映射
- [ ] 在 `MODEL_ROTATION_Y` 中设置正面朝向角度
- [ ] 如有颜色变体，在 `DEVICE_COLOR_VARIANTS` 中注册
- [ ] 生成符合规范的缩略图
- [ ] 在 3D Hero 页面目视验证：白色纯白、黑色深黑、无异常高光
- [ ] 检查阴影是否贴合模型底部

## 5. 调试排错

| 现象 | 原因 | 修复 |
|---|---|---|
| 白色偏灰 | 使用了 ACES/AgX 色调映射 | 确认 `flat` + `NoToneMapping` |
| 光滑表面出现白色条纹 | 加了 directionalLight | 删除所有方向光 |
| 模型整体偏平/无立体感 | 加了 ambientLight | 删除环境光，纯靠 IBL |
| 阴影与模型脱离 | shadowY 硬编码 | 使用 Center.onCentered 动态计算 |
| 模型太暗 | environmentIntensity 过低 | 调到 0.75（不超过 1.0） |
| 模型过曝/细节丢失 | environmentIntensity 过高 | 降到 0.75 |
| 纯白模型与背景融合 | roughness 过低 + NoToneMapping | 提高白色部件 roughness ≥ 0.4 |

## 6. 更新记录

- 2025-05-17: 降低 environmentIntensity 至 0.75，解决纯白模型过曝问题；增加白色材质 roughness 指导。
- 2025-05-17: 初版。基于 UniFi Store 对标调优确立渲染标准。
