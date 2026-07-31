const mongoose = require('mongoose')

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    name: { type: String, required: true },
    rating: { type: Number, required: true },
    comment: { type: String, required: true },
  },
  {
    timestamps: true,
  }
)

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // Original Cloudinary URL (kept for fallback during migration)
    image: { type: String, required: true },
    // Cloudflare R2 URL (set during migration or for new uploads)
    image_r2: { type: String, default: null },
    // Original gallery images (Cloudinary URLs)
    images: [{ type: String }],
    // R2 gallery images
    images_r2: [{ type: String }],
    description: { type: String, required: true },
    brand: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true, default: 0 },
    countInStock: { type: Number, required: true, default: 0 },
    condition: {
      type: String,
      enum: ['New', 'Pre-Owned'],
      default: 'New',
    },
    rating: { type: Number, required: true, default: 0 },
    numReviews: { type: Number, required: true, default: 0 },
    reviews: [reviewSchema],
    specifications: { type: mongoose.Schema.Types.Mixed, default: {} },
    offer: {
      enabled: { type: Boolean, default: false },
      type: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage',
      },
      amount: { type: Number, default: 0 },
      startDate: { type: Date },
      endDate: { type: Date },
    },
  },
  {
    timestamps: true,
  }
)

// Add index for migration script queries
productSchema.index({ image_r2: 1 })

const Product = mongoose.model('Product', productSchema)

module.exports = Product
