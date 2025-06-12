const express = require('express')
const router = express.Router()
const Product = require('../models/productModel')
const mongoose = require('mongoose')
const multer = require('multer')
const cloudinary = require('../utils/cloudinary')
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

// Get all products
router.get('/', async (req, res) => {
  try {
    const { category } = req.query

    // If MongoDB is connected and Product model is available, fetch from DB
    if (mongoose.connection.readyState === 1 && Product) {
      const query = {}
      if (category && category !== 'all') {
        query.category = category
      }
      const products = await Product.find(query).lean()
      const normalized = products.map((p) => ({
        ...p,
        id: p._id.toString(),
      }))
      return res.json(normalized)
    }

    // Otherwise, use mock data
    let products = [...mockProducts]
    if (category && category !== 'all') {
      products = products.filter((p) => p.category === category)
    }
    res.json(products)
  } catch (error) {
    console.error('Error fetching products:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
    })
  }
})

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    // If MongoDB is connected and Product model is available, fetch from DB
    if (mongoose.connection.readyState === 1 && Product) {
      const product = await Product.findById(req.params.id).lean()
      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found',
        })
      }
      return res.json({ ...product, id: product._id.toString() })
    }
    // Otherwise, use mock data
    const product = mockProducts.find((p) => p.id === req.params.id)
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      })
    }
    res.json(product)
  } catch (error) {
    console.error('Error fetching product:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
    })
  }
})

// Get products by category
router.get('/category/:category', (req, res) => {
  try {
    const { category } = req.params

    if (category === 'all') {
      // Return just the products array as expected by the frontend
      return res.json(mockProducts)
    }

    const products = mockProducts.filter((p) => p.category === category)

    // Return just the products array as expected by the frontend
    res.json(products)
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
router.post('/add', upload.single('image'), async (req, res) => {
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
    res.status(201).json(product)
  } catch (error) {
    console.error('Product upload error:', error)
    res.status(500).json({ error: 'Failed to add product' })
  }
})

// Update product (supports MongoDB and FormData)
router.put('/:id', upload.single('image'), async (req, res) => {
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
router.delete('/:id', async (req, res) => {
  try {
    // If MongoDB is connected and Product model is available, delete from DB
    if (mongoose.connection.readyState === 1 && Product) {
      const deletedProduct = await Product.findByIdAndDelete(req.params.id)
      if (!deletedProduct) {
        return res
          .status(404)
          .json({ success: false, error: 'Product not found' })
      }
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
