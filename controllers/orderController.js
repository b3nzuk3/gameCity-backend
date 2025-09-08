const Order = require('../models/orderModel')
const Product = require('../models/productModel')
const mongoose = require('mongoose')

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  try {
    console.log('Incoming order payload:', req.body)
    const { orderItems, paymentMethod, itemsPrice, totalPrice } = req.body

    if (orderItems && orderItems.length === 0) {
      res.status(400)
      throw new Error('No order items')
    }

    const order = new Order({
      orderItems,
      user: req.user._id,
      paymentMethod,
      itemsPrice,
      totalPrice,
    })

    const createdOrder = await order.save()

    res.status(201).json(createdOrder)
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

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate('user', 'id name')
      .populate('orderItems.product')

    const formattedOrders = orders.map((order) => ({
      id: order._id,
      user: order.user,
      order_items: order.orderItems.map((item) => ({
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
    }))

    res.json(formattedOrders)
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
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
}
