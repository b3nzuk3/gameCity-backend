const assert = require('node:assert/strict')
const test = require('node:test')
const { stableProductSort } = require('../utils/productPagination')

test('product pagination sorts deterministically by creation date then id by default', () => {
  assert.deepEqual(stableProductSort(), { createdAt: -1, _id: 1 })
})

test('product pagination preserves requested sort fields and appends an id tie-breaker', () => {
  assert.deepEqual(stableProductSort('name -price'), {
    name: 1,
    price: -1,
    _id: 1,
  })
})

test('product pagination preserves an explicitly requested id direction', () => {
  assert.deepEqual(stableProductSort('-createdAt -_id'), {
    createdAt: -1,
    _id: -1,
  })
})

test('product pagination accepts comma-separated sort fields and ignores empty input', () => {
  assert.deepEqual(stableProductSort('price,-name'), {
    price: 1,
    name: -1,
    _id: 1,
  })
  assert.deepEqual(stableProductSort(''), { createdAt: -1, _id: 1 })
})