const mongoose = require('mongoose')

const heroSchema = new mongoose.Schema(
  {
    eyebrow: { type: String, trim: true, maxlength: 80, default: 'GameCity Electronics' },
    title: { type: String, trim: true, maxlength: 120, default: 'Build Your Ultimate Dream Machine' },
    highlightText: { type: String, trim: true, maxlength: 80, default: 'Dream Machine' },
    description: { type: String, trim: true, maxlength: 500, default: 'Discover premium computer components, cutting-edge peripherals, and expert-curated builds for a setup made to perform.' },
    primaryCtaLabel: { type: String, trim: true, maxlength: 80, default: 'Shop Now' },
    primaryCtaHref: { type: String, trim: true, maxlength: 500, default: '/category/all' },
    secondaryCtaLabel: { type: String, trim: true, maxlength: 80, default: 'Build Your PC' },
    secondaryCtaHref: { type: String, trim: true, maxlength: 500, default: '/build-pc' },
    imageUrl: { type: String, trim: true, maxlength: 1000, default: 'https://pub-5e82d594e79e436e9cfd3a07c9c7eb7d.r2.dev/homepage/hero/gamecity-hero-poster.webp' },
    imageAlt: { type: String, trim: true, maxlength: 200, default: 'Premium GameCity gaming PC components and electronics' },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
)

const productReferenceSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sortOrder: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'sortOrder must be an integer' },
    },
  },
  { _id: false },
)

const sectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    subtitle: { type: String, trim: true, maxlength: 240, default: '' },
    type: { type: String, enum: ['MANUAL_PRODUCTS'], default: 'MANUAL_PRODUCTS' },
    enabled: { type: Boolean, default: true },
    layout: { type: String, enum: ['grid', 'carousel'], default: 'grid' },
    sortOrder: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'sortOrder must be an integer' },
    },
    viewAllLabel: { type: String, trim: true, maxlength: 50, default: '' },
    viewAllHref: { type: String, trim: true, maxlength: 500, default: '' },
    products: { type: [productReferenceSchema], default: [] },
  },
  { _id: true },
)

const homepageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    hero: { type: heroSchema, default: () => ({}) },
    sections: { type: [sectionSchema], default: [] },
  },
  { timestamps: true },
)

module.exports = mongoose.model('Homepage', homepageSchema)
