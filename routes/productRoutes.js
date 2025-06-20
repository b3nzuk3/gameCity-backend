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
    const limit = parseInt(req.query.limit) || 10
    const category = req.query.category
    const sort = req.query.sort || '-createdAt'
    const search = req.query.search

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

    const query = category === 'all' ? {} : { category }
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
    console.error('Error fetching products by category:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
    })
  }
})

// Admin routes below this point
// These should be protected in production

// Create product with image upload to Cloudinary
router.post('/', protect, admin, upload.single('image'), async (req, res) => {
  try {
    console.log('Product add request body:', req.body) // Debug log
    const { name, price, count_in_stock, ...otherFields } = req.body
    let imageUrl = ''

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, 'products')
      imageUrl = result.secure_url
    }

    const product = new Product({
      name,
      price,
      image: imageUrl,
      countInStock: Number(count_in_stock),
      ...otherFields,
    })

    await product.save()
    await clearCache() // Clear product cache
    res.status(201).json(product)
  } catch (error) {
    console.error('Product upload error:', error)
    res.status(500).json({ error: 'Failed to add product' })
  }
})

// Update product (supports MongoDB and FormData)
router.put('/:id', protect, admin, upload.single('image'), async (req, res) => {
  try {
    // If MongoDB is connected and Product model is available, update in DB
    if (mongoose.connection.readyState === 1 && Product) {
      const updateData = { ...req.body }

      // If an image is uploaded, handle Cloudinary upload
      if (req.file) {
        const result = await uploadToCloudinary(req.file.buffer, 'products')
        updateData.image = result.secure_url
      }

      // Convert count_in_stock to number if present
      if (updateData.count_in_stock) {
        updateData.countInStock = Number(updateData.count_in_stock)
        delete updateData.count_in_stock
      }

      const updatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      )

      if (!updatedProduct) {
        return res
          .status(404)
          .json({ success: false, error: 'Product not found' })
      }

      await clearCache() // Clear product cache
      return res.json({
        ...updatedProduct.toObject(),
        id: updatedProduct._id.toString(),
      })
    }

    // Otherwise, update mock data
    const index = mockProducts.findIndex((p) => p.id === req.params.id)
    if (index === -1) {
      return res
        .status(404)
        .json({ success: false, error: 'Product not found' })
    }
    mockProducts[index] = { ...mockProducts[index], ...req.body }
    res.json(mockProducts[index])
  } catch (error) {
    console.error('Error updating product:', error)
    res.status(500).json({ success: false, error: 'Failed to update product' })
  }
})

// Delete product (supports MongoDB and mock data)
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    // If MongoDB is connected and Product model is available, delete from DB
    if (mongoose.connection.readyState === 1 && Product) {
      const deletedProduct = await Product.findByIdAndDelete(req.params.id)
      if (!deletedProduct) {
        return res
          .status(404)
          .json({ success: false, error: 'Product not found' })
      }
      await clearCache() // Clear product cache
      return res.json({
        success: true,
        message: 'Product deleted successfully',
      })
    }

    // Otherwise, delete from mock data
    const index = mockProducts.findIndex((p) => p.id === req.params.id)
    if (index === -1) {
      return res
        .status(404)
        .json({ success: false, error: 'Product not found' })
    }
    mockProducts.splice(index, 1)

    res.json({
      success: true,
      message: 'Product deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting product:', error)
    res.status(500).json({ success: false, error: 'Failed to delete product' })
  }
})

module.exports = router
