const Product = require('../models/productModel')
const Order = require('../models/orderModel')
const { clearCache } = require('../middleware/cacheMiddleware')
const { resolveProductImages, resolveProductImagesBulk } = require('../utils/imageUtils')
const mediaReference = require('../services/mediaReferenceService')
const { hasOwn, validateOffer, validateProductPayload } = require('../utils/productValidation')

/**
 * Normalize the primary image pair (image, image_r2) for an update payload.
 *
 * Rules:
 *  1. Explicit `payload.image_r2` is authoritative for the R2 field, and
 *     mirrors into `image` when `image` is absent (preserves prior sync
 *     behavior for admin uploads).
 *  2. `payload.image` that is an R2 URL with `image_r2` omitted means the
 *     SAME image relationship — pair it. Previously this case nulled
 *     `image_r2`, which made cleanup treat the live primary object as
 *     removed and delete it from R2 while `image` kept referencing it.
 *  3. A non-R2 `payload.image` on a product whose legacy `image` mirrored
 *     `image_r2` replaces the primary; the R2 pair is cleared and cleanup
 *     (reference-gated) may reclaim the old object.
 *  4. Neither field in the payload → both unchanged (non-image edits can
 *     never alter the media relationship).
 */
function resolvePrimaryImagePair({ payload, existingImage, existingImageR2 }) {
  if (hasOwn(payload, 'image_r2')) {
    const imageR2 = payload.image_r2 || null
    const image = hasOwn(payload, 'image') ? payload.image : (imageR2 || existingImage)
    return [image, imageR2]
  }

  if (hasOwn(payload, 'image')) {
    const image = payload.image
    if (mediaReference.isR2Url(image)) return [image, image]
    if (existingImageR2 && image === existingImageR2) return [image, existingImageR2]
    if (existingImage && existingImage === existingImageR2) return [image, null]
    return [image, existingImageR2]
  }

  return [existingImage, existingImageR2]
}

// @desc    Fetch all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const pageSize = 50
    const page = Number(req.query.pageNumber) || 1
    console.log(`getProducts: pageSize=${pageSize}, page=${page}`)

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

    console.log(
      `getProducts: Found ${products.length} products, total count: ${count}`
    )

    // Resolve images: prefer R2 URLs, fallback to Cloudinary
    const resolvedProducts = resolveProductImagesBulk(products)

    res.json({
      products: resolvedProducts,
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
      // Resolve images: prefer R2 URLs, fallback to Cloudinary
      const resolved = resolveProductImages(product)
      res.json(resolved)
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
    const payload = {
      ...(req.body || {}),
      image: req.body?.image || req.body?.image_r2 || '',
      condition: req.body?.condition || 'New',
    }
    const validationErrors = validateProductPayload(payload, { partial: false })
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({ code: 'INVALID_PRODUCT', message: Object.values(validationErrors)[0], fields: validationErrors })
    }

    const product = new Product({
      ...payload,
      image_r2: payload.image_r2 || null,
      image_r2_variants: payload.image_r2_variants || null,
      images: Array.isArray(payload.images) ? payload.images : [],
      images_r2: Array.isArray(payload.images_r2) ? payload.images_r2 : [],
      condition: payload.condition || 'New',
      specifications: payload.specifications || {},
      offer: payload.offer || undefined,
      numReviews: 0,
    })

    const createdProduct = await product.save()
    await clearCache()
    return res.status(201).json(createdProduct)
  } catch (error) {
    console.error('Create product error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ code: 'INVALID_PRODUCT', message: 'Invalid product data', fields: error.errors })
    }
    return res.status(500).json({ code: 'PRODUCT_CREATE_FAILED', message: 'Unable to create product' })
  }
}

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  let product
  try {
    product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' })

    const payload = req.body || {}
    const existing = product.toObject ? product.toObject() : product
    const nextValues = {
      ...existing,
      ...payload,
      image: hasOwn(payload, 'image') ? payload.image : (payload.image_r2 !== undefined ? payload.image_r2 : existing.image),
    }
    const validationErrors = validateProductPayload(payload, { partial: true, existing: nextValues })
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({ code: 'INVALID_PRODUCT', message: Object.values(validationErrors)[0], fields: validationErrors })
    }

    // Snapshot the pre-update media state (all fields) — this is what cleanup
    // compares against. Non-image edits produce an identical snapshot, so
    // they can never trigger a deletion.
    const oldProductSnapshot = product.toObject()

    const [nextImage, nextImageR2] = resolvePrimaryImagePair({
      payload,
      existingImage: product.image,
      existingImageR2: product.image_r2,
    })

    const assignableFields = [
      'name', 'price', 'description', 'image', 'image_r2', 'image_r2_variants',
      'images', 'images_r2', 'brand', 'category', 'countInStock', 'condition',
      'specifications',
    ]
    for (const field of assignableFields) {
      if (hasOwn(payload, field)) product[field] = payload[field]
    }
    if (hasOwn(payload, 'offer')) {
      const offerError = validateOffer(payload.offer, product.price)
      if (offerError) return res.status(400).json({ code: 'INVALID_OFFER', message: offerError })
      product.offer = payload.offer
    }
    // Assign the normalized primary pair AFTER payload merging so the
    // payload cannot desynchronize the image/image_r2 relationship.
    if (hasOwn(payload, 'image') || hasOwn(payload, 'image_r2')) {
      product.image = nextImage
      product.image_r2 = nextImageR2
    }

    const updatedProduct = await product.save()

    // Cleanup runs strictly after a successful DB save (safe direction) and
    // is reference-safe: only objects that vanished from the final product
    // state AND are referenced by no Product are deleted.
    let mediaCleanup = { deleted: [], failed: [], protected: [] }
    try {
      mediaCleanup = await mediaReference.cleanupReplacedMedia(oldProductSnapshot, updatedProduct.toObject())
    } catch (cleanupErr) {
      // Leave orphaned objects rather than failing a completed save.
      console.error('[ProductController] Reference-safe media cleanup failed:', cleanupErr.message)
    }

    await clearCache()
    return res.json({
      ...updatedProduct.toObject(),
      mediaCleanup: mediaCleanup.failed.length > 0 ? { warning: 'Product saved, but some old media could not be removed', failed: mediaCleanup.failed } : undefined,
    })
  } catch (error) {
    console.error('Update product error:', error)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ code: 'INVALID_PRODUCT', message: 'Invalid product data', fields: error.errors })
    }
    if (error.name === 'CastError') return res.status(400).json({ code: 'INVALID_PRODUCT_ID', message: 'Invalid product id' })
    return res.status(500).json({ code: 'PRODUCT_UPDATE_FAILED', message: 'Unable to update product' })
  }
}

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' })

    // Delete the document first so media cleanup cannot make a successful
    // product deletion look like a failed request.
    await Product.findByIdAndDelete(req.params.id)

    // Reference-safe media cleanup: deletes only objects whose full media set
    // is no longer referenced by ANY remaining Product document.
    let mediaCleanup
    try {
      mediaCleanup = await mediaReference.cleanupProductMedia(product.toObject())
    } catch (cleanupErr) {
      console.error('[ProductController] Reference-safe media cleanup failed:', cleanupErr.message)
      mediaCleanup = { deleted: [], failed: [], protected: [] }
    }
    await clearCache()

    return res.json({
      message: 'Product removed',
      mediaCleanup: mediaCleanup.failed.length > 0
        ? { warning: 'Product removed, but some media could not be deleted', failed: mediaCleanup.failed }
        : { deleted: mediaCleanup.deleted.length, failed: [] },
    })
  } catch (error) {
    console.error('Delete error:', error)
    if (error.name === 'CastError') return res.status(400).json({ code: 'INVALID_PRODUCT_ID', message: 'Invalid product id' })
    return res.status(500).json({ code: 'PRODUCT_DELETE_FAILED', message: 'Unable to delete product' })
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

// @desc    Clear product cache
// @route   POST /api/products/clear-cache
// @access  Private/Admin
const clearProductCache = async (req, res) => {
  try {
    // Clear all product-related cache
    await clearCache('cache:/api/products')
    await clearCache('cache:/api/products/category')
    res.json({ message: 'Product cache cleared successfully' })
  } catch (error) {
    console.error('Error clearing cache:', error)
    res.status(500).json({ message: 'Failed to clear cache' })
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
  clearProductCache,
}
