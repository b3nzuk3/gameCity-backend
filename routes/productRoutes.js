const express = require('express')
const router = express.Router()
const Product = require('../models/productModel')
const mongoose = require('mongoose')
const multer = require('multer')
const cloudinary = require('../utils/cloudinary')
const { cacheMiddleware, clearCache } = require('../middleware/cacheMiddleware')
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductReview,
  hasUserPurchasedProduct,
  getUniqueBrands,
  clearProductCache,
} = require('../controllers/productController')
const { protect, admin } = require('../middleware/authMiddleware')

const storage = multer.memoryStorage()
const upload = multer({ storage })

// Mock products data
const mockProducts = [
  {
    id: '1',
    name: 'Gaming Monitor 27"',
    description: 'High refresh rate gaming monitor with HDR support',
    price: 299.99,
    category: 'monitors',
    imageUrl: 'https://via.placeholder.com/300',
    stock: 10,
    rating: 4.5,
    reviews: [],
  },
  {
    id: '2',
    name: 'Mechanical Keyboard',
    description: 'RGB mechanical keyboard with Cherry MX switches',
    price: 129.99,
    category: 'keyboards',
    imageUrl: 'https://via.placeholder.com/300',
    stock: 15,
    rating: 4.8,
    reviews: [],
  },
  {
    id: '3',
    name: 'Wireless Gaming Mouse',
    description: 'High DPI wireless gaming mouse with RGB',
    price: 79.99,
    category: 'mice',
    imageUrl: 'https://via.placeholder.com/300',
    stock: 20,
    rating: 4.6,
    reviews: [],
  },
]

// Helper to upload buffer to Cloudinary using a Promise
function uploadToCloudinary(buffer, folder = 'products') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error)
        resolve(result)
      }
    )
    stream.end(buffer)
  })
}

// Get all products with pagination, filtering, and sorting
router.get('/', cacheMiddleware(300), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const category = req.query.category
    const sort = req.query.sort || '-createdAt'
    const search = req.query.search

    console.log(`ProductRoutes: limit=${limit}, page=${page}`)

    const query = {}

    if (category && category !== 'all') {
      query.category = { $regex: category.replace(/-/g, ' '), $options: 'i' }
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ]
    }

    const skip = (page - 1) * limit

    const [products, total] = await Promise.all([
      Product.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(query),
    ])

    const totalPages = Math.ceil(total / limit)

    res.json({
      products: products.map((p) => ({ ...p, id: p._id.toString() })),
      page,
      pages: totalPages,
      total,
      hasMore: page < totalPages,
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
    })
  }
})

router.get('/brands', getUniqueBrands)

// Get product by ID with caching
router.get('/:id', cacheMiddleware(300), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean()

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      })
    }

    res.json({ ...product, id: product._id.toString() })
  } catch (error) {
    console.error('Error fetching product:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
    })
  }
})

// Get products by category with caching
router.get('/category/:category', cacheMiddleware(300), async (req, res) => {
  try {
    const { category } = req.params
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const sort = req.query.sort || '-createdAt'

    // Map URL slugs to database category names
    const categoryMapping = {
      'pre-built': 'PRE-BUILT',
      monitors: 'Monitors',
      'graphics-cards': 'Graphics Cards',
      memory: 'Memory',
      processors: 'Processors',
      storage: 'Storage',
      motherboards: 'Motherboards',
      cases: 'Cases',
      'power-supply': 'Power Supply',
      'cpu-cooling': 'CPU Cooling',
      oem: 'OEM',
      accessories: 'Accessories',
      all: 'all',
    }

    const dbCategory = categoryMapping[category] || category
    const query = category === 'all' ? {} : { category: dbCategory }
    const skip = (page - 1) * limit

    console.log(
      `CategoryRoute: category=${category}, dbCategory=${dbCategory}, page=${page}, limit=${limit}`
    )

    const [products, total] = await Promise.all([
      Product.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(query),
    ])

    const totalPages = Math.ceil(total / limit)

    console.log(
      `CategoryRoute: Found ${products.length} products, total: ${total}`
    )

    res.json({
      products: products.map((p) => ({ ...p, id: p._id.toString() })),
      page,
      pages: totalPages,
      total,
      hasMore: page < totalPages,
    })
  } catch (error) {
    console.error('Error fetching products by category:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
    })
  }
})

// Get product by slug (SEO-friendly URL)
router.get('/slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params

    // Remove the '-nairobi' suffix if present
    const cleanSlug = slug.replace(/-nairobi$/, '')

    // Find product by matching the slug with product name
    const products = await Product.find({})

    const product = products.find((p) => {
      const productSlug = p.name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')

      return productSlug === cleanSlug
    })

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      })
    }

    res.json(product)
  } catch (error) {
    console.error('Error fetching product by slug:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
    })
  }
})

// Protected routes for reviews
router.route('/:id/reviews').post(protect, createProductReview)
router.route('/:id/has-purchased').get(protect, hasUserPurchasedProduct)

// Admin routes
router.route('/').post(protect, admin, createProduct)
router.route('/clear-cache').post(protect, admin, clearProductCache)
router
  .route('/:id')
  .put(protect, admin, updateProduct)
  .delete(protect, admin, deleteProduct)

module.exports = router
