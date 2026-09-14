const mongoose = require('mongoose')
const Homepage = require('../models/homepageModel')
const Product = require('../models/productModel')
const { clearCache } = require('../middleware/cacheMiddleware')
const { resolveProductImages } = require('../utils/imageUtils')

const HOMEPAGE_KEY = 'default'
const HERO_IMAGE_DEFAULT = 'https://pub-5e82d594e79e436e9cfd3a07c9c7eb7d.r2.dev/homepage/hero/gamecity-hero-poster.webp'
const DEFAULT_HERO = {
  eyebrow: 'GameCity Electronics',
  title: 'Build Your Ultimate Dream Machine',
  highlightText: 'Dream Machine',
  description: 'Discover premium computer components, cutting-edge peripherals, and expert-curated builds for a setup made to perform.',
  primaryCtaLabel: 'Shop Now',
  primaryCtaHref: '/category/all',
  secondaryCtaLabel: 'Build Your PC',
  secondaryCtaHref: '/build-pc',
  imageUrl: HERO_IMAGE_DEFAULT,
  imageAlt: 'Premium GameCity gaming PC components and electronics',
  enabled: true,
}

class HomepageValidationError extends Error {
  constructor(message, code = 'HOMEPAGE_VALIDATION_FAILED') {
    super(message)
    this.name = 'HomepageValidationError'
    this.status = 400
    this.code = code
  }
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function isSafeHref(value, { required = false } = {}) {
  if (!value) return !required
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function validateHeroPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new HomepageValidationError('Hero payload must be an object')
  const hero = {}
  const fields = [
    ['eyebrow', 80], ['title', 120], ['highlightText', 80], ['description', 500],
    ['primaryCtaLabel', 80], ['secondaryCtaLabel', 80], ['imageAlt', 200],
  ]
  for (const [field, max] of fields) {
    if (payload[field] !== undefined) {
      hero[field] = asString(payload[field])
      if (hero[field].length > max) throw new HomepageValidationError(`${field} is too long`)
    }
  }
  for (const field of ['primaryCtaHref', 'secondaryCtaHref']) {
    if (payload[field] !== undefined) {
      hero[field] = asString(payload[field])
      if (!isSafeHref(hero[field], { required: true }) || hero[field].length > 500) {
        throw new HomepageValidationError(`${field} must be a local path or an http(s) URL`)
      }
    }
  }
  if (payload.imageUrl !== undefined) {
    hero.imageUrl = asString(payload.imageUrl)
    if (!isSafeHref(hero.imageUrl, { required: true }) || hero.imageUrl.length > 1000) {
      throw new HomepageValidationError('imageUrl must be a local path or an http(s) URL')
    }
  }
  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== 'boolean') throw new HomepageValidationError('enabled must be a boolean')
    hero.enabled = payload.enabled
  }
  if (hero.title !== undefined && !hero.title) throw new HomepageValidationError('title is required')
  if (hero.description !== undefined && !hero.description) throw new HomepageValidationError('description is required')
  return hero
}

function validateSectionPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new HomepageValidationError('Section payload must be an object')
  const section = {}
  const title = asString(payload.title)
  if (!title || title.length > 100) throw new HomepageValidationError('Section title is required and must be 100 characters or fewer', 'INVALID_SECTION_TITLE')
  section.title = title
  section.subtitle = asString(payload.subtitle)
  if (section.subtitle.length > 240) throw new HomepageValidationError('Section subtitle is too long')
  section.type = payload.type || 'MANUAL_PRODUCTS'
  if (section.type !== 'MANUAL_PRODUCTS') throw new HomepageValidationError('Only MANUAL_PRODUCTS sections are currently supported', 'INVALID_SECTION_TYPE')
  section.enabled = payload.enabled === undefined ? true : payload.enabled
  if (typeof section.enabled !== 'boolean') throw new HomepageValidationError('enabled must be a boolean')
  section.layout = payload.layout === undefined ? 'grid' : payload.layout
  if (!['grid', 'carousel'].includes(section.layout)) throw new HomepageValidationError('layout must be grid or carousel', 'INVALID_SECTION_LAYOUT')
  section.viewAllLabel = asString(payload.viewAllLabel)
  section.viewAllHref = asString(payload.viewAllHref)
  if (section.viewAllLabel.length > 50 || section.viewAllHref.length > 500) throw new HomepageValidationError('Section CTA values are too long')
  if (section.viewAllHref && !isSafeHref(section.viewAllHref)) throw new HomepageValidationError('viewAllHref must be a local path or an http(s) URL')
  return section
}

function validateObjectId(value, field = 'product ID') {
  if (!mongoose.isValidObjectId(value)) throw new HomepageValidationError(`Invalid ${field}`, 'INVALID_PRODUCT_ID')
  return String(value)
}

function validateUniqueProductIds(productIds) {
  if (!Array.isArray(productIds)) throw new HomepageValidationError('productIds must be an array', 'INVALID_PRODUCT_IDS')
  const ids = productIds.map((id) => validateObjectId(id))
  if (new Set(ids).size !== ids.length) throw new HomepageValidationError('A product can only be selected once in a section', 'DUPLICATE_PRODUCT_REFERENCE')
  return ids
}

function productIdsFromPayload(payload) {
  return payload && Object.prototype.hasOwnProperty.call(payload, 'productIds') ? payload.productIds : []
}

async function assertProductsExist(ids) {
  if (!ids.length) return
  const products = await Product.find({ _id: { $in: ids } }).select('_id').lean()
  const found = new Set(products.map((product) => String(product._id)))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length) throw new HomepageValidationError('One or more selected products do not exist', 'UNKNOWN_PRODUCT_ID')
}

async function getHomepageDocument({ create = false } = {}) {
  if (!create) return Homepage.findOne({ key: HOMEPAGE_KEY })
  return Homepage.findOneAndUpdate(
    { key: HOMEPAGE_KEY },
    { $setOnInsert: { key: HOMEPAGE_KEY, hero: DEFAULT_HERO, sections: [] } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
}

function normalizeHero(hero) {
  return { ...DEFAULT_HERO, ...(hero || {}) }
}

function productResponse(product) {
  if (!product) return null
  const resolved = resolveProductImages(product)
  return { ...resolved, id: String(resolved._id || resolved.id) }
}

function isPopulatedProduct(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && !value._bsontype
      && ('name' in value || 'price' in value),
  )
}

function sectionResponse(section, { includeMissing = false } = {}) {
  const products = (section.products || [])
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((reference) => {
      const product = isPopulatedProduct(reference.product) ? productResponse(reference.product) : null
      if (!product && !includeMissing) return null
      return {
        product,
        productId: String(reference.product?._id || reference.product || ''),
        sortOrder: reference.sortOrder,
        missing: !product,
      }
    })
    .filter(Boolean)
  return {
    id: String(section._id),
    title: section.title,
    subtitle: section.subtitle || '',
    type: section.type,
    enabled: section.enabled,
    sortOrder: section.sortOrder,
    layout: section.layout || 'grid',
    viewAllLabel: section.viewAllLabel || '',
    viewAllHref: section.viewAllHref || '',
    products,
  }
}

function adminResponse(homepage) {
  const sections = (homepage?.sections || []).slice().sort((left, right) => left.sortOrder - right.sortOrder)
  return {
    configured: Boolean(homepage),
    hero: normalizeHero(homepage?.hero),
    sections: sections.map((section) => sectionResponse(section, { includeMissing: true })),
  }
}

function publicResponse(homepage) {
  if (!homepage) return { configured: false, hero: normalizeHero(DEFAULT_HERO), sections: [] }
  const sections = (homepage.sections || [])
    .filter((section) => section.enabled)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((section) => sectionResponse(section))
  return {
    configured: true,
    hero: homepage.hero?.enabled === false ? null : normalizeHero(homepage.hero),
    sections,
  }
}

async function populateHomepage(homepage) {
  if (!homepage) return homepage
  return homepage.populate({
    path: 'sections.products.product',
    select: 'name image image_r2 image_r2_variants images images_r2 description brand category price countInStock condition rating numReviews offer createdAt updatedAt',
  })
}

async function getPublicHomepage(req, res, next) {
  try {
    const homepage = await populateHomepage(await getHomepageDocument())
    return res.json(publicResponse(homepage))
  } catch (error) {
    return next(error)
  }
}

async function getAdminHomepage(req, res, next) {
  try {
    const homepage = await populateHomepage(await getHomepageDocument())
    return res.json(adminResponse(homepage))
  } catch (error) {
    return next(error)
  }
}

async function updateHero(req, res, next) {
  try {
    const hero = validateHeroPayload(req.body)
    const homepage = await getHomepageDocument({ create: true })
    homepage.hero = { ...normalizeHero(homepage.hero), ...hero }
    await homepage.save()
    await clearCache('cache:/api/public/homepage')
    return res.json(adminResponse(await populateHomepage(homepage)))
  } catch (error) {
    return next(error)
  }
}

async function createSection(req, res, next) {
  try {
    const section = validateSectionPayload(req.body)
    const productIds = validateUniqueProductIds(productIdsFromPayload(req.body))
    await assertProductsExist(productIds)
    const homepage = await getHomepageDocument({ create: true })
    const sortOrder = homepage.sections.length
    homepage.sections.push({ ...section, sortOrder, products: productIds.map((product, index) => ({ product, sortOrder: index })) })
    await homepage.save()
    await clearCache('cache:/api/public/homepage')
    return res.status(201).json(adminResponse(await populateHomepage(homepage)))
  } catch (error) {
    return next(error)
  }
}

function findSection(homepage, id) {
  if (!mongoose.isValidObjectId(id)) throw new HomepageValidationError('Invalid section ID', 'INVALID_SECTION_ID')
  const section = homepage.sections.id(id)
  if (!section) {
    const error = new Error('Homepage section not found')
    error.status = 404
    error.code = 'SECTION_NOT_FOUND'
    throw error
  }
  return section
}

async function updateSection(req, res, next) {
  try {
    const homepage = await getHomepageDocument({ create: true })
    const section = findSection(homepage, req.params.id)
    const sectionPatch = validateSectionPayload({
      title: req.body?.title ?? section.title,
      subtitle: req.body?.subtitle ?? section.subtitle,
      type: req.body?.type ?? section.type,
      enabled: req.body?.enabled ?? section.enabled,
      layout: req.body?.layout ?? section.layout,
      viewAllLabel: req.body?.viewAllLabel ?? section.viewAllLabel,
      viewAllHref: req.body?.viewAllHref ?? section.viewAllHref,
    })
    Object.assign(section, sectionPatch)
    await homepage.save()
    await clearCache('cache:/api/public/homepage')
    return res.json(adminResponse(await populateHomepage(homepage)))
  } catch (error) {
    return next(error)
  }
}

async function deleteSection(req, res, next) {
  try {
    const homepage = await getHomepageDocument({ create: true })
    findSection(homepage, req.params.id)
    homepage.sections = homepage.sections.filter((section) => String(section._id) !== String(req.params.id))
    homepage.sections.forEach((section, index) => { section.sortOrder = index })
    await homepage.save()
    await clearCache('cache:/api/public/homepage')
    return res.json(adminResponse(await populateHomepage(homepage)))
  } catch (error) {
    return next(error)
  }
}

async function reorderSections(req, res, next) {
  try {
    if (!Array.isArray(req.body?.sectionIds)) throw new HomepageValidationError('sectionIds must be an array', 'INVALID_SECTION_ORDER')
    const homepage = await getHomepageDocument({ create: true })
    const existingIds = homepage.sections.map((section) => String(section._id))
    const ids = req.body.sectionIds.map((id) => String(id))
    if (ids.length !== existingIds.length || new Set(ids).size !== ids.length || ids.some((id) => !existingIds.includes(id))) {
      throw new HomepageValidationError('sectionIds must contain every homepage section exactly once', 'INVALID_SECTION_ORDER')
    }
    ids.forEach((id, index) => { homepage.sections.id(id).sortOrder = index })
    await homepage.save()
    await clearCache('cache:/api/public/homepage')
    return res.json(adminResponse(await populateHomepage(homepage)))
  } catch (error) {
    return next(error)
  }
}

async function updateSectionProducts(req, res, next) {
  try {
    const productIds = validateUniqueProductIds(productIdsFromPayload(req.body))
    await assertProductsExist(productIds)
    const homepage = await getHomepageDocument({ create: true })
    const section = findSection(homepage, req.params.id)
    section.products = productIds.map((product, index) => ({ product, sortOrder: index }))
    await homepage.save()
    await clearCache('cache:/api/public/homepage')
    return res.json(adminResponse(await populateHomepage(homepage)))
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  DEFAULT_HERO,
  HomepageValidationError,
  validateHeroPayload,
  validateSectionPayload,
  validateUniqueProductIds,
  publicResponse,
  adminResponse,
  sectionResponse,
  getPublicHomepage,
  getAdminHomepage,
  updateHero,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  updateSectionProducts,
}
