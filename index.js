const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
const userRoutes = require('./routes/userRoutes')
const productRoutes = require('./routes/productRoutes')
const orderRoutes = require('./routes/orderRoutes')
const cartRoutes = require('./routes/cartRoutes')
const mpesaRoutes = require('./routes/mpesa')
const authRoutes = require('./routes/authRoutes')
const uploadRoutes = require('./routes/upload')
const sitemapRoutes = require('./routes/sitemapRoutes')

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

// Security middleware
app.use(
  helmet({
    frameguard: { action: 'deny' }, // Sets X-Frame-Options: DENY
    noSniff: true, // Sets X-Content-Type-Options: nosniff
    xssFilter: true, // Sets X-XSS-Protection: 1; mode=block
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'", 'https:', 'https://res.cloudinary.com'],
      },
    },
  })
)

// Compression middleware
app.use(compression())

// Middleware
app.use(
  cors({
    origin: [
      'https://www.gamecityelectronics.com',
      'https://www.gamecityelectronics.co.ke',
      'https://gamecityelectronics.co.ke',
      'https://game-city-one.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:8080',
    ],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    exposedHeaders: ['Cross-Origin-Resource-Policy'],
  })
)

// Rate limiting - Placed AFTER CORS to ensure headers are sent even for blocked requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again later.',
})
app.use('/api/', limiter)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Connect to MongoDB (if URI is provided)
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
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

// Sitemap route (serves XML directly)
app.use('/', sitemapRoutes)

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    database:
      mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString(),
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
  const status = err.status || 500
  const message = err.message || 'Something went wrong!'
  res.status(status).json({
    success: false,
    message,
    details: process.env.NODE_ENV === 'production' ? undefined : err.stack,
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
  console.log(`- GET http://localhost:${port}/api/health`)
})
