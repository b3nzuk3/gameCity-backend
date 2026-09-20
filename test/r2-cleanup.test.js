process.env.NODE_ENV = 'test'
// Configure the R2 public URL before any service module is loaded so
// extractKey/isR2Url resolve test URLs deterministically.
process.env.R2_PUBLIC_URL = 'https://pub-test.r2.dev'

const test = require('node:test')
const assert = require('node:assert/strict')

const Product = require('../models/productModel')
const imageStorage = require('../services/imageStorageService')
const mediaReference = require('../services/mediaReferenceService')
const productController = require('../controllers/productController')

const PUBLIC = process.env.R2_PUBLIC_URL
const url = (key) => `${PUBLIC}/greenbits-store/${key}`
const A = 'a.webp'
const B = 'b.webp'
const C = 'c.jpg' // non-R2 legacy URL host stub (extractKey returns null)

// ---------------------------------------------------------------- helpers

function fakeDoc(data) {
  const doc = {
    ...data,
    toObject() {
      const out = {}
      for (const [k, v] of Object.entries(data)) out[k] = Array.isArray(v) ? [...v] : (v && typeof v === 'object' && !(v instanceof Date) ? { ...v } : v)
      return out
    },
    async save() {
      Object.assign(data, {
        name: doc.name, price: doc.price, description: doc.description,
        image: doc.image, image_r2: doc.image_r2, image_r2_variants: doc.image_r2_variants,
        images: doc.images, images_r2: doc.images_r2, countInStock: doc.countInStock,
        specifications: doc.specifications, offer: doc.offer, brand: doc.brand,
        category: doc.category, condition: doc.condition,
      })
      return doc
    },
  }
  return doc
}

function validBaseProduct(overrides = {}) {
  return {
    _id: 'product-1',
    name: 'Test Product',
    description: 'A product',
    brand: 'GameCity',
    category: 'Accessories',
    price: 100,
    countInStock: 5,
    condition: 'New',
    image: url(A),
    image_r2: url(A),
    image_r2_variants: {
      thumbnail: url('a-thumbnail.webp'),
      medium: url('a-medium.webp'),
      large: url('a-large.webp'),
    },
    images: [],
    images_r2: [],
    specifications: {},
    offer: { enabled: false, type: 'percentage', amount: 0 },
    ...overrides,
  }
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
  }
}

const deletedKeys = []
let otherProductsInDb = []

function installMocks() {
  deletedKeys.length = 0
  const originalFind = Product.find
  const originalDelete = imageStorage.deleteExactKeys
  Product.find = () => ({
    select: () => ({
      lean: async () => otherProductsInDb,
    }),
  })
  imageStorage.deleteExactKeys = async (keys) => {
    deletedKeys.push(...keys)
    return { deleted: keys, failed: [] }
  }
  return () => {
    Product.find = originalFind
    imageStorage.deleteExactKeys = originalDelete
  }
}

async function runUpdate(product, payload, { others = [] } = {}) {
  const restore = installMocks()
  otherProductsInDb = others
  try {
    const originalFindById = Product.findById
    Product.findById = async () => product
    try {
      const res = fakeRes()
      await productController.updateProduct({ params: { id: product._id }, body: payload }, res)
      return res
    } finally {
      Product.findById = originalFindById
    }
  } finally {
    restore()
  }
}

// ---------------------------------------------------------------- tests

test('Test A: price-only edit keeps image_r2 and deletes nothing', async () => {
  const product = fakeDoc(validBaseProduct())
  const res = await runUpdate(product, { price: 999 })

  assert.equal(res.statusCode, 200)
  assert.equal(product.image_r2, url(A))
  assert.equal(product.image, url(A))
  assert.deepEqual(deletedKeys, [])
})

test('Test B: legacy admin-style payload (image only, image_r2 omitted) preserves the R2 relationship', async () => {
  const product = fakeDoc(validBaseProduct())
  const res = await runUpdate(product, { image: url(A), name: 'Renamed' })

  assert.equal(res.statusCode, 200)
  assert.equal(product.image_r2, url(A), 'image_r2 must not be nulled when image still carries the R2 URL')
  assert.deepEqual(deletedKeys, [])
})

test('Test C: name/stock/description edits cause zero media deletion', async () => {
  for (const payload of [
    { name: 'New name' },
    { countInStock: 42 },
    { description: 'New description' },
    { specifications: { socket: 'LGA1700' } },
  ]) {
    const product = fakeDoc(validBaseProduct())
    const res = await runUpdate(product, payload)
    assert.equal(res.statusCode, 200)
    assert.equal(product.image_r2, url(A))
    assert.deepEqual(deletedKeys, [], `payload ${JSON.stringify(payload)} must not delete media`)
  }
})

test('Test D: genuine primary replacement deletes the old object only when no product references it', async () => {
  const product = fakeDoc(validBaseProduct())
  const res = await runUpdate(product, { image: url(B), image_r2: url(B), image_r2_variants: null })

  assert.equal(res.statusCode, 200)
  assert.equal(product.image_r2, url(B))
  assert.deepEqual([...deletedKeys].sort(), [
    'greenbits-store/a-large.webp',
    'greenbits-store/a-medium.webp',
    'greenbits-store/a-thumbnail.webp',
    'greenbits-store/a.webp',
  ])
})

test('Test E: legacy image field still referencing A blocks deletion when image_r2 is removed', async () => {
  const product = fakeDoc(validBaseProduct({ image: url(A) }))
  // Payload: image_r2 explicitly removed, but image still references A.
  const res = await runUpdate(product, { image_r2: null, image: url(A) })

  assert.equal(res.statusCode, 200)
  assert.equal(product.image_r2, null)
  assert.equal(product.image, url(A), 'image still references A')
  assert.deepEqual(deletedKeys, [], 'A must not be deleted while image references it')
})

test('Test F: URL removed from images_r2 but still in legacy images is not deleted', async () => {
  const product = fakeDoc(validBaseProduct({
    images: [url(A)],
    images_r2: [url(A)],
  }))
  const res = await runUpdate(product, { images_r2: [] })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(product.images_r2, [])
  assert.deepEqual(deletedKeys, [], 'A must not be deleted while legacy images still reference it')
})

test('Test G: another product referencing the object blocks deletion', async () => {
  const product = fakeDoc(validBaseProduct())
  const res = await runUpdate(product, { image: url(B), image_r2: url(B), image_r2_variants: null }, {
    others: [validBaseProduct({ _id: 'product-2' })], // also references A
  })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(deletedKeys, [], 'shared object must be protected by cross-product reference check')
  assert.equal(product.image, url(B), 'the update itself still succeeds')
})

test('Test G2: product deletion must not delete objects referenced by another product', async () => {
  const restore = installMocks()
  otherProductsInDb = [validBaseProduct({ _id: 'product-2' })]
  try {
    const originalFindById = Product.findById
    const originalDelete = Product.findByIdAndDelete
    Product.findById = async () => fakeDoc(validBaseProduct())
    Product.findByIdAndDelete = async () => ({})
    try {
      const product = fakeDoc(validBaseProduct())
      const res = fakeRes()
      await productController.deleteProduct({ params: { id: 'product-1' } }, res)
      assert.equal(res.statusCode, 200)
      assert.deepEqual(deletedKeys, [], 'shared object must survive product deletion')
    } finally {
      Product.findById = originalFindById
      Product.findByIdAndDelete = originalDelete
    }
  } finally {
    restore()
  }
})

test('Test D/H rerun: replacement cleanup deletes only fully-unreferenced media sets', async () => {
  const product = fakeDoc(validBaseProduct())
  await runUpdate(product, { image: url(B), image_r2: url(B), image_r2_variants: null })
  assert.deepEqual([...deletedKeys].sort(), [
    'greenbits-store/a-large.webp',
    'greenbits-store/a-medium.webp',
    'greenbits-store/a-thumbnail.webp',
    'greenbits-store/a.webp',
  ])
})

test('Test H: once no product references the object, cleanup may delete it', async () => {
  const product = fakeDoc(validBaseProduct())
  await runUpdate(product, { image: url(B), image_r2: url(B), image_r2_variants: null })
  assert.ok(deletedKeys.includes('greenbits-store/a.webp'))
  assert.ok(deletedKeys.includes('greenbits-store/a-thumbnail.webp'))
})

test('Test I: /api/upload/delete deletes unreferenced uploads but protects referenced ones', async () => {
  const uploadRoutes = require('../routes/upload')
  // The route delegates to mediaReference.cleanupUnreferencedMedia; verify
  // both behaviors directly with mocked storage + DB.

  const restore = installMocks()
  try {
    // Unreferenced: delete proceeds (base + variants).
    otherProductsInDb = []
    const r1 = await mediaReference.cleanupUnreferencedMedia(['greenbits-store/x.webp'])
    assert.deepEqual([...r1.deleted].sort(), [
      'greenbits-store/x-large.webp',
      'greenbits-store/x-medium.webp',
      'greenbits-store/x-thumbnail.webp',
      'greenbits-store/x.webp',
    ])

    // Referenced by a product (lost-response race): protected.
    deletedKeys.length = 0
    otherProductsInDb = [validBaseProduct({ _id: 'p2' })]
    const r2 = await mediaReference.cleanupUnreferencedMedia(['greenbits-store/a.webp'])
    assert.deepEqual(r2.deleted, [])
    assert.ok(r2.protected.length > 0)
    assert.deepEqual(deletedKeys, [])
  } finally {
    restore()
  }
  assert.ok(uploadRoutes, 'upload route module loads')
})

test('Test J: base image is not deleted when any variant is still referenced', async () => {
  const product = fakeDoc(validBaseProduct())
  // Another product references ONLY the thumbnail variant.
  await runUpdate(product, { image: url(B), image_r2: url(B), image_r2_variants: null }, {
    others: [validBaseProduct({
      _id: 'product-2',
      image: url('a-thumbnail.webp'),
      image_r2: url('a-thumbnail.webp'),
      image_r2_variants: null,
      images: [],
      images_r2: [],
    })],
  })

  assert.deepEqual(deletedKeys, [], 'partial variant deletion must be prevented: base stays with its variants')
})

test('reference collection covers every media field including variants', () => {
  const keys = mediaReference.collectReferencedKeys({
    image: url('a.webp'),
    image_r2: null,
    images: ['https://res.cloudinary.com/demo/x.jpg', url('b.webp')],
    images_r2: [url('c.webp')],
    image_r2_variants: { thumbnail: url('d-thumbnail.webp'), medium: url('d-medium.webp'), large: url('d-large.webp') },
  })
  assert.deepEqual([...keys].sort(), [
    'greenbits-store/a.webp',
    'greenbits-store/b.webp',
    'greenbits-store/c.webp',
    'greenbits-store/d-large.webp',
    'greenbits-store/d-medium.webp',
    'greenbits-store/d-thumbnail.webp',
  ])
})

test('non-R2 URLs never produce keys', () => {
  const keys = mediaReference.collectReferencedKeys({ image: 'https://res.cloudinary.com/demo/x.jpg', image_r2: null })
  assert.deepEqual([...keys], [])
})
