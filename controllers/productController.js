const Product = require('../models/productModel')
const Order = require('../models/orderModel')
const { clearCache } = require('../middleware/cacheMiddleware')

// @desc    Fetch all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const pageSize = 10
    const page = Number(req.query.pageNumber) || 1

    const keyword = req.query.keyword
      ? {
          name: {
            $regex: req.query.keyword,
            $options: 'i',
          },
        }
      : {}

    const category = req.query.category
      ? {
          category: {
            $regex: req.query.category.replace(/-/g, ' '),
            $options: 'i',
          },
        }
      : {}

    const count = await Product.countDocuments({ ...keyword, ...category })

    const products = await Product.find({ ...keyword, ...category })
      .limit(pageSize)
      .skip(pageSize * (page - 1))

    res.json({
      products,
      page,
      pages: Math.ceil(count / pageSize),
      count,
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Fetch single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)

    if (product) {
      res.json(product)
    } else {
      res.status(404)
      throw new Error('Product not found')
    }
  } catch (error) {
    res.status(404).json({ message: 'Product not found' })
  }
}

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      description,
      image,
      images,
      brand,
      category,
      countInStock,
      specifications,
      offer,
    } = req.body

    const product = new Product({
      name,
      price,
      description,
      image,
      images,
      brand,
      category,
      countInStock,
      specifications,
      offer,
      user: req.user._id,
      numReviews: 0,
    })

    const createdProduct = await product.save()
    await clearCache()
    res.status(201).json(createdProduct)
  } catch (error) {
    res.status(400).json({ message: 'Invalid product data' })
  }
}

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      description,
      image,
      images,
      brand,
      category,
      countInStock,
      specifications,
      offer,
    } = req.body

    const product = await Product.findById(req.params.id)

    if (product) {
      product.name = name || product.name
      product.price = price || product.price
      product.description = description || product.description
      product.image = image || product.image
      product.images = images || product.images
      product.brand = brand || product.brand
      product.category = category || product.category
      product.countInStock = countInStock ?? product.countInStock
      product.specifications = specifications || product.specifications
      if (offer !== undefined) {
        // Basic validation: ensure amount is non-negative and type is valid
        const nextOffer = offer || {}
        if (nextOffer.amount !== undefined && Number(nextOffer.amount) < 0) {
          return res.status(400).json({ message: 'Offer amount must be >= 0' })
        }
        if (
          nextOffer.type &&
          !['percentage', 'fixed'].includes(String(nextOffer.type))
        ) {
          return res
            .status(400)
            .json({ message: 'Offer type must be percentage or fixed' })
        }
        product.offer = {
          ...product.offer?.toObject?.(),
          ...nextOffer,
        }
      }

      const updatedProduct = await product.save()

      // Invalidate cached product listings so changes reflect in grids/cards
      await clearCache()

      res.json(updatedProduct)
    } else {
      res.status(404)
      throw new Error('Product not found')
    }
  } catch (error) {
    res.status(404).json({ message: 'Product not found' })
  }
}

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    console.log('DELETE /api/products/:id called with id:', req.params.id)
    const product = await Product.findByIdAndDelete(req.params.id)
    console.log('Product deleted:', product)
    if (product) {
      await clearCache()
      res.json({ message: 'Product removed' })
    } else {
      res.status(404)
      throw new Error('Product not found')
    }
  } catch (error) {
    console.error('Delete error:', error)
    res.status(404).json({ message: 'Product not found' })
  }
}

// @desc    Create new review
// @route   POST /api/products/:id/reviews
// @access  Private
const createProductReview = async (req, res) => {
  try {
    const { rating, comment } = req.body

    const product = await Product.findById(req.params.id)

    if (product) {
      const alreadyReviewed = product.reviews.find(
        (r) => r.user.toString() === req.user._id.toString()
      )

      if (alreadyReviewed) {
        return res.status(400).json({ message: 'Product already reviewed' })
      }

      // Check if the user has purchased the product
      const orders = await Order.find({
        user: req.user._id,
        'orderItems.product': product._id,
        status: 'completed',
      })

      if (orders.length === 0) {
        return res
          .status(403)
          .json({ message: 'You must purchase this product to review it' })
      }

      const review = {
        name: req.user.name,
        rating: Number(rating),
        comment,
        user: req.user._id,
      }

      product.reviews.push(review)

      product.numReviews = product.reviews.length

      product.rating =
        product.reviews.reduce((acc, item) => item.rating + acc, 0) /
        product.reviews.length

      await product.save()

      res.status(201).json({ message: 'Review added' })
    } else {
      res.status(404).json({ message: 'Product not found' })
    }
  } catch (error) {
    console.error('Create review error:', error)
    res.status(400).json({ message: error.message })
  }
}

// @desc    Check if user has purchased a product
// @route   GET /api/products/:id/has-purchased
// @access  Private
const hasUserPurchasedProduct = async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.user._id,
      'orderItems.product': req.params.id,
      status: 'completed',
    })

    if (orders.length > 0) {
      res.json({ hasPurchased: true })
    } else {
      res.json({ hasPurchased: false })
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
}

// @desc    Get all unique brands
// @route   GET /api/products/brands
// @access  Public
const getUniqueBrands = async (req, res) => {
  try {
    // Add timeout to the distinct operation
    const brands = await Product.distinct('brand').maxTimeMS(5000)
    res.json(brands.filter(Boolean).sort()) // Filter out null/empty brands and sort them
  } catch (error) {
    console.error('Error fetching unique brands:', error)

    // Fallback: try a simpler query if distinct times out
    try {
      console.log('Attempting fallback query for brands...')
      const products = await Product.find({}, 'brand')
        .limit(1000)
        .maxTimeMS(5000)
      const brands = [
        ...new Set(products.map((p) => p.brand).filter(Boolean)),
      ].sort()
      res.json(brands)
    } catch (fallbackError) {
      console.error('Fallback query also failed:', fallbackError)
      res.status(500).json({ message: 'Server error while fetching brands' })
    }
  }
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductReview,
  hasUserPurchasedProduct,
  getUniqueBrands,
}
