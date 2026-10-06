import { afterEach, describe, expect, mock, test } from 'bun:test'
let nodes: Record<string, any> = {}
const writes: Array<{ id: string; state: any }> = []
let sequence = 0
let readOnly = false
const patches: any[] = []
const store = {
  get nodes() { return nodes },
  get readOnly() { return readOnly },
  updateNode(id: string, patch: any) { patches.push(patch); nodes[id] = { ...nodes[id], ...patch }; if (patch.state) writes.push({ id, state: { ...patch.state } }) },
  createNode(node: any) { nodes[node.id] = node },
}
mock.module('@pascal-app/core', () => ({
  useScene: { getState: () => store }, generateId: () => `device_${++sequence}`,
  DeviceNode: { shape: { position: { parse: (p: number[]) => p.map(v => Math.round(v * 100) / 100) } }, parse: (n: any) => ({ ...n, type: 'device', rotation: [0, 0, 0] }) },
  SceneNode: { parse: (n: any) => n },
}))
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 5) as any
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
const { applyScene, getSceneRunStatus } = await import('../packages/smarthome/src/tools/scene-tools')
const { checkDevicePlacement, checkDevicePlacementEdit, updateDevicePlacement, deviceBoxesOverlap } = await import('../packages/smarthome/src/tools/device-placement')
const { placeDevice } = await import('../packages/smarthome/src/tools/place-device')
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
function device(id: string, state = {}, position = [0, 2.7, 0], parentId = 'level_a', productId = 'LIGHT-DOWNLIGHT') {
  return { id, type: 'device', parentId, productId, position, params: {}, rotation: [0, 0, 0], state }
}
function scene(id: string, effects: any[]) { nodes[id] = { id, type: 'scene', effects } }
afterEach(async () => { await sleep(150); nodes = {}; writes.length = 0; patches.length = 0; readOnly = false })
describe('scene transitions', () => {
  test('light and curtain interpolate, then status completes after exact final state', async () => {
    nodes.light = device('light', { on: false, brightness: 0 })
    nodes.curtain = device('curtain', { position: 0 })
    scene('home', [{ deviceId: 'light', state: { on: true, brightness: 80 }, duration: .08 },
      { deviceId: 'curtain', state: { position: 100 }, delay: .03, duration: .08 }])
    expect(applyScene('home')).toBe(2)
    await sleep(40)
    expect(nodes.light.state.brightness).toBeGreaterThan(0)
    expect(nodes.light.state.brightness).toBeLessThan(80)
    expect(getSceneRunStatus().running).toBe(true)
    await sleep(100)
    expect(nodes.light.state).toEqual({ on: true, brightness: 80 })
    expect(nodes.curtain.state.position).toBe(100)
    expect(getSceneRunStatus().running).toBe(false)
  })
  test('new run cancels in-flight tween and delayed old effect', async () => {
    nodes.light = device('light', { brightness: 0 })
    scene('old', [{ deviceId: 'light', state: { brightness: 100 }, duration: .1 }, { deviceId: 'light', state: { brightness: 99 }, delay: .12 }])
    scene('new', [{ deviceId: 'light', state: { brightness: 20 }, duration: .03 }])
    applyScene('old'); await sleep(25); applyScene('new'); await sleep(160)
    expect(nodes.light.state.brightness).toBe(20)
    expect(getSceneRunStatus().sceneId).toBe('new')
    expect(getSceneRunStatus().running).toBe(false)
  })
  test('retrigger same scene and overlapping steps settle correctly', async () => {
    nodes.light = device('light', { brightness: 0 })
    scene('repeat', [{ deviceId: 'light', state: { brightness: 100 }, duration: .1 }, { deviceId: 'light', state: { brightness: 30 }, delay: .02, duration: .04 }])
    applyScene('repeat'); await sleep(10); applyScene('repeat'); await sleep(130)
    expect(nodes.light.state.brightness).toBe(30)
    expect(getSceneRunStatus().running).toBe(false)
  })
  test('off is deferred until fade completes; missing curtain state uses rendered default', async () => {
    nodes.light = device('light', { on: true, brightness: 80 }); nodes.curtain = device('curtain')
    scene('off', [{ deviceId: 'light', state: { on: false, brightness: 0 }, duration: .08 }, { deviceId: 'curtain', state: { position: 100 }, duration: .08 }])
    applyScene('off'); await sleep(30)
    expect(nodes.light.state.on).toBe(true)
    expect(nodes.curtain.state.position).toBeGreaterThan(0)
    expect(nodes.curtain.state.position).toBeLessThan(100)
    await sleep(80)
    expect(nodes.light.state).toEqual({ on: false, brightness: 0 })
  })
  test('deleted scheduled target completes without recreating device', async () => {
    nodes.light = device('light'); scene('delete', [{ deviceId: 'light', state: { brightness: 10 }, delay: .02, duration: .03 }])
    applyScene('delete'); delete nodes.light; await sleep(70)
    expect(nodes.light).toBeUndefined(); expect(getSceneRunStatus().running).toBe(false)
  })
})
describe('placement', () => {
  test('edit resolves nested floor, quantizes height, avoids no-op history, and respects read-only', () => {
    nodes.level_a = {id:'level_a', type:'level', parentId:null}
    nodes.group = {id:'group',type:'group',parentId:'level_a'}
    nodes.a = device('a', {}, [0,1,0], 'group')
    updateDevicePlacement('a',{position:[0,1.004,0]}); expect(patches.length).toBe(0)
    updateDevicePlacement('a',{position:[0,1.016,0]}); expect(nodes.a.position[1]).toBe(1.02)
    readOnly = true; updateDevicePlacement('a',{position:[0,2,0],direction:90})
    expect(nodes.a.position[1]).toBe(1.02); expect(nodes.a.params).toEqual({}); expect(patches.length).toBe(1)
  })
  test('combined placement edit fails atomically and retains existing line/curtain scope', () => {
    nodes.level_a = {id:'level_a',type:'level',parentId:null}
    nodes.a = device('a', {}, [0,1,0]); nodes.b = device('b')
    expect(() => updateDevicePlacement('a',{position:[0,2.7,0],direction:90})).toThrow('位置已被占用')
    expect(nodes.a.position).toEqual([0,1,0]); expect(nodes.a.params).toEqual({}); expect(patches.length).toBe(0)
    expect(checkDevicePlacementEdit('a',{position:[0,1] as any}).valid).toBe(false)
    nodes.a.productId='LIGHT-STRIP'; updateDevicePlacement('a',{position:[0,2.7,0]}); expect(nodes.a.position[1]).toBe(2.7)
    nodes.a.productId='CURTAIN-SIDE-OPEN'; expect(checkDevicePlacementEdit('a',{direction:90}).valid).toBe(true)
  })

  test('height edit rejects overlap atomically then recovers without touching anchors', () => {
    nodes.level_a = { id:'level_a', type:'level', parentId:null }
    nodes.a = device('a', {}, [0,1,0]); nodes.a.params = {wallId:'wall', wallT:.3, wallSide:'front', direction:16}
    nodes.b = device('b', {}, [0,2.7,0])
    const before = JSON.stringify(nodes.a)
    expect(() => updateDevicePlacement('a',{position:[0,2.7,0]})).toThrow('位置已被占用')
    expect(JSON.stringify(nodes.a)).toBe(before)
    updateDevicePlacement('a',{position:[0,1.5,0]})
    expect(nodes.a.position).toEqual([0,1.5,0]); expect(nodes.a.params).toEqual({wallId:'wall',wallT:.3,wallSide:'front',direction:16})
  })
  test('rotation edit uses candidate yaw and rejects atomically; floor/self and custom devices stay compatible', () => {
    nodes.level_a = { id:'level_a', type:'level', parentId:null }
    nodes.a = device('a', {}, [0,1.8,0], 'level_a','LIGHT-WALL')
    nodes.b = device('b', {}, [0,1.8,.10], 'level_a','LIGHT-WALL')
    expect(checkDevicePlacementEdit('a',{direction:0}).valid).toBe(true)
    expect(() => updateDevicePlacement('a',{direction:90})).toThrow('位置已被占用')
    expect(nodes.a.params).toEqual({})
    updateDevicePlacement('a',{direction:0}); expect(nodes.a.params.direction ?? 0).toBe(0)
    nodes.b.parentId = 'level_b'; updateDevicePlacement('a',{direction:90}); expect(nodes.a.params.direction).toBe(90)
    expect(() => updateDevicePlacement('a',{direction:NaN})).toThrow('放置位置无效')
    nodes.a.productId='custom'; expect(checkDevicePlacementEdit('a',{direction:90}).valid).toBe(true)
    expect(checkDevicePlacementEdit('missing',{}).valid).toBe(false)
  })

  test('existing-device moves exclude self, reject another footprint, and keep floor scope', () => {
    nodes.a = device('a')
    nodes.b = device('b', {}, [1,2.7,0])
    expect(checkDevicePlacement('level_a','LIGHT-DOWNLIGHT',[0,2.7,0],0,nodes,'a').valid).toBe(true)
    expect(checkDevicePlacement('level_a','LIGHT-DOWNLIGHT',[1,2.7,0],0,nodes,'a')).toMatchObject({valid:false, conflictingId:'b'})
    expect(checkDevicePlacement('level_a','LIGHT-DOWNLIGHT',[.5,2.7,0],0,nodes,'a').valid).toBe(true)
    nodes.b.parentId = 'level_b'
    expect(checkDevicePlacement('level_a','LIGHT-DOWNLIGHT',[1,2.7,0],0,nodes,'a').valid).toBe(true)
  })

  test('occupied same-level position is rejected by both preview and actual tool', () => {
    nodes.a = device('a')
    expect(checkDevicePlacement('level_a', 'LIGHT-DOWNLIGHT', [0,2.7,0])).toMatchObject({valid:false, reason:'occupied'})
    expect(() => placeDevice('level_a','LIGHT-DOWNLIGHT',[0,2.7,0])).toThrow('位置已被占用')
    expect(Object.keys(nodes)).toEqual(['a'])
  })
  test('other floors and host wall/ceiling do not block; legal position is created', () => {
    nodes.a = device('a', {}, [0,2.7,0], 'level_b')
    nodes.wall = { id:'wall', type:'wall', parentId:'level_a' }
    nodes.ceiling = { id:'ceiling', type:'ceiling', parentId:'level_a' }
    expect(checkDevicePlacement('level_a','LIGHT-DOWNLIGHT',[0,2.7,0]).valid).toBe(true)
    const id = placeDevice('level_a','LIGHT-DOWNLIGHT',[0,2.7,0]); expect(nodes[id].parentId).toBe('level_a')
  })
  test('nested device is scoped to ancestor floor and vertical separation is valid', () => {
    nodes.group = { id:'group', type:'group', parentId:'level_a' }; nodes.a = device('a', {}, [0,2.7,0], 'group')
    expect(checkDevicePlacement('level_a','LIGHT-DOWNLIGHT',[0,2.7,0]).valid).toBe(false)
    expect(checkDevicePlacement('level_a','LIGHT-DOWNLIGHT',[0,1.3,0]).valid).toBe(true)
  })
  test('exact contact allowed, tiny actual overlap rejected; rotated thin boxes use SAT', () => {
    expect(deviceBoxesOverlap([0,0,0],[1,1,1],0,[1,0,0],[1,1,1],0)).toBe(false)
    expect(deviceBoxesOverlap([0,0,0],[1,1,1],0,[.99,0,0],[1,1,1],0)).toBe(true)
    expect(deviceBoxesOverlap([0,0,0],[2,1,.1],Math.PI/4,[0,0,.3],[2,1,.1],Math.PI/4)).toBe(false)
    expect(deviceBoxesOverlap([0,0,0],[2,1,.1],Math.PI/4,[0,0,0],[2,1,.1],-Math.PI/4)).toBe(true)
  })
  test('preview uses schema quantization before allowing contact', () => {
    nodes.a = device('a')
    expect(checkDevicePlacement('level_a','LIGHT-DOWNLIGHT',[-.085,2.7,0]).valid).toBe(false)
    expect(checkDevicePlacement('level_a','LIGHT-DOWNLIGHT',[.085,2.7,0]).valid).toBe(true)
  })
  test('invalid coordinates rejected; line footprints retain existing workflow', () => {
    expect(checkDevicePlacement('level_a','LIGHT-DOWNLIGHT',[NaN,0,0]).valid).toBe(false)
    expect(checkDevicePlacement('level_a','LIGHT-STRIP',[0,0,0]).valid).toBe(true)
    nodes.curtain = device('curtain', {}, [0,2.5,0], 'level_a', 'CURTAIN-SIDE-OPEN')
    expect(checkDevicePlacement('level_a','CURTAIN-SIDE-OPEN',[0,2.5,.03]).valid).toBe(true)
  })
})
