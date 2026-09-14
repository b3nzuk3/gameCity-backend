const express = require('express')
const Product = require('../models/productModel')
const { protect, admin } = require('../middleware/authMiddleware')
const { resolveProductImagesBulk } = require('../utils/imageUtils')

const router = express.Router()

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
}

const sortMapping = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  'name-asc': { name: 1, _id: 1 },
  'name-desc': { name: -1, _id: -1 },
  'price-asc': { price: 1, _id: 1 },
  'price-desc': { price: -1, _id: -1 },
  'stock-asc': { countInStock: 1, _id: 1 },
  'stock-desc': { countInStock: -1, _id: -1 },
}

const listProjection = [
  'name', 'image', 'image_r2', 'image_r2_variants', 'images', 'images_r2',
  'description', 'brand', 'category', 'price', 'countInStock', 'condition',
  'rating', 'numReviews', 'offer', 'createdAt', 'updatedAt',
].join(' ')

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, maximum)
}

router.get('/', protect, admin, async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1, 1000000)
    const limit = parsePositiveInteger(req.query.limit, 25, 100)
    const query = {}

    const search = String(req.query.search || '').trim()
    if (search) {
      const pattern = { $regex: escapeRegex(search), $options: 'i' }
      query.$or = [{ name: pattern }, { description: pattern }, { brand: pattern }]
    }

    const category = String(req.query.category || '').trim()
    if (category && category !== 'all') query.category = categoryMapping[category] || category

    const brands = String(req.query.brand || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    if (brands.length === 1) query.brand = brands[0]
    if (brands.length > 1) query.brand = { $in: brands }

    if (req.query.condition === 'New' || req.query.condition === 'Pre-Owned') {
      query.condition = req.query.condition
    }
    if (req.query.stock === 'in-stock') query.countInStock = { $gt: 0 }
    if (req.query.stock === 'out-of-stock') query.countInStock = 0

    const sort = sortMapping[req.query.sort] || sortMapping.newest
    const skip = (page - 1) * limit
    const [products, total] = await Promise.all([
      Product.find(query).select(listProjection).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(query),
    ])

    const pages = Math.max(1, Math.ceil(total / limit))
    const resolvedProducts = resolveProductImagesBulk(products).map((product) => ({
      ...product,
      id: product._id.toString(),
    }))
    return res.json({ products: resolvedProducts, page, pages, total, hasMore: page < pages })
  } catch (error) {
    console.error('Admin product list error:', error)
    return res.status(500).json({ code: 'PRODUCT_LIST_FAILED', message: 'Unable to load products' })
  }
})

module.exports = router
