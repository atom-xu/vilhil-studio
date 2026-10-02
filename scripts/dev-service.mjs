import './dev-output-guard.cjs'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(script), '..')
const dir = path.join(root, 'docs/tmp/dev-service')
const lock = path.join(dir, 'running')
const recordFile = path.join(lock, 'owner.json')
const logFile = path.join(dir, 'dev.log')
const faultFile = path.join(dir, 'faults.log')
const url = 'http://localhost:3002'
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function identity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return null
  try {
    return (
      execFileSync('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command='], {
        encoding: 'utf8',
      }).trim() || null
    )
  } catch {
    return null
  }
}

function readRecord() {
  try {
    return JSON.parse(fs.readFileSync(recordFile, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function isOwned(record) {
  return (
    !!record &&
    record.root === root &&
    record.identity?.includes(script) &&
    identity(record.pid) === record.identity
  )
}

function removeRecord(record) {
  if (readRecord()?.instance !== record.instance) return
  fs.unlinkSync(recordFile)
  fs.rmdirSync(lock)
}

export function appendLog(file, chunk, limit = 5 * 1024 * 1024) {
  // Rotate the writer's files, not inherited output descriptors.
  const size = fs.existsSync(file) ? fs.statSync(file).size : 0
  if (size && size + chunk.length > limit) {
    if (fs.existsSync(`${file}.1`)) fs.renameSync(`${file}.1`, `${file}.2`)
    fs.renameSync(file, `${file}.1`)
  }
  fs.appendFileSync(file, chunk, { mode: 0o600 })
}

async function health() {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) })
    const body = await response.json()
    return response.ok && body.status === 'ok' && body.db === 'ok'
  } catch {
    return false
  }
}

async function assertPortFree() {
  await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', () =>
      reject(
        new Error('Port 3002 is occupied; no process was stopped. Inspect it before retrying.'),
      ),
    )
    server.listen(3002, '127.0.0.1', () => server.close(resolve))
  })
}

function ancestors() {
  const result = []
  let pid = process.ppid
  while (pid > 1 && result.length < 12) {
    const value = identity(pid)
    if (!value) break
    result.push({ pid, identity: value })
    pid = Number(
      execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim(),
    )
  }
  return result
}

async function serve(background, instance) {
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(lock) // Atomic claim; another starter must not replace this owner.
  const record = { pid: process.pid, identity: identity(process.pid), instance, root }
  fs.writeFileSync(recordFile, JSON.stringify(record), { mode: 0o600 })
  let child
  let stopping = false
  let killTimer
  let ownerTimer
  const signalChild = (signal) => {
    if (!child?.pid) return
    try {
      process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  const stop = () => {
    if (stopping) return
    stopping = true
    signalChild('SIGTERM')
    killTimer = setTimeout(() => signalChild('SIGKILL'), 8000)
    killTimer.unref()
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  process.once('SIGHUP', stop)
  process.once('exit', () => {
    signalChild('SIGTERM')
    removeRecord(record)
  })
  try {
    await assertPortFree()
    if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'))
    const guard = path.join(root, 'scripts/dev-output-guard.cjs')
    const env = {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(guard)}`,
      VILHIL_DEV_OWNER_PID: String(process.pid),
      VILHIL_DEV_FAULT_LOG: faultFile,
    }
    child = spawn(
      path.join(root, 'node_modules/.bin/turbo'),
      ['run', 'dev', '--env-mode=loose', '--ui=stream'],
      {
        cwd: root,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    const log = (stream, chunk) => {
      try {
        appendLog(logFile, chunk)
        if (!background) process[stream].write(chunk)
      } catch (error) {
        fs.appendFileSync(
          faultFile,
          `${new Date().toISOString()} log writer failed: ${error.code || error.name}\n`,
        )
        stop()
      }
    }
    child.stdout.on('data', (chunk) => log('stdout', chunk))
    child.stderr.on('data', (chunk) => log('stderr', chunk))
    if (!background) {
      const owners = ancestors()
      ownerTimer = setInterval(() => {
        if (owners.some((owner) => identity(owner.pid) !== owner.identity)) stop()
      }, 1000)
      ownerTimer.unref()
    }
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolve(code ?? 1))
    })
    process.exitCode = stopping ? 0 : code
  } finally {
    clearInterval(ownerTimer)
    clearTimeout(killTimer)
    signalChild('SIGTERM')
    removeRecord(record)
  }
}

async function stopService(record) {
  if (!isOwned(record)) return
  process.kill(record.pid, 'SIGTERM')
  const end = Date.now() + 12000
  while (isOwned(record) && Date.now() < end) await pause(200)
  if (isOwned(record))
    throw new Error(
      `Service ${record.pid} did not stop. Inspect ${logFile}; no unrelated PID was killed.`,
    )
}

async function main() {
  const command = process.argv[2] || 'status'
  if (command === '_serve') return serve(true, process.argv[3])
  if (!['run', 'start', 'stop', 'status'].includes(command))
    throw new Error('Use run, start, stop, or status')
  let record = readRecord()
  if (command === 'status') {
    const owned = isOwned(record)
    const healthy = owned && (await health())
    console.log(
      JSON.stringify(
        { running: owned, healthy, pid: owned ? record.pid : null, url, log: logFile },
        null,
        2,
      ),
    )
    process.exitCode = healthy ? 0 : 1
    return
  }
  if (command === 'stop') {
    await stopService(record)
    console.log(isOwned(record) ? 'Still stopping' : 'No managed development service running.')
    return
  }
  if (isOwned(record)) {
    const healthy = await health()
    console.log(`Already running: PID ${record.pid} ${url}; healthy=${healthy}`)
    process.exitCode = healthy ? 0 : 1
    return
  }
  if (record) removeRecord(record) // Stale metadata only; never signal a mismatched PID.
  if (fs.existsSync(lock))
    throw new Error('Another start is claiming ownership; check dev:status shortly.')
  await assertPortFree()
  const instance = randomUUID()
  if (command === 'run') return serve(false, instance)
  fs.mkdirSync(dir, { recursive: true })
  const diagnostics = fs.openSync(faultFile, 'a', 0o600)
  const supervisor = spawn(process.execPath, [script, '_serve', instance], {
    cwd: root,
    detached: true,
    stdio: ['ignore', diagnostics, diagnostics],
  })
  fs.closeSync(diagnostics)
  supervisor.unref()
  let spawnError
  supervisor.once('error', (error) => {
    spawnError = error
  })
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError
    record = readRecord()
    if (record?.instance === instance && isOwned(record) && (await health())) {
      console.log(`Started: PID ${record.pid} ${url}\nLog: ${logFile}`)
      return
    }
    if (supervisor.exitCode !== null || supervisor.signalCode !== null) break
    await pause(500)
  }
  if (record?.instance === instance) await stopService(record)
  throw new Error(`Startup did not pass health check. See ${logFile} and ${faultFile}.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
