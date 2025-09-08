const express = require('express')
const router = express.Router()
const {
  createOrder,
  getOrderById,
  updateOrderToPaid,
  updateOrderToDelivered,
  updateOrderStatus,
  getMyOrders,
  getOrders,
} = require('../controllers/orderController')
const { protect, admin } = require('../middleware/authMiddleware')

router.route('/').post(protect, createOrder).get(protect, admin, getOrders)

router.route('/myorders').get(protect, getMyOrders)

router.route('/:id').get(protect, getOrderById)

router.route('/:id/pay').put(protect, updateOrderToPaid)

router.route('/:id/deliver').put(protect, admin, updateOrderToDelivered)

router.route('/:id/status').put(protect, admin, updateOrderStatus)

// Add delete order route
router
  .route('/:id')
  .delete(protect, admin, require('../controllers/orderController').deleteOrder)

module.exports = router
