import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { appendLog } from './dev-service.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireApp = createRequire(path.join(root, 'apps/editor/package.json'))
const environment = requireApp.resolve('next/dist/server/node-environment')
const handlers = requireApp.resolve(
  'next/dist/server/node-environment-extensions/process-error-handlers',
)
const guard = path.join(root, 'scripts/dev-output-guard.cjs')

function fixture(t, code, env = {}, stdio = ['ignore', 'pipe', 'pipe', 'ipc']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-stdio-test-'))
  const fault = path.join(dir, 'faults.log')
  const child = spawn(process.execPath, ['--require', guard, '-e', code], {
    env: { ...process.env, VILHIL_DEV_OWNER_PID: '', VILHIL_DEV_FAULT_LOG: fault, ...env },
    stdio,
  })
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return { child, fault }
}

for (const stream of ['stdout', 'stderr']) {
  test(`Next ${stream} EPIPE exits once instead of recursively logging`, {
    timeout: 5000,
  }, async (t) => {
    const { child, fault } = fixture(
      t,
      `
      require(${JSON.stringify(environment)});
      require(${JSON.stringify(handlers)}).installProcessErrorHandlers();
      process.send('ready');
      process.once('message', () => process.${stream}.write('trigger\\n'));
      setInterval(() => {}, 1000);
    `,
    )
    const exit = once(child, 'exit')
    await once(child, 'message')
    child[stream].destroy()
    child.send('write')
    const [code, signal] = await exit
    assert.equal(code, 74)
    assert.equal(signal, null)
    const faults = fs.readFileSync(fault, 'utf8').trim().split('\n')
    assert.equal(faults.length, 1)
    assert.match(faults[0], new RegExp(`${stream}: EPIPE`))
  })
}

test('ordinary exceptions keep their diagnostic and nonzero exit', { timeout: 5000 }, async (t) => {
  const { child, fault } = fixture(t, "throw new Error('application-error-sentinel')")
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  const [code] = await once(child, 'close')
  assert.equal(code, 1)
  assert.match(stderr, /application-error-sentinel/)
  assert.equal(fs.existsSync(fault), false)
})

test('missing service owner bounds the lifetime of a quiet worker', {
  timeout: 5000,
}, async (t) => {
  const { child, fault } = fixture(t, 'setInterval(() => {}, 1000)', {
    VILHIL_DEV_OWNER_PID: '2147483646',
  })
  const [code] = await once(child, 'exit')
  assert.equal(code, 74)
  assert.match(fs.readFileSync(fault, 'utf8'), /owner .* exited/)
})

test('healthy output file does not generate EPIPE with Next error handlers', {
  timeout: 5000,
}, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-file-log-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'output.log')
  const fd = fs.openSync(file, 'a')
  const { child, fault } = fixture(
    t,
    `
    require(${JSON.stringify(environment)});
    require(${JSON.stringify(handlers)}).installProcessErrorHandlers();
    console.error('file-log-sentinel');
  `,
    {},
    ['ignore', fd, fd, 'ipc'],
  )
  fs.closeSync(fd)
  const [code] = await once(child, 'close')
  assert.equal(code, 0)
  assert.equal(fs.existsSync(fault), false)
  assert.match(fs.readFileSync(file, 'utf8'), /file-log-sentinel/)
})

test('log rotation preserves the current output and two previous segments', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-log-rotate-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'dev.log')
  for (const text of ['aaaaa', 'bbbbb', 'ccccc', 'ddddd']) appendLog(file, Buffer.from(text), 5)
  assert.equal(fs.readFileSync(file, 'utf8'), 'ddddd')
  assert.equal(fs.readFileSync(`${file}.1`, 'utf8'), 'ccccc')
  assert.equal(fs.readFileSync(`${file}.2`, 'utf8'), 'bbbbb')
  assert.equal(fs.readdirSync(dir).length, 3)
})
