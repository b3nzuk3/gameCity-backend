const Order = require('../models/orderModel')
const Product = require('../models/productModel')
const User = require('../models/userModel')
const mongoose = require('mongoose')

// @desc    Create new order
// @route   POST /api/orders
// @access  Public (supports both authenticated and guest users)
const createOrder = async (req, res) => {
  try {
    console.log('Incoming order payload:', req.body)
    const { orderItems, paymentMethod, itemsPrice, totalPrice, guestName, guestEmail, guestPhone } = req.body

    if (orderItems && orderItems.length === 0) {
      res.status(400)
      throw new Error('No order items')
    }

    // If user is authenticated, use their ID. Otherwise, require guest info
    if (req.user) {
      // Authenticated user order
      const order = new Order({
        orderItems,
        user: req.user._id,
        paymentMethod,
        itemsPrice,
        totalPrice,
      })

      const createdOrder = await order.save()
      res.status(201).json(createdOrder)
    } else {
      // Guest order - validate guest information
      if (!guestName || !guestEmail || !guestPhone) {
        res.status(400)
        throw new Error('Guest information (name, email, phone) is required for guest checkout')
      }

      const order = new Order({
        orderItems,
        guestName,
        guestEmail,
        guestPhone,
        paymentMethod,
        itemsPrice,
        totalPrice,
      })

      const createdOrder = await order.save()
      res.status(201).json(createdOrder)
    }
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
}

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      'user',
      'name email'
    )

    if (order) {
      res.json(order)
    } else {
      res.status(404)
      throw new Error('Order not found')
    }
  } catch (error) {
    res.status(404).json({ message: 'Order not found' })
  }
}

// @desc    Update order to paid
// @route   PUT /api/orders/:id/pay
// @access  Private
const updateOrderToPaid = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (order) {
      order.isPaid = true
      order.paidAt = Date.now()
      order.paymentResult = {
        id: req.body.id,
        status: req.body.status,
        update_time: req.body.update_time,
        email_address: req.body.payer.email_address,
      }

      const updatedOrder = await order.save()

      res.json(updatedOrder)
    } else {
      res.status(404)
      throw new Error('Order not found')
    }
  } catch (error) {
    res.status(404).json({ message: 'Order not found' })
  }
}

// @desc    Update order to delivered
// @route   PUT /api/orders/:id/deliver
// @access  Private/Admin
const updateOrderToDelivered = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (order) {
      if (order.isDelivered) {
        res.status(400)
        throw new Error('Order is already delivered')
      }

      // Update product stock
      for (const item of order.order_items) {
        const product = await Product.findById(item.product)
        if (product) {
          product.count_in_stock -= item.quantity
          await product.save()
        }
      }

      order.isDelivered = true
      order.deliveredAt = Date.now()
      order.status = 'Delivered'

      const updatedOrder = await order.save()

      res.json(updatedOrder)
    } else {
      res.status(404)
      throw new Error('Order not found')
    }
  } catch (error) {
    res
      .status(res.statusCode === 200 ? 500 : res.statusCode)
      .json({ message: error.message })
  }
}

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)

    if (order) {
      const newStatus = req.body.status
      const isCompleting = newStatus === 'completed' && !order.isDelivered
      const isReverting = newStatus === 'pending' && order.isDelivered

      order.status = newStatus

      if (isCompleting) {
        order.isDelivered = true
        order.deliveredAt = Date.now()

        // Decrease stock
        for (const item of order.orderItems) {
          const product = await Product.findById(item.product)
          if (product) {
            product.countInStock -= item.quantity
            await product.save()
          }
        }
      } else if (isReverting) {
        order.isDelivered = false
        order.deliveredAt = null // or undefined

        // Increase stock
        for (const item of order.orderItems) {
          const product = await Product.findById(item.product)
          if (product) {
            product.countInStock += item.quantity
            await product.save()
          }
        }
      }

      const updatedOrder = await order.save()
      res.json(updatedOrder)
    } else {
      res.status(404).json({ message: 'Order not found' })
    }
  } catch (error) {
    console.error('Error in updateOrderStatus:', error)
    res.status(500).json({ message: 'Server error while updating status' })
  }
}

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
    res.json(orders)
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseListInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, maximum)
}

function formatAdminOrder(order) {
  return {
    id: String(order._id),
    user: order.user
      ? {
          id: String(order.user._id || order.user.id || ''),
          name: order.user.name,
          email: order.user.email,
        }
      : null,
    guestName: order.guestName || '',
    guestEmail: order.guestEmail || '',
    guestPhone: order.guestPhone || '',
    order_items: (order.orderItems || []).map((item) => ({
      product: item.product,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      image: item.image,
    })),
    paymentMethod: order.paymentMethod,
    payment_result: order.paymentResult,
    total_price: order.totalPrice,
    is_paid: order.isPaid,
    paid_at: order.paidAt,
    is_delivered: order.isDelivered,
    delivered_at: order.deliveredAt,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }
}

// @desc    Get all orders for admin clients
// @route   GET /api/admin/orders
// @access  Private/Admin
const getOrders = async (req, res) => {
  try {
    const hasListQuery = ['page', 'limit', 'search', 'status'].some((key) => req.query[key] !== undefined)
    const page = parseListInteger(req.query.page, 1, 1000000)
    const limit = parseListInteger(req.query.limit, 25, 100)
    const query = {}

    if (req.query.status === 'pending' || req.query.status === 'completed') {
      query.status = req.query.status
    }

    const search = String(req.query.search || '').trim()
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i')
      const matchingUsers = await User.find({ $or: [{ name: pattern }, { email: pattern }] }).select('_id').lean()
      const searchClauses = [
        { guestName: pattern },
        { guestEmail: pattern },
        { guestPhone: pattern },
      ]
      if (mongoose.isValidObjectId(search)) searchClauses.push({ _id: search })
      if (matchingUsers.length) searchClauses.push({ user: { $in: matchingUsers.map((user) => user._id) } })
      query.$or = searchClauses
    }

    const orderQuery = Order.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .populate('user', 'id name email')
      .populate('orderItems.product')
    if (hasListQuery) orderQuery.skip((page - 1) * limit).limit(limit)

    const [orders, total] = await Promise.all([
      orderQuery,
      hasListQuery ? Order.countDocuments(query) : Promise.resolve(null),
    ])
    const formattedOrders = orders.map(formatAdminOrder)

    if (!hasListQuery) return res.json(formattedOrders)
    const pages = Math.max(1, Math.ceil(total / limit))
    return res.json({ orders: formattedOrders, page, pages, total, hasMore: page < pages })
  } catch (error) {
    console.error('Error fetching admin orders:', error)
    return res.status(500).json({ message: 'Server error' })
  }
}

// Delete order by ID
const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id)
    if (!order) {
      return res.status(404).json({ message: 'Order not found' })
    }
    res.json({ message: 'Order deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

module.exports = {
  createOrder,
  getOrderById,
  updateOrderToPaid,
  updateOrderToDelivered,
  updateOrderStatus,
  getMyOrders,
  getOrders,
  deleteOrder,
  formatAdminOrder,
}
