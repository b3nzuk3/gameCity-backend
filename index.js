const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')
const userRoutes = require('./routes/userRoutes')
const productRoutes = require('./routes/productRoutes')
const orderRoutes = require('./routes/orderRoutes')
const cartRoutes = require('./routes/cartRoutes')
const mpesaRoutes = require('./routes/mpesa')
const authRoutes = require('./routes/authRoutes')
const uploadRoutes = require('./routes/upload')

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') })
console.log(
  'Loaded .env:',
  process.env.CLOUDINARY_CLOUD_NAME,
  process.env.CLOUDINARY_API_KEY,
  process.env.CLOUDINARY_API_SECRET
)

// Log loaded environment variables (excluding secrets)
console.log('Loaded environment variables:', {
  PORT: process.env.PORT,
  MPESA_BASE_URL: process.env.MPESA_BASE_URL,
  MPESA_BUSINESS_SHORT_CODE: process.env.MPESA_BUSINESS_SHORT_CODE,
  MPESA_VALIDATION_URL: process.env.MPESA_VALIDATION_URL,
  MPESA_CONFIRMATION_URL: process.env.MPESA_CONFIRMATION_URL,
  hasConsumerKey: !!process.env.MPESA_CONSUMER_KEY,
  hasConsumerSecret: !!process.env.MPESA_CONSUMER_SECRET,
  hasPasskey: !!process.env.MPESA_PASSKEY,
})

const app = express()
const port = process.env.PORT || 5001

// Middleware
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:5173',
      'http://localhost:8080',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Connect to MongoDB (if URI is provided)
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => {
      console.error('MongoDB connection error:', err)
      console.log('Continuing without MongoDB connection...')
    })
}

// Debug route to log all registered routes
app.get('/debug/routes', (req, res) => {
  const routes = []
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods),
      })
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods),
          })
        }
      })
    }
  })
  res.json(routes)
})

// Routes that don't require MongoDB
app.use('/api/auth', authRoutes)
app.use('/api/mpesa', mpesaRoutes)
app.use('/api/products', productRoutes) // Product routes now available without MongoDB
app.use('/api/users', userRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/upload', uploadRoutes)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mongodb:
      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

// Basic route for testing
app.get('/test', (req, res) => {
  res.json({
    message: 'Server is running',
    mongodb:
      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({
    success: false,
    error: err.message || 'Something went wrong!',
  })
})

// Start server
app.listen(port, () => {
  console.log(`\nServer running on port ${port}`)
  console.log('\nAPI endpoints:')
  console.log('- POST /api/auth/login')
  console.log('- GET /api/products')
  console.log('- GET /api/products/:id')
  console.log('- GET /api/products/category/:category')
  console.log('- POST /api/mpesa/test-payment')
  console.log('- POST /api/mpesa/validate')
  console.log('- POST /api/mpesa/confirm')
  console.log('\nTest endpoints:')
  console.log(`- GET http://localhost:${port}/test`)
  console.log(`- GET http://localhost:${port}/health`)
})
