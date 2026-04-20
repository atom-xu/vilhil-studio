# 设备元数据维护规范（Product / Instance）

本文档定义 VilHil Studio 智能设备元数据的维护方式，目标是：
- 数据结构统一，不再出现“每人写一套字段”的情况
- 先可用再完整，支持渐进式补全
- 兼容当前编辑器，不影响放置/渲染/拓扑/报价流程

## 1. 分层模型

### Product 层（资产库维度）
- 文件：`packages/smarthome/src/meta/product-meta.ts`
- 挂载点：`packages/smarthome/src/device-catalog.ts` 的 `DeviceDefinition.productMeta`
- 含义：设备“是什么”，跨项目复用，不随项目变化
- 示例字段：
  - 身份：品牌、型号、中英文名称、分类
  - 规格：尺寸、安装方式、电气参数、协议
  - 能力：是否支持场景、按键数、传感器能力
  - 商业：参考价、生命周期状态

### Instance 层（项目维度）
- 文件：`packages/smarthome/src/meta/instance-meta.ts`
- 挂载点：`packages/core/src/schema/nodes/device.ts`
  - `instanceConfig`
  - `delivery`
  - `instanceMeta`
- 含义：设备“在项目里怎么用”，会随项目变化
- 示例字段：
  - 控制绑定（controls）
  - 场景关联（scenes）
  - 网关/总线地址（gateway_id / bus_address）
  - 交付状态（quoted / purchased / installed / commissioned）

## 2. 当前实现策略

`device-catalog.ts`中采用“双轨策略”：

1. **高质量手工覆盖**：`PRODUCT_META_OVERRIDES`
  - 当前已覆盖目录内全部 23 个设备（全量覆盖）
  - 新设备接入后，优先补充 override，避免回退到兜底推导

2. **自动推导兜底**：`deriveProductMeta(def)`
  - 对未覆盖设备，从现有 `DeviceDefinition` 自动生成基础元数据
  - 保证任何设备都能返回 `SmartProduct`，不会出现空白

## 3. 新增设备时怎么写

### 步骤 A：先补 DeviceDefinition（必做）
- 位置：`packages/smarthome/src/device-catalog.ts`
- 必填：`catalogId / name / subtype / size / subsystem / mountType`

### 步骤 B：决定元数据深度
- 默认策略：直接添加到 `PRODUCT_META_OVERRIDES`
- 临时策略（只允许短期）：先依赖自动推导，务必在同一迭代补回 override

### 步骤 C：校验
- 至少执行：
```bash
bunx tsc -p packages/smarthome/tsconfig.json --noEmit
bunx tsc -p packages/core/tsconfig.json --noEmit
```

## 4. ProductMeta 填写模板

```ts
const EXAMPLE: SmartProduct = {
  id: 'PANEL-SWITCH-2KEY',
  version: '1.0.0',
  identity: {
    brand: 'VilHil',
    model: 'Panel-2Key',
    name_zh: '双路开关',
    name_en: '2-Gang Smart Switch',
    category: 'control_panel',
    subcategory: 'mechanical_switch',
  },
  physical: {
    dimensions_mm: { w: 86, h: 8, d: 86 },
    mount_type: 'wall_switch',
  },
  electrical: {
    power_source: 'mains_powered',
    voltage: '220V AC',
    power_consumption_w: 1.8,
    max_load_w: 1200,
  },
  protocol: {
    primary: 'zigbee',
    supported: ['zigbee'],
    gateway_required: true,
    compatible_gateways: ['INFRA-SMART-HOST'],
  },
  capabilities: {
    scenes: false,
    has_screen: false,
    buttons: 2,
  },
  commercial: {
    price_rmb: 480,
    price_tier: 'budget',
    lifecycle_status: 'active',
    release_year: 2025,
  },
  assets: {
    fallback_geometry: { type: 'box', dimensions: [86, 8, 86] },
  },
  metadata: {
    source: 'manual',
    verified: true,
  },
}
```

## 5. Instance 层建议写法

建议由“放置后流程”填充（而不是产品库里硬编码）：

- 交付默认值：`createDefaultDelivery()`
- 状态展示：`getDeliveryStatusText(delivery)`
- 标签到名称：`getInstanceLabel(meta, fallback)`

常见规则：
- `configuration.custom_label`：项目内可读名称（例如“3F-走廊-主灯开关”）
- `configuration.controls`：每个控制通道明确 `target_id + function`
- `delivery`：按真实项目推进更新，不用一次性写满

## 6. 维护边界（必须遵守）

- Product 与 Instance 不混写
  - 产品协议写在 Product，不写在单个实例里重复维护
  - 项目交付状态写在 Instance，不回写产品库
- 所有 ID 使用稳定主键
  - 产品层：`catalogId` / `SmartProduct.id`
  - 实例层：`DeviceNode.id`
- 字段尽量枚举化
  - 分类、子类、交付状态保持统一值域

## 7. 推荐迭代顺序

1. 先补齐“核心控制链路”设备（网关/主机/面板/摄像头）
2. 再补传感器、暖通、窗帘等边缘设备
3. 最后补商业字段深度（生命周期、年份、渠道价格）

---

维护负责人建议：
- 产品元数据：前端架构 + 方案设计
- 实例元数据：项目实施/交付同学
