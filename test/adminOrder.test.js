const assert = require('node:assert/strict')
const test = require('node:test')
const { formatAdminOrder } = require('../controllers/orderController')

test('admin order serializer exposes stable list fields for registered customers', () => {
  const formatted = formatAdminOrder({
    _id: 'order-1',
    user: { _id: 'user-1', name: 'Ada', email: 'ada@example.test' },
    orderItems: [{ product: { _id: 'product-1', name: 'Controller' }, name: 'Controller', quantity: 2, price: 1500, image: 'https://example.test/controller.jpg' }],
    totalPrice: 3000,
    isPaid: true,
    isDelivered: false,
    status: 'pending',
    createdAt: '2026-09-14T00:00:00.000Z',
  })

  assert.equal(formatted.id, 'order-1')
  assert.deepEqual(formatted.user, { id: 'user-1', name: 'Ada', email: 'ada@example.test' })
  assert.equal(formatted.order_items[0].product._id, 'product-1')
  assert.equal(formatted.order_items[0].quantity, 2)
  assert.equal(formatted.total_price, 3000)
  assert.equal(formatted.status, 'pending')
})

test('admin order serializer preserves guest identity and empty item lists', () => {
  const formatted = formatAdminOrder({
    _id: 'order-guest',
    user: null,
    guestName: 'Guest buyer',
    guestEmail: 'guest@example.test',
    guestPhone: '+254700000000',
  })

  assert.equal(formatted.user, null)
  assert.equal(formatted.guestName, 'Guest buyer')
  assert.equal(formatted.guestEmail, 'guest@example.test')
  assert.deepEqual(formatted.order_items, [])
})
