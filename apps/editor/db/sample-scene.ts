/**
 * 客厅样板间 — 场景图数据
 *
 * 结构：
 *   site_sample_01
 *   └─ building_sample_01（客厅楼栋）
 *      └─ level_sample_01（一楼）
 *         ├─ wall_s01 ~ wall_s04（6m × 4m 矩形客厅，墙高 2.8m）
 *         ├─ device_light_01 ~ 03（天花筒灯 × 3，均匀排布）
 *         └─ device_panel_01（墙壁开关面板，西墙入口处）
 *
 * 注意：
 *   - 坐标系 Y 轴朝上，地面 Y=0，天花 Y=2.8
 *   - 墙壁端点单位：米，start/end 为 [X, Z]（Y 轴俯视坐标）
 *   - device position = [X, Y, Z]
 */

export const SAMPLE_SCENE_DATA = {
  nodes: {
    // ── Site ─────────────────────────────────────────────────────────
    'site_sample_01': {
      object: 'node',
      id: 'site_sample_01',
      type: 'site',
      parentId: null,
      visible: true,
      metadata: {},
      children: [{ type: 'building', id: 'building_sample_01' }],
    },

    // ── Building ──────────────────────────────────────────────────────
    'building_sample_01': {
      object: 'node',
      id: 'building_sample_01',
      type: 'building',
      parentId: 'site_sample_01',
      visible: true,
      metadata: {},
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      children: ['level_sample_01'],
    },

    // ── Level ─────────────────────────────────────────────────────────
    'level_sample_01': {
      object: 'node',
      id: 'level_sample_01',
      type: 'level',
      parentId: 'building_sample_01',
      name: '一楼',
      visible: true,
      metadata: {},
      level: 0,
      northAngle: 0,
      children: [
        'wall_s01',
        'wall_s02',
        'wall_s03',
        'wall_s04',
        'device_light_01',
        'device_light_02',
        'device_light_03',
        'device_panel_01',
      ],
    },

    // ── 四面墙（6m × 4m 客厅，厚度 0.2m，高 2.8m）────────────────────
    // 南墙：(0,0) → (6,0)
    'wall_s01': {
      object: 'node',
      id: 'wall_s01',
      type: 'wall',
      parentId: 'level_sample_01',
      visible: true,
      metadata: {},
      children: [],
      start: [0, 0],
      end: [6, 0],
      thickness: 0.2,
      height: 2.8,
      frontSide: 'interior',
      backSide: 'exterior',
    },
    // 东墙：(6,0) → (6,4)
    'wall_s02': {
      object: 'node',
      id: 'wall_s02',
      type: 'wall',
      parentId: 'level_sample_01',
      visible: true,
      metadata: {},
      children: [],
      start: [6, 0],
      end: [6, 4],
      thickness: 0.2,
      height: 2.8,
      frontSide: 'interior',
      backSide: 'exterior',
    },
    // 北墙：(6,4) → (0,4)
    'wall_s03': {
      object: 'node',
      id: 'wall_s03',
      type: 'wall',
      parentId: 'level_sample_01',
      visible: true,
      metadata: {},
      children: [],
      start: [6, 4],
      end: [0, 4],
      thickness: 0.2,
      height: 2.8,
      frontSide: 'interior',
      backSide: 'exterior',
    },
    // 西墙：(0,4) → (0,0)
    'wall_s04': {
      object: 'node',
      id: 'wall_s04',
      type: 'wall',
      parentId: 'level_sample_01',
      visible: true,
      metadata: {},
      children: [],
      start: [0, 4],
      end: [0, 0],
      thickness: 0.2,
      height: 2.8,
      frontSide: 'interior',
      backSide: 'exterior',
    },

    // ── 天花筒灯 × 3（均匀排列在客厅中央纵列）─────────────────────────
    'device_light_01': {
      object: 'node',
      id: 'device_light_01',
      type: 'device',
      parentId: 'level_sample_01',
      visible: true,
      metadata: {},
      subsystem: 'lighting',
      renderType: 'spot',
      mountType: 'ceiling',
      position: [1.5, 2.75, 2],
      rotation: [0, 0, 0],
      productId: 'DOWNLIGHT-COB-7W',
      productName: '嵌入式筒灯 7W',
      params: {
        beamAngle: 36,
        elevation: 2.75,
      },
      state: { on: true, brightness: 100, colorTemp: 4000 },
      showAnimation: true,
    },
    'device_light_02': {
      object: 'node',
      id: 'device_light_02',
      type: 'device',
      parentId: 'level_sample_01',
      visible: true,
      metadata: {},
      subsystem: 'lighting',
      renderType: 'spot',
      mountType: 'ceiling',
      position: [3, 2.75, 2],
      rotation: [0, 0, 0],
      productId: 'DOWNLIGHT-COB-7W',
      productName: '嵌入式筒灯 7W',
      params: {
        beamAngle: 36,
        elevation: 2.75,
      },
      state: { on: true, brightness: 100, colorTemp: 4000 },
      showAnimation: true,
    },
    'device_light_03': {
      object: 'node',
      id: 'device_light_03',
      type: 'device',
      parentId: 'level_sample_01',
      visible: true,
      metadata: {},
      subsystem: 'lighting',
      renderType: 'spot',
      mountType: 'ceiling',
      position: [4.5, 2.75, 2],
      rotation: [0, 0, 0],
      productId: 'DOWNLIGHT-COB-7W',
      productName: '嵌入式筒灯 7W',
      params: {
        beamAngle: 36,
        elevation: 2.75,
      },
      state: { on: true, brightness: 100, colorTemp: 4000 },
      showAnimation: true,
    },

    // ── 墙壁开关面板（西墙入口处，1.2m 高）────────────────────────────
    'device_panel_01': {
      object: 'node',
      id: 'device_panel_01',
      type: 'device',
      parentId: 'level_sample_01',
      visible: true,
      metadata: {},
      subsystem: 'panel',
      renderType: 'panel',
      mountType: 'wall_switch',
      position: [0.1, 1.2, 0.5],
      rotation: [0, 0, 0],
      productId: 'PANEL-SMART-4KEY',
      productName: '智能场景面板 4键',
      params: {
        buttonCount: 4,
        wallId: 'wall_s04',
        wallT: 0.1,
        wallSide: 'front',
        panelKeys: [
          { keyIndex: 0, label: '全开', action: { type: 'set', deviceIds: ['device_light_01', 'device_light_02', 'device_light_03'], state: { on: true, brightness: 100 } } },
          { keyIndex: 1, label: '全关', action: { type: 'set', deviceIds: ['device_light_01', 'device_light_02', 'device_light_03'], state: { on: false } } },
          { keyIndex: 2, label: '阅读', action: { type: 'set', deviceIds: ['device_light_01', 'device_light_02', 'device_light_03'], state: { on: true, brightness: 80, colorTemp: 5000 } } },
          { keyIndex: 3, label: '休闲', action: { type: 'set', deviceIds: ['device_light_01', 'device_light_02', 'device_light_03'], state: { on: true, brightness: 40, colorTemp: 2700 } } },
        ],
      },
      state: {},
      showAnimation: false,
    },
  },
  rootNodeIds: ['site_sample_01'],
} as const

/** 样板间的唯一标识 slug，用于 seed 和 auto-fork 查询 */
export const SAMPLE_PROJECT_SLUG = '__system_sample_living_room__'

export type SampleSceneData = typeof SAMPLE_SCENE_DATA
