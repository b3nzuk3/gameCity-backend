const express = require('express')
const {
  getOrderById,
  updateOrderStatus,
  getOrders,
  deleteOrder,
} = require('../controllers/orderController')
const { protect, admin } = require('../middleware/authMiddleware')

const router = express.Router()

router.get('/', protect, admin, getOrders)
router.get('/:id', protect, admin, getOrderById)
router.put('/:id/status', protect, admin, updateOrderStatus)
router.delete('/:id', protect, admin, deleteOrder)

module.exports = router
