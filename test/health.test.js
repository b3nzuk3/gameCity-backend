const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

async function getFreePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  return port
}

async function waitForHealth(child, baseUrl) {
  const deadline = Date.now() + 5000
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before becoming ready: ${output}`)
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`)
      return response
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  throw new Error(`Server did not become ready: ${output}`)
}

async function startServer(release) {
  const port = await getFreePort()
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    MONGODB_URI: '',
    JWT_SECRET: 'test-secret-that-is-long-enough-for-health-tests',
    ARBITRARY_SECRET: 'must-not-appear-in-health-response',
  }

  if (release === undefined) {
    delete env.RENDER_GIT_COMMIT
  } else {
    env.RENDER_GIT_COMMIT = release
  }

  const child = spawn(process.execPath, ['index.js'], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const baseUrl = `http://127.0.0.1:${port}`

  try {
    const response = await waitForHealth(child, baseUrl)
    return { child, response }
  } catch (error) {
    await stopServer(child)
    throw error
  }
}

async function stopServer(child) {
  if (child.exitCode !== null) return

  await new Promise((resolve) => {
    const forceKillTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 1000)
    child.once('exit', () => {
      clearTimeout(forceKillTimer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function readHealth(release) {
  const { child, response } = await startServer(release)
  try {
    return {
      status: response.status,
      body: await response.json(),
    }
  } finally {
    await stopServer(child)
  }
}

test('health exposes the Render commit as a release without exposing arbitrary environment values', async () => {
  const result = await readHealth('abc123def456')

  assert.equal(result.status, 200)
  assert.equal(result.body.release, 'abc123def456')
  assert.deepEqual(Object.keys(result.body).sort(), ['database', 'release', 'status', 'timestamp'])
  assert.equal(JSON.stringify(result.body).includes('must-not-appear-in-health-response'), false)
})

test('health falls back to unknown when no Render commit is supplied', async () => {
  const result = await readHealth()

  assert.equal(result.status, 200)
  assert.equal(result.body.release, 'unknown')
})
