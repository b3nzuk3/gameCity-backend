process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-homepage-tests'

const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const { once } = require('node:events')
const User = require('../models/userModel')
const Homepage = require('../models/homepageModel')
const homepageRoutes = require('../routes/homepageRoutes')
const { getJwtSecret } = require('../config/security')
const {
  DEFAULT_HERO,
  HomepageValidationError,
  validateHeroPayload,
  validateSectionPayload,
  validateUniqueProductIds,
  publicResponse,
  adminResponse,
} = require('../controllers/homepageController')

const productId = '507f1f77bcf86cd799439011'
const missingProductId = '507f1f77bcf86cd799439012'
const adminUser = { _id: productId, isAdmin: true }
const normalUser = { _id: missingProductId, isAdmin: false }

function tokenFor(user) {
  return jwt.sign({ id: user._id }, getJwtSecret(), { expiresIn: '1h' })
}

function userQuery(user) {
  return { select: async () => user }
}

async function startServer() {
  const app = express()
  app.use(express.json())
  app.use('/api', homepageRoutes)
  const server = app.listen(0)
  await once(server, 'listening')
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` }
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

test('hero and section payload validators reject unsafe or incomplete values', () => {
  assert.deepEqual(validateHeroPayload({ primaryCtaHref: '/category/all', imageUrl: 'https://example.com/hero.webp' }), {
    primaryCtaHref: '/category/all',
    imageUrl: 'https://example.com/hero.webp',
  })
  assert.throws(() => validateHeroPayload({ primaryCtaHref: 'javascript:alert(1)' }), HomepageValidationError)
  assert.throws(() => validateSectionPayload({ title: '   ' }), /Section title is required/)
  assert.throws(() => validateSectionPayload({ title: 'Products', viewAllHref: 'javascript:alert(1)' }), /viewAllHref/)
  assert.throws(() => validateSectionPayload({ title: 'Products', type: 'LATEST_PRODUCTS' }), /MANUAL_PRODUCTS/)
  assert.equal(validateSectionPayload({ title: 'Grid' }).layout, 'grid')
  assert.equal(validateSectionPayload({ title: 'Carousel', layout: 'carousel' }).layout, 'carousel')
  assert.throws(() => validateSectionPayload({ title: 'Products', layout: 'list' }), /layout must be grid or carousel/)
})

test('homepage schema rejects fractional section and product ordering', async () => {
  const homepage = new Homepage({
    sections: [{
      title: 'Collection',
      sortOrder: 0.5,
      products: [{ product: productId, sortOrder: 0.25 }],
    }],
  })
  await assert.rejects(() => homepage.validate(), /sortOrder must be an integer/)
})

test('product references are valid object ids and duplicates are rejected', () => {
  assert.deepEqual(validateUniqueProductIds([productId, missingProductId]), [productId, missingProductId])
  assert.throws(() => validateUniqueProductIds([productId, productId]), /only be selected once/)
  assert.throws(() => validateUniqueProductIds(['not-an-object-id']), /Invalid product ID/)
})

test('public homepage omits disabled sections and missing products while preserving live product fields', () => {
  const homepage = {
    hero: { ...DEFAULT_HERO },
    sections: [
      {
        _id: productId,
        title: 'Visible collection',
        subtitle: '',
        type: 'MANUAL_PRODUCTS',
        enabled: true,
        layout: 'carousel',
        sortOrder: 1,
        products: [
          { product: { _id: productId, name: 'Current product', image: 'legacy.webp', price: 1200, countInStock: 4 }, sortOrder: 0 },
          { product: null, sortOrder: 1 },
        ],
      },
      { _id: missingProductId, title: 'Hidden collection', enabled: false, sortOrder: 0, products: [] },
    ],
  }
  const result = publicResponse(homepage)
  assert.equal(result.configured, true)
  assert.equal(result.sections.length, 1)
  assert.equal(result.sections[0].products.length, 1)
  assert.equal(result.sections[0].products[0].product.name, 'Current product')
  assert.equal(result.sections[0].products[0].product.price, 1200)
  assert.equal(result.sections[0].layout, 'carousel')
})

test('admin response retains missing references for remediation', () => {
  const result = adminResponse({ hero: DEFAULT_HERO, sections: [{ _id: productId, title: 'Collection', enabled: true, sortOrder: 0, products: [{ product: null, sortOrder: 0 }] }] })
  assert.equal(result.sections[0].products[0].missing, true)
  assert.equal(result.sections[0].products[0].productId, '')
})

test('unpopulated product object ids remain missing in admin responses', () => {
  const rawProductId = new mongoose.Types.ObjectId(missingProductId)
  const result = adminResponse({
    hero: DEFAULT_HERO,
    sections: [{ _id: productId, title: 'Collection', enabled: true, sortOrder: 0, products: [{ product: rawProductId, sortOrder: 0 }] }],
  })
  assert.equal(result.sections[0].products[0].missing, true)
  assert.equal(result.sections[0].products[0].productId, missingProductId)
  assert.equal(result.sections[0].products[0].product, null)
})

test('homepage mutations reject anonymous and non-admin users', async (t) => {
  const originalFindById = User.findById
  const { server, baseUrl } = await startServer()
  t.after(async () => {
    User.findById = originalFindById
    await new Promise((resolve) => server.close(resolve))
  })

  const anonymous = await request(baseUrl, '/api/admin/homepage/hero', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Nope' }),
  })
  assert.equal(anonymous.status, 401)

  User.findById = () => userQuery(normalUser)
  const normal = await request(baseUrl, '/api/admin/homepage/hero', {
    method: 'PUT', headers: { authorization: `Bearer ${tokenFor(normalUser)}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Nope' }),
  })
  assert.equal(normal.status, 403)
})
