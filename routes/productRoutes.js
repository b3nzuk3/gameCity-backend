const express = require('express')
const router = express.Router()
const Product = require('../models/productModel')
const mongoose = require('mongoose')
const multer = require('multer')
const { cacheMiddleware, clearCache } = require('../middleware/cacheMiddleware')
const { resolveProductImages, resolveProductImagesBulk } = require('../utils/imageUtils')
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
const { buildProductFilterQuery } = require('../utils/productFilters')
const { publicProductSort } = require('../utils/productPagination')

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
  laptops: 'Laptops',
  all: 'all',
}

const storage = multer.memoryStorage()
const upload = multer({ storage })

const MAX_PUBLIC_LIMIT = 100

const parsePublicPagination = (query, defaultLimit) => {
  const parseValue = (name, fallback, maximum) => {
    if (query[name] === undefined) return fallback
    if (Array.isArray(query[name]) || !/^[1-9]\d*$/.test(String(query[name]))) {
      const error = new Error(`${name} must be a positive integer`)
      error.status = 400
      error.code = 'INVALID_PAGINATION'
      throw error
    }
    const value = Number(query[name])
    if (!Number.isSafeInteger(value) || (maximum && value > maximum)) {
      const error = new Error(`${name} is outside the allowed range`)
      error.status = 400
      error.code = 'INVALID_PAGINATION'
      throw error
    }
    return value
  }

  return {
    page: parseValue('page', 1),
    limit: parseValue('limit', defaultLimit, MAX_PUBLIC_LIMIT),
  }
}

const sendPublicQueryError = (res, error, fallbackMessage) => {
  if (error?.status !== 400) return false
  res.status(400).json({
    success: false,
    code: error.code || 'INVALID_QUERY',
    message: error.message || fallbackMessage,
  })
  return true
}

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

// Get all products with pagination, filtering, and sorting
router.get('/', cacheMiddleware(300), async (req, res) => {
  try {
    const { page, limit } = parsePublicPagination(req.query, 50)
    const sort = publicProductSort(req.query.sort)
    const query = buildProductFilterQuery(req.query, { categoryMapping })
    const skip = (page - 1) * limit

    const [products, total] = await Promise.all([
      Product.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(query),
    ])

    const totalPages = Math.ceil(total / limit)
    const resolvedProducts = resolveProductImagesBulk(products)

    res.json({
      products: resolvedProducts.map((p) => ({ ...p, id: p._id.toString() })),
      page,
      pages: totalPages,
      total,
      hasMore: page < totalPages,
    })
  } catch (error) {
    if (sendPublicQueryError(res, error, 'Invalid product query')) return
    console.error('Error fetching products:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
    })
  }
})

router.get('/brands', getUniqueBrands)

router.get('/category/:category/count', cacheMiddleware(300), async (req, res) => {
  try {
    const query = buildProductFilterQuery(req.query, {
      categoryMapping,
      category: req.params.category,
    })
    const total = await Product.countDocuments(query)
    res.json({ total })
  } catch (error) {
    if (sendPublicQueryError(res, error, 'Invalid product query')) return
    console.error('Error counting filtered category products:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to count filtered products',
    })
  }
})

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

    // Resolve images: prefer R2 URLs, fallback to Cloudinary
    const resolved = resolveProductImages(product)

    res.json({ ...resolved, id: product._id.toString() })
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
    const { page, limit } = parsePublicPagination(req.query, 10)
    const sort = publicProductSort(req.query.sort)
    const query = buildProductFilterQuery(req.query, {
      categoryMapping,
      category: req.params.category,
    })
    const skip = (page - 1) * limit

    const [products, total] = await Promise.all([
      Product.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(query),
    ])

    const totalPages = Math.ceil(total / limit)
    const resolvedProducts = resolveProductImagesBulk(products)

    res.json({
      products: resolvedProducts.map((p) => ({ ...p, id: p._id?.toString() || p.id })),
      page,
      pages: totalPages,
      total,
      hasMore: page < totalPages,
    })
  } catch (error) {
    if (sendPublicQueryError(res, error, 'Invalid product query')) return
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

    // Remove the '-nairobi' suffix and optional product-ID disambiguator.
    const normalizedSlug = slug.replace(/-nairobi$/, '')
    const idSuffixMatch = normalizedSlug.match(/-([a-f\d]{24})$/i)
    const cleanSlug = idSuffixMatch
      ? normalizedSlug.slice(0, -idSuffixMatch[0].length)
      : normalizedSlug

    // Find product by matching the slug with product name
    const products = await Product.find({})

    const product = products.find((p) => {
      if (idSuffixMatch && String(p._id) !== idSuffixMatch[1]) return false
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

    // Resolve images: prefer R2 URLs, fallback to Cloudinary
    const resolved = resolveProductImages(product)

    res.json(resolved)
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
