process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-security-tests'

const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const jwt = require('jsonwebtoken')
const { once } = require('node:events')
const User = require('../models/userModel')
const adminAuthRoutes = require('../routes/adminAuthRoutes')
const userRoutes = require('../routes/userRoutes')
const uploadRoutes = require('../routes/upload')
const { getJwtSecret, assertSecurityConfiguration } = require('../config/security')
const { getAllowedOrigins } = require('../config/origins')
const { serializeUser } = require('../utils/userSerializer')
const { isOwnedMediaKey } = require('../utils/mediaKeyValidation')

const adminUser = {
  _id: 'admin-user-id',
  name: 'Admin User',
  email: 'admin@example.test',
  isAdmin: true,
  joinDate: new Date('2025-01-01T00:00:00.000Z'),
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-02T00:00:00.000Z'),
  password: 'hashed-password',
  resetPasswordToken: 'never-return-this',
  resetPasswordExpires: new Date(),
  verificationToken: 'never-return-this-either',
  matchPassword: async (password) => password === 'correct-password',
}

const customerUser = {
  ...adminUser,
  _id: 'customer-user-id',
  name: 'Customer User',
  email: 'customer@example.test',
  isAdmin: false,
  matchPassword: async (password) => password === 'correct-password',
}

function queryFor(value) {
  return { select: async () => value }
}

function tokenFor(user) {
  return jwt.sign({ id: user._id, isAdmin: user.isAdmin }, getJwtSecret(), { expiresIn: '1h' })
}

async function startTestServer() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/auth', adminAuthRoutes)
  app.use('/api/users', userRoutes)
  app.use('/api/upload', uploadRoutes)
  const server = app.listen(0)
  await once(server, 'listening')
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` }
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options)
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const originalFindOne = User.findOne
const originalFindById = User.findById
const originalFind = User.find

let server
let baseUrl

test.before(async () => {
  User.findOne = async ({ email }) => {
    if (email === adminUser.email) return adminUser
    if (email === customerUser.email) return customerUser
    return null
  }
  User.findById = (id) => queryFor(id === customerUser._id ? customerUser : adminUser)
  User.find = async () => [adminUser, customerUser]
  ;({ server, baseUrl } = await startTestServer())
})

test.after(async () => {
  User.findOne = originalFindOne
  User.findById = originalFindById
  User.find = originalFind
  await new Promise((resolve) => server.close(resolve))
})

test('admin login succeeds and returns only the safe user contract', async () => {
  const result = await request(baseUrl, '/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: adminUser.email, password: 'correct-password' }),
  })

  assert.equal(result.status, 200)
  assert.equal(typeof result.body.token, 'string')
  assert.deepEqual(Object.keys(result.body.user).sort(), ['createdAt', 'email', 'id', 'isAdmin', 'joinDate', 'name', 'updatedAt'].sort())
  assert.equal(result.body.user.id, adminUser._id)
  assert.equal('password' in result.body.user, false)
  assert.equal('resetPasswordToken' in result.body.user, false)
})

test('admin login rejects invalid credentials and non-admin accounts', async () => {
  const invalid = await request(baseUrl, '/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: adminUser.email, password: 'wrong-password' }),
  })
  const nonAdmin = await request(baseUrl, '/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: customerUser.email, password: 'correct-password' }),
  })

  assert.equal(invalid.status, 401)
  assert.equal(invalid.body.code, 'INVALID_CREDENTIALS')
  assert.equal(nonAdmin.status, 403)
  assert.equal(nonAdmin.body.code, 'ADMIN_ACCESS_REQUIRED')
})

test('users endpoint rejects anonymous and normal users, then returns safe admin data', async () => {
  const anonymous = await request(baseUrl, '/api/users')
  const normalUser = await request(baseUrl, '/api/users', {
    headers: { Authorization: `Bearer ${tokenFor(customerUser)}` },
  })
  const adminResponse = await request(baseUrl, '/api/users', {
    headers: { Authorization: `Bearer ${tokenFor(adminUser)}` },
  })

  assert.equal(anonymous.status, 401)
  assert.equal(normalUser.status, 403)
  assert.equal(adminResponse.status, 200)
  assert.equal(Array.isArray(adminResponse.body), true)
  assert.equal('password' in adminResponse.body[0], false)
  assert.equal('verificationToken' in adminResponse.body[0], false)
  assert.equal('resetPasswordToken' in adminResponse.body[0], false)
})

test('upload requires admin authorization and reaches the handler only for admins', async () => {
  const anonymous = await request(baseUrl, '/api/upload', { method: 'POST' })
  const normalUser = await request(baseUrl, '/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor(customerUser)}` },
  })
  const adminWithoutFile = await request(baseUrl, '/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor(adminUser)}` },
  })

  assert.equal(anonymous.status, 401)
  assert.equal(normalUser.status, 403)
  assert.equal(adminWithoutFile.status, 400)
  assert.equal(adminWithoutFile.body.code, 'NO_FILES')
})

test('upload delete rejects invalid keys before touching storage', async () => {
  const anonymous = await request(baseUrl, '/api/upload/delete', {
    method: 'POST',
  })
  const normalUser = await request(baseUrl, '/api/upload/delete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor(customerUser)}` },
  })
  const result = await request(baseUrl, '/api/upload/delete', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenFor(adminUser)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ keys: ['../../private/secret.txt'] }),
  })

  assert.equal(anonymous.status, 401)
  assert.equal(normalUser.status, 403)
  assert.equal(result.status, 400)
  assert.equal(result.body.code, 'INVALID_MEDIA_KEY')
  assert.equal(isOwnedMediaKey('greenbits-store/1700000000000-image.webp'), true)
  assert.equal(isOwnedMediaKey('greenbits-store/../secret.webp'), false)
  assert.equal(isOwnedMediaKey('https://example.com/secret.webp'), false)
})

test('CORS origins include the future admin and storefront domains without wildcard access', () => {
  const origins = getAllowedOrigins({ ADMIN_ORIGIN: 'https://admin.gamecityelectronics.co.ke', STOREFRONT_ORIGIN: 'https://www.gamecityelectronics.co.ke' })
  assert.ok(origins.includes('https://admin.gamecityelectronics.co.ke'))
  assert.ok(origins.includes('https://www.gamecityelectronics.co.ke'))
  assert.equal(origins.includes('*'), false)
})

test('production startup fails clearly without a JWT secret', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousSecret = process.env.JWT_SECRET
  process.env.NODE_ENV = 'production'
  delete process.env.JWT_SECRET
  assert.throws(() => assertSecurityConfiguration(), /JWT_SECRET must be configured/)
  process.env.NODE_ENV = previousNodeEnv
  process.env.JWT_SECRET = previousSecret
})

test('user serializer excludes every authentication secret', () => {
  const safe = serializeUser(adminUser)
  assert.deepEqual(Object.keys(safe).sort(), ['createdAt', 'email', 'id', 'isAdmin', 'joinDate', 'name', 'updatedAt'].sort())
})
