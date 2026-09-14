process.env.NODE_ENV = 'test'

const test = require('node:test')
const assert = require('node:assert/strict')
const Product = require('../models/productModel')
const { validateProductPayload, validateOffer } = require('../utils/productValidation')
const { generateKey } = require('../services/r2Service')

test('product payload accepts legitimate zero price and stock values', () => {
  const errors = validateProductPayload({
    name: 'Zero value product',
    description: 'A valid product',
    brand: 'GameCity',
    category: 'Accessories',
    price: 0,
    countInStock: 0,
    condition: 'New',
    image: 'https://example.invalid/product.webp',
    offer: { enabled: false, type: 'percentage', amount: 0 },
  })
  assert.deepEqual(errors, {})
})

test('product payload rejects invalid stock and offer values', () => {
  const errors = validateProductPayload({
    name: 'Invalid product',
    description: 'A product',
    brand: 'GameCity',
    category: 'Accessories',
    price: 10,
    countInStock: 1.5,
    condition: 'New',
    image: 'https://example.invalid/product.webp',
    offer: { enabled: true, type: 'percentage', amount: 101 },
  })
  assert.match(errors.countInStock, /integer/)
  assert.match(errors.offer, /between 0 and 100/)
  assert.match(validateOffer({ type: 'fixed', amount: 11 }, 10), /cannot exceed/)
})

test('mongoose product schema rejects negative and fractional stock', () => {
  const product = new Product({
    name: 'Invalid stock product', description: 'A product', brand: 'GameCity', category: 'Accessories',
    price: 1, countInStock: -1, image: 'https://example.invalid/product.webp',
  })
  const error = product.validateSync()
  assert.ok(error)
  assert.match(error.errors.countInStock.message, /minimum allowed value|integer/)
})

test('R2 keys use webp for source images with other extensions', () => {
  const key = generateKey('sample-photo.jpg')
  assert.match(key, /^greenbits-store\/\d+-[0-9a-f-]+\.webp$/)
})
