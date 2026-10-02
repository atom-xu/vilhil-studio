// Load before Next installs its uncaughtException loggers, including in forked workers.
const fs = require('node:fs')
const path = require('node:path')

function exitWithFault(reason) {
  const file =
    process.env.VILHIL_DEV_FAULT_LOG || path.join(__dirname, '../docs/tmp/dev-service/faults.log')
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${new Date().toISOString()} pid=${process.pid} ${reason}\n`, {
      mode: 0o600,
    })
  } catch {
    // Never report a logging failure to the same broken stream.
  }
  process.exit(74)
}

for (const name of ['stdout', 'stderr']) {
  process[name].on('error', (error) => {
    if (error.code === 'EPIPE') exitWithFault(`${name}: EPIPE`)
    else throw error
  })
}

const ownerPid = Number(process.env.VILHIL_DEV_OWNER_PID)
if (Number.isSafeInteger(ownerPid) && ownerPid > 1 && ownerPid !== process.pid) {
  setInterval(() => {
    try {
      process.kill(ownerPid, 0)
    } catch (error) {
      if (error.code === 'ESRCH') exitWithFault(`owner ${ownerPid} exited`)
      else throw error
    }
  }, 1000).unref()
}
