process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-announcement-tests'
const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const jwt = require('jsonwebtoken')
const { once } = require('node:events')
const Homepage = require('../models/homepageModel')
const User = require('../models/userModel')
const routes = require('../routes/homepageRoutes')
const { getJwtSecret } = require('../config/security')
const { DEFAULT_ANNOUNCEMENT, validateAnnouncementPayload, adminResponse, publicResponse } = require('../controllers/homepageController')
const expectedDefault = { enabled: true, text: 'Gaming PCs, components & accessories • Delivery across Kenya', mobileText: 'Delivery across Kenya', linkLabel: 'Shop now', linkHref: '/category/all' }
const adminId = '507f1f77bcf86cd799439011'
const customerId = '507f1f77bcf86cd799439012'

test('announcement defaults preserve the existing bar for new, old and unconfigured homepages', () => {
  assert.deepEqual(DEFAULT_ANNOUNCEMENT, expectedDefault)
  for (const homepage of [null, { hero: {}, sections: [] }, new Homepage({}), Homepage.hydrate({ key: 'default', sections: [] })]) {
    assert.deepEqual(adminResponse(homepage).announcement, expectedDefault)
    assert.deepEqual(publicResponse(homepage).announcement, expectedDefault)
  }
})

test('announcement validation rejects malformed values and unsafe destinations', () => {
  assert.deepEqual(validateAnnouncementPayload({ text: '  New offer  ', linkLabel: '', linkHref: '', mobileText: '' }), { text: 'New offer', mobileText: '', linkLabel: '', linkHref: '' })
  assert.deepEqual(validateAnnouncementPayload({ enabled: false }), { enabled: false })
  for (const value of [null, [], 'announcement']) assert.throws(() => validateAnnouncementPayload(value), /payload/)
  for (const value of ['', '   ', 'x'.repeat(241), 123]) assert.throws(() => validateAnnouncementPayload({ text: value }))
  assert.throws(() => validateAnnouncementPayload({ mobileText: 'x'.repeat(121) }))
  assert.throws(() => validateAnnouncementPayload({ linkLabel: 'x'.repeat(81) }))
  assert.throws(() => validateAnnouncementPayload({ enabled: 'false' }))
  for (const linkHref of ['javascript:alert(1)', '//example.com', '/\\example.com', 'https://user:pass@example.com', 'https://example.com/' + 'x'.repeat(500)]) assert.throws(() => validateAnnouncementPayload({ linkHref }))
  for (const linkHref of ['/category/all', 'https://example.com/sale', 'http://example.com/sale', '']) assert.equal(validateAnnouncementPayload({ linkHref }).linkHref, linkHref)
})

test('announcement HTTP mutation is admin-only and survives reread without changing hero or sections', async (t) => {
  let persisted = new Homepage({ hero: { title: 'Keep hero' }, sections: [{ title: 'Keep section', sortOrder: 0 }] }).toObject()
  function document() {
    const doc = Homepage.hydrate(persisted)
    doc.save = async () => { await doc.validate(); persisted = doc.toObject(); return doc }
    doc.populate = async () => doc
    return doc
  }
  t.mock.method(Homepage, 'findOne', async () => document())
  t.mock.method(Homepage, 'findOneAndUpdate', async () => document())
  t.mock.method(User, 'findById', (id) => ({ select: async () => ({ _id: id, isAdmin: id === adminId }) }))
  const app = express()
  app.use(express.json())
  app.use('/api', routes)
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`
  const token = (id) => jwt.sign({ id }, getJwtSecret(), { expiresIn: '1h' })
  const put = (payload, id) => fetch(`${baseUrl}/admin/homepage/announcement`, { method: 'PUT', headers: { 'content-type': 'application/json', ...(id ? { authorization: `Bearer ${token(id)}` } : {}) }, body: JSON.stringify(payload) })
  const before = JSON.parse(JSON.stringify(persisted))
  assert.equal((await put({ text: 'Denied' })).status, 401)
  assert.equal((await put({ text: 'Denied' }, customerId)).status, 403)
  assert.equal((await put({ linkHref: 'javascript:alert(1)' }, adminId)).status, 400)
  assert.deepEqual(JSON.parse(JSON.stringify(persisted)), before)
  const config = { enabled: true, text: 'October sale', mobileText: 'Sale today', linkLabel: 'Browse offers', linkHref: '/category/all?offers=1' }
  const saved = await put(config, adminId)
  assert.equal(saved.status, 200)
  assert.deepEqual((await saved.json()).announcement, config)
  const publicRead = await fetch(`${baseUrl}/public/homepage`)
  assert.deepEqual((await publicRead.json()).announcement, config)
  const adminRead = await fetch(`${baseUrl}/admin/homepage`, { headers: { authorization: `Bearer ${token(adminId)}` } })
  assert.deepEqual((await adminRead.json()).announcement, config)
  const disabled = await put({ enabled: false }, adminId)
  assert.equal(disabled.status, 200)
  assert.deepEqual((await disabled.json()).announcement, { ...config, enabled: false })
  const reread = await fetch(`${baseUrl}/public/homepage`)
  assert.deepEqual((await reread.json()).announcement, { ...config, enabled: false })
  assert.deepEqual(persisted.hero, before.hero)
  assert.deepEqual(JSON.parse(JSON.stringify(persisted.sections)), before.sections)
})
