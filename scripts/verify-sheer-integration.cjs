/* Run with Playwright available in NODE_PATH. Requires local build served at 127.0.0.1:3110. */
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const output = path.resolve(process.argv[2] || 'docs/tmp/sheer-integration-2026-10-06')
const origin = process.env.STUDIO_FIXTURE_ORIGIN || 'http://127.0.0.1:3110'
const results = { tests: [], errors: [], warnings: [], failedRequests: [], externalRequests: [], screenshots: [] }
const mark = (test, details) => { results.tests.push({ test, ...details }); console.log('PASS', test) }
async function main() {
 const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] })
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: path.join(output, 'video'), size: { width: 1440, height: 1000 } } })
 const page = await context.newPage()
 page.on('pageerror', e => results.errors.push(e.message))
 page.on('console', m => { if (m.type() === 'error') results.errors.push(m.text()); if (m.type() === 'warning') results.warnings.push(m.text()) })
 page.on('response', r => { if (r.status() >= 400) results.failedRequests.push({ url: r.url(), status: r.status() }) })
 page.on('request', r => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:'+origin+'/')) results.externalRequests.push(r.url()) })
 const act = (method, ...args) => page.evaluate(({method,args}) => window.studioFixture[method](...args), {method,args})
 const snap = () => act('snapshot')
 const ready = async () => page.waitForFunction(() => window.studioFixture?.snapshot().devices.device_single.headerWidth > 0)
 const settle = async (id, width) => { await page.waitForFunction(({id,width}) => {
   const d=window.studioFixture.snapshot().devices[id]
   return Math.abs(d.headerWidth-width)<1e-5 && Math.abs(d.bottomWidth-width)<1e-5
 }, {id,width}, { timeout: 25000 }); await page.evaluate(id => new Promise(resolve => { let last=-1, stable=0; const tick=()=>{const version=window.studioFixture.snapshot().devices[id].version; stable=version===last?stable+1:0; last=version; if(stable>=3) resolve(); else requestAnimationFrame(tick)}; tick() }), id) }
 const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
 const shot = async name => { await frame(); await page.screenshot({path:path.join(output,name+'.png')}); results.screenshots.push(name+'.png') }
 await page.goto(origin); await ready(); await settle('device_single',1.92)
 const initial = await snap(); assert.equal(initial.samples,0); assert.equal(initial.devices.device_single.opacity,.36); assert.equal(initial.devices.device_single.alphaHash,false)
 await shot('01-device-closed')
 await page.getByRole('button',{name:'50%',exact:true}).click()
 assert.equal((await snap()).devices.device_single.state.position,50)
 await settle('device_single',1.12); await shot('02-device-half')
 await page.getByRole('button',{name:'100%',exact:true}).click(); await settle('device_single',.32); await shot('03-device-open')
 let current = await snap()
 assert.equal(current.devices.device_single.geometry,initial.devices.device_single.geometry)
 assert.deepEqual(current.devices.device_upper.state,initial.devices.device_upper.state)
 assert.deepEqual(current.parallelDeviceStates,{})
 mark('existing tool → useScene → DeviceRenderer → CurtainContainer, closed/half/open; geometry retained')
 await page.getByRole('button',{name:'0%',exact:true}).click()
 await page.waitForFunction(()=>window.studioFixture.snapshot().devices.device_single.headerWidth>.6)
 const reversal = (await snap()).devices.device_single.headerWidth
 await page.getByRole('button',{name:'100%',exact:true}).click(); await settle('device_single',.32)
 mark('rapid reversal reaches latest target', {reversalWidth:reversal})
 const idleVersion=(await snap()).devices.device_single.version; await page.waitForTimeout(600)
 assert.equal((await snap()).devices.device_single.version,idleVersion)
 await act('select','device_upper'); await act('set','device_single',{position:50}); await page.waitForTimeout(600)
 assert.equal((await snap()).devices.device_single.version,idleVersion)
 assert.equal((await snap()).devices.device_upper.state.position,80)
 await act('select','device_single'); await settle('device_single',1.12)
 mark('idle and hidden device pause; other-floor state isolated; showing again uses latest target')
 await act('select','device_dual'); await settle('device_dual',1.12)
 const dualBefore=(await snap()).devices.device_dual
 await act('set','device_dual',{layerPositions:[100,100]}); await settle('device_dual',.32)
 const dualAfter=(await snap()).devices.device_dual
 assert.equal(dualAfter.geometry,dualBefore.geometry)
 assert.deepEqual(dualAfter.blackoutGeometries,dualBefore.blackoutGeometries)
 assert.deepEqual(dualAfter.blackoutWidths,dualBefore.blackoutWidths)
 await act('set','device_dual',{layerPositions:[50,50]}); await settle('device_dual',1.12)
 await shot('04-device-dual-half'); await act('angle',.7); await shot('05-device-dual-side'); await act('angle',.12)
 mark('dual sheer target leaves blackout geometry unchanged; both channels render')
 await act('select','device_single'); await act('restore',100); await settle('device_single',.32)
 await act('mounted',false); await frame(); await act('mounted',true); await settle('device_single',.32)
 mark('existing setScene restoration and component remount start at saved target')
 await act('restore',0); await settle('device_single',1.92)
 assert.equal(await act('apply','scene_instant'),1)
 await page.waitForFunction(()=>window.studioFixture.snapshot().devices.device_single.state.position===65)
 await page.waitForTimeout(3500)
 const sceneSnap=(await snap()).devices.device_single
 assert(sceneSnap.headerWidth<1.12 && sceneSnap.headerWidth>.32)
 mark('existing zero-duration scene target drives sheer animation',{position:sceneSnap.state.position,headerWidth:sceneSnap.headerWidth})
 await act('apply','scene_duration')
 await page.waitForFunction(()=>window.studioFixture.snapshot().devices.device_single.state.position===100)
 await settle('device_single',.32)
 mark('duration scene reaches exact target 100 and rendered sheer settles open')
 await act('focus','lighting'); await frame(); assert.equal((await snap()).devices.device_single.opacity,.22)
 await act('focus','curtain'); await frame(); assert.equal((await snap()).devices.device_single.opacity,.36)
 await act('subsystemVisible',false); await frame(); assert.equal((await snap()).devices.device_single.geometry,undefined)
 await act('subsystemVisible',true); await frame(); assert.equal((await snap()).devices.device_single.opacity,.36)
 mark('existing subsystem focus and hide/show preserve sheer material')
 await act('mode','view'); await act('set','device_single',{position:0}); assert.equal((await snap()).devices.device_single.state.position,100); await act('mode','operate')
 mark('view-mode store guard remains in effect')
 for(const id of ['device_blackout','device_roller','device_roman','device_venetian']) {
   await act('select',id); await act('set',id,{position:50}); await page.waitForTimeout(600)
   assert.equal((await snap()).devices[id].geometry,undefined)
   await shot('regression-'+id)
 }
 await act('select','device_single'); await frame()
 const memory=[]
 for(let i=0;i<3;i++) {
   await act('mounted',false); await frame(); const unmounted=await snap()
   await act('mounted',true); await frame(); const mounted=await snap()
   memory.push({unmounted:unmounted.memory,mounted:mounted.memory})
 }
 assert.equal(memory[2].unmounted.geometries,memory[0].unmounted.geometries)
 assert.equal(memory[2].mounted.geometries,memory[0].mounted.geometries)
 mark('three unmount/remount cycles keep GPU geometry count stable',{memory})
 await act('placementProbe'); await frame()
 const placed=(await snap()).devices.device_single.worldAnchor
 assert(Math.abs(placed[0]+.92)<1e-5 && Math.abs(placed[1]-2.842)<1e-5)
 mark('linked window with nonzero device position is transformed once',{worldAnchor:placed})
 results.final=await snap()
 results.warnings=[...new Set(results.warnings)]
 const video=page.video(); await context.close(); results.video=await video.path()
 // StrictMode runs the actual new component setup/cleanup twice, separately from legacy controls.
 const strict=await browser.newPage({viewport:{width:1440,height:1000}})
 await strict.goto(origin+'/?strict&msaa')
 await strict.waitForFunction(()=>window.studioFixture?.snapshot().devices.device_single.headerWidth>0)
 const strictSnap=await strict.evaluate(()=>window.studioFixture.snapshot())
 assert.equal(strictSnap.devices.device_single.alphaToCoverage,true)
 assert.equal(strictSnap.devices.device_single.finite,true)
 await strict.screenshot({path:path.join(output,'06-device-msaa-closed.png')})
 mark('actual new component mounts under StrictMode and MSAA')
 results.strictSnapshot=strictSnap
 await strict.close(); await browser.close()
 assert.deepEqual(results.errors,[]); assert.deepEqual(results.failedRequests,[]); assert.deepEqual(results.externalRequests,[])
}
main().then(()=>{fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(results,null,2));console.log('Completed',results.tests.length,'browser checks')}).catch(error=>{results.failure=error.stack;fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(results,null,2));console.error(error);process.exit(1)})
