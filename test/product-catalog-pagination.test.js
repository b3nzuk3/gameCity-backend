const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')
const test = require('node:test')
const Product = require('../models/productModel')
const productRouter = require('../routes/productRoutes')

const makeQueryChain = (products, calls) => {
  const chain = {
    sort(sortSpec) {
      calls.push(['sort', sortSpec])
      return chain
    },
    skip(value) {
      calls.push(['skip', value])
      return chain
    },
    limit(value) {
      calls.push(['limit', value])
      return chain
    },
    lean() {
      return Promise.resolve(products)
    },
  }
  return chain
}

const request = (app, path) => new Promise((resolve, reject) => {
  const server = http.createServer(app)
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        server.close(() => resolve({ status: res.statusCode, body: JSON.parse(body) }))
      })
    })
    req.on('error', (error) => server.close(() => reject(error)))
  })
})

test('catalog routes filter before pagination and reuse the exact query for totals', async () => {
  const app = express()
  app.use('/api/products', productRouter)
  const findCalls = []
  const findOperations = []
  const countCalls = []
  const originalFind = Product.find
  const originalCountDocuments = Product.countDocuments
  const products = [{
    _id: 'product-1',
    name: 'RTX 4070',
    image: 'legacy.jpg',
    image_r2: null,
    images: [],
    brand: 'Acme',
  }]

  Product.find = (query) => {
    findCalls.push(query)
    return makeQueryChain(products, findOperations)
  }
  Product.countDocuments = async (query) => {
    countCalls.push(query)
    return 3
  }

  try {
    const response = await request(
      app,
      '/api/products?page=2&limit=1&sort=-price&search=a%2Bb&filterBy=in-stock&condition=New&brands=Acme&brands=Beta&minPrice=10&maxPrice=100&categories=monitors&categories=graphics-cards&spec.vram=8&spec.vram=12'
    )

    assert.equal(response.status, 200)
    assert.equal(response.body.page, 2)
    assert.equal(response.body.pages, 3)
    assert.equal(response.body.total, 3)
    assert.equal(response.body.hasMore, true)
    assert.equal(response.body.products[0].image, 'legacy.jpg')
    assert.deepEqual(findCalls[0], countCalls[0])
    assert.deepEqual(findCalls[0].category, { $in: ['Monitors', 'Graphics Cards'] })
    assert.deepEqual(findCalls[0].countInStock, { $gt: 0 })
    assert.equal(findCalls[0].condition, 'New')
    assert.deepEqual(findCalls[0].brand, { $in: ['Acme', 'Beta'] })
    assert.deepEqual(findCalls[0].price, { $gte: 10, $lte: 100 })
    assert.deepEqual(findCalls[0].$or, [
      { name: { $regex: 'a\\+b', $options: 'i' } },
      { description: { $regex: 'a\\+b', $options: 'i' } },
      { brand: { $regex: 'a\\+b', $options: 'i' } },
    ])
    assert.equal(findCalls[0].$and.length, 1)
    const specificationConditions = findCalls[0].$and[0].$or
    assert.equal(specificationConditions.some((condition) =>
      condition['specifications.Vram in GB']?.$regex === '^8$'
    ), true)
    assert.equal(specificationConditions.some((condition) =>
      condition['specifications.Vram in GB']?.$regex === '^12$'
    ), true)
    assert.deepEqual(findOperations, [
      ['sort', { price: -1, _id: 1 }],
      ['skip', 1],
      ['limit', 1],
    ])
  } finally {
    Product.find = originalFind
    Product.countDocuments = originalCountDocuments
  }
})

test('category listing and category count share category, search, and visible filters', async () => {
  const app = express()
  app.use('/api/products', productRouter)
  const findCalls = []
  const findOperations = []
  const countCalls = []
  const originalFind = Product.find
  const originalCountDocuments = Product.countDocuments

  Product.find = (query) => {
    findCalls.push(query)
    return makeQueryChain([], findOperations)
  }
  Product.countDocuments = async (query) => {
    countCalls.push(query)
    return 0
  }

  try {
    const listing = await request(
      app,
      '/api/products/category/monitors?page=1&limit=25&sort=name&search=27%2Bin&filterBy=out-of-stock&condition=Pre-Owned&brands=Acme&minPrice=100&maxPrice=500&spec.screenSize=27'
    )
    const count = await request(
      app,
      '/api/products/category/monitors/count?search=27%2Bin&filterBy=out-of-stock&condition=Pre-Owned&brands=Acme&minPrice=100&maxPrice=500&spec.screenSize=27'
    )

    assert.equal(listing.status, 200)
    assert.equal(count.status, 200)
    assert.deepEqual(findCalls[0], countCalls[1])
    assert.equal(findCalls[0].category, 'Monitors')
    assert.deepEqual(findCalls[0].countInStock, 0)
    assert.deepEqual(findCalls[0].$or, [
      { name: { $regex: '27\\+in', $options: 'i' } },
      { description: { $regex: '27\\+in', $options: 'i' } },
      { brand: { $regex: '27\\+in', $options: 'i' } },
    ])
    assert.equal(findCalls[0].$and[0].$or.some((condition) =>
      condition['specifications.Size in Inches']?.$regex === '^27$'
    ), true)
    assert.deepEqual(findOperations, [
      ['sort', { name: 1, _id: -1 }],
      ['skip', 0],
      ['limit', 25],
    ])
  } finally {
    Product.find = originalFind
    Product.countDocuments = originalCountDocuments
  }
})

test('unknown and inherited specification IDs are rejected rather than crashing', async () => {
  const app = express()
  app.use('/api/products', productRouter)
  for (const id of ['not-a-visible-filter', 'toString', '__proto__']) {
    const response = await request(app, `/api/products?spec.${id}=value`)
    assert.equal(response.status, 400, id)
    assert.equal(response.body.code, 'INVALID_PRODUCT_FILTER')
  }
})

test('public catalog routes reject malformed pagination values with 400', async () => {
  const app = express()
  app.use('/api/products', productRouter)

  for (const path of [
    '/api/products?page=0',
    '/api/products?page=not-a-number',
    '/api/products/category/monitors?limit=0',
    '/api/products/category/monitors?limit=25.5',
    '/api/products/category/monitors?limit=101',
  ]) {
    const response = await request(app, path)
    assert.equal(response.status, 400, path)
    assert.match(response.body.message, /page|limit/i)
  }
})
