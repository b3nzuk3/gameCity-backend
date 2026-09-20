/**
 * Media Reference Service
 *
 * Single source of truth for deciding whether an R2 media object may be
 * physically deleted. Every destructive R2 path in the backend must go
 * through collectDeletionCandidates() before touching storage.
 *
 * R2 and MongoDB are separate systems with no distributed transaction, so
 * the rule is deliberately conservative: if ANY Product document still
 * references the object (through any of its image fields), the object is
 * kept. Orphaned storage is always preferable to a broken product image.
 */

const Product = require('../models/productModel')
const imageStorage = require('./imageStorageService')

// URL fields on a Product that can reference R2 media. image_r2_variants is
// handled separately because it is an object of { preset: url }.
const REFERENCE_FIELDS = ['image', 'image_r2', 'images', 'images_r2']

/**
 * Collect every R2 object key referenced by a product-like object across all
 * media fields (image, image_r2, images, images_r2, image_r2_variants).
 * Accepts a Mongoose document or a plain object.
 * @returns {Set<string>} R2 object keys (e.g. "greenbits-store/xxx.webp")
 */
function collectReferencedKeys(product) {
  const keys = new Set()
  if (!product) return keys

  for (const field of REFERENCE_FIELDS) {
    const value = product[field]
    if (typeof value === 'string' && value) {
      const key = imageStorage.extractKey(value)
      if (key) keys.add(key)
    } else if (Array.isArray(value)) {
      for (const url of value) {
        if (typeof url === 'string' && url) {
          const key = imageStorage.extractKey(url)
          if (key) keys.add(key)
        }
      }
    }
  }

  const variants = product.image_r2_variants
  if (variants && typeof variants === 'object') {
    for (const url of Object.values(variants)) {
      if (typeof url === 'string' && url) {
        const key = imageStorage.extractKey(url)
        if (key) keys.add(key)
      }
    }
  }

  return keys
}

/**
 * Build the complete set of R2 keys referenced by the FINAL state of a
 * product (the merged document, after the update has been applied and
 * saved). This is the "final product state" reference set used to decide
 * whether an old object may be deleted.
 */
function collectFinalStateKeys(product) {
  return collectReferencedKeys(product)
}

/**
 * Check whether any Product document in the database (excluding an optional
 * set of product ids, e.g. the product being replaced) still references any
 * of the given R2 keys.
 *
 * Reference fields scanned: image, image_r2, images, images_r2 and every URL
 * inside image_r2_variants.
 *
 * @param {string[]} keys – R2 object keys
 * @param {{ excludeProductId?: string }} [options]
 * @returns {Promise<Map<string, string>>} key -> referencing product id
 */
async function findGlobalReferences(keys, { excludeProductId } = {}) {
  const map = new Map()
  if (!keys || keys.length === 0) return map

  const orClauses = []
  for (const key of keys) {
    // Match the exact key URL (public URL form) in string/array fields.
    orClauses.push({ image: { $regex: escapeRegex(key) } })
    orClauses.push({ image_r2: { $regex: escapeRegex(key) } })
    orClauses.push({ images: { $regex: escapeRegex(key) } })
    orClauses.push({ images_r2: { $regex: escapeRegex(key) } })
    orClauses.push({ 'image_r2_variants.thumbnail': { $regex: escapeRegex(key) } })
    orClauses.push({ 'image_r2_variants.medium': { $regex: escapeRegex(key) } })
    orClauses.push({ 'image_r2_variants.large': { $regex: escapeRegex(key) } })
  }

  const query = { $or: orClauses }
  if (excludeProductId) query._id = { $ne: safeObjectId(excludeProductId) }

  // Only the key fields are needed; lean keeps this cheap.
  const products = await Product.find(query)
    .select('_id image image_r2 images images_r2 image_r2_variants')
    .lean()

  const wanted = new Set(keys)
  for (const product of products) {
    const referenced = collectReferencedKeys(product)
    for (const key of referenced) {
      if (wanted.has(key) && !map.has(key)) map.set(key, product._id.toString())
    }
  }
  return map
}

/**
 * Decide which of the requested keys are genuinely unreferenced and may be
 * physically deleted from R2.
 *
 * Two gates, per the fix spec:
 *   1. Final-state gate: keep any key still referenced by the final product.
 *   2. Global gate: keep any key still referenced by ANY other Product.
 *
 * @param {string[]} keys – candidate R2 keys (already extracted from URLs)
 * @param {{ finalProduct?: object|null, excludeProductId?: string }} [options]
 * @returns {Promise<{ deletable: string[], protected: Array<{key: string, reason: string, product?: string}> }>}
 */
async function collectDeletionCandidates(keys, { finalProduct = null, excludeProductId } = {}) {
  const candidates = [...new Set((keys || []).filter(Boolean))]
  if (candidates.length === 0) return { deletable: [], protected: [] }

  const finalKeys = finalProduct ? collectFinalStateKeys(finalProduct) : new Set()
  const globalRefs = await findGlobalReferences(candidates, { excludeProductId })

  const deletable = []
  const protectedList = []

  for (const key of candidates) {
    if (finalKeys.has(key)) {
      protectedList.push({ key, reason: 'referenced by final product state' })
      continue
    }
    const refProduct = globalRefs.get(key)
    if (refProduct) {
      protectedList.push({ key, reason: 'referenced by another product', product: refProduct })
      continue
    }
    deletable.push(key)
  }

  return { deletable, protected: protectedList }
}

const PRESETS = ['thumbnail', 'medium', 'large']

/**
 * Expand a base media key to its full media set (base + thumbnail/medium/
 * large variant keys) using the same suffix rules as the upload pipeline.
 * Kept in one place so key derivation can never drift between upload and
 * cleanup.
 */
function expandToMediaSet(keys) {
  return [...new Set((keys || []).filter(Boolean).flatMap((key) => [
    ...PRESETS.map((preset) => key.replace(/\.webp$/i, `-${preset}.webp`)),
    key,
  ]))]
}


/**
 * Extract the base object key from a variant key
 * ("x-thumbnail.webp" -> "x.webp"), or return null if the key is not a
 * known variant. Mirrors the upload pipeline's suffix rules.
 */
function variantBaseKey(key) {
  const match = key.match(/-(thumbnail|medium|large)\.webp$/i)
  return match ? key.replace(new RegExp(`-${match[1]}\\.webp$`, 'i'), '.webp') : null
}

/**
 * Split a flat key set into base keys (whose variants must be checked as a
 * set) and standalone keys that are themselves variants of another base.
 */
function toBaseKeys(keys) {
  const base = new Set()
  for (const key of keys) {
    const parent = variantBaseKey(key)
    base.add(parent || key)
  }
  return [...base]
}

/**
 * Reference-safe deletion for a saved (updated) product: computes the
 * difference between the previous and final media sets, then deletes only
 * the keys whose entire media set (base + all variants) disappeared from
 * every field AND is referenced by no other Product. Preserves the
 * historical base+variants-together behavior without partial variant
 * deletion.
 */
async function cleanupReplacedMedia(oldProduct, finalProduct) {
  const oldKeys = toBaseKeys([...collectReferencedKeys(oldProduct)])
  const finalKeys = collectFinalStateKeys(finalProduct)

  // A base key was truly removed only when neither it NOR any of its variant
  // keys appears in the final state.
  const removedBaseKeys = [...oldKeys].filter((key) => {
    if (finalKeys.has(key)) return false
    const mediaSet = expandToMediaSet([key])
    return !mediaSet.some((k) => finalKeys.has(k))
  })
  if (removedBaseKeys.length === 0) return { deleted: [], failed: [], protected: [] }

  const { deletable, protected: protectedList } = await collectDeletionCandidates(
    expandToMediaSet(removedBaseKeys),
    { finalProduct, excludeProductId: finalProduct && finalProduct._id ? String(finalProduct._id) : undefined }
  )

  // Only destroy a base key when its FULL media set survived both reference
  // gates — partial variant deletion would leave a broken media set.
  const deletableSet = new Set(deletable)
  const fullSets = removedBaseKeys.filter((baseKey) =>
    expandToMediaSet([baseKey]).every((key) => deletableSet.has(key))
  )
  const exactKeys = expandToMediaSet(fullSets)

  let deleted = []
  let failed = []
  if (exactKeys.length > 0) {
    const result = await imageStorage.deleteExactKeys(exactKeys)
    deleted = result.deleted
    failed = result.failed
  }
  return {
    deleted,
    failed,
    protected: protectedList.filter((entry) => !deletableSet.has(entry.key)),
  }
}

/**
 * Reference-safe deletion for product removal: deletes the product's media
 * only where no OTHER product still references it. The product's own document
 * has already been (or is about to be) removed, so its references no longer
 * count — pass its id via excludeProductId when checking the database.
 */
async function cleanupProductMedia(product) {
  const baseKeys = toBaseKeys([...collectReferencedKeys(product)])
  if (baseKeys.length === 0) return { deleted: [], failed: [], protected: [] }

  const { deletable, protected: protectedList } = await collectDeletionCandidates(
    expandToMediaSet(baseKeys),
    { excludeProductId: product && product._id ? String(product._id) : undefined }
  )

  const deletableSet = new Set(deletable)
  const fullSets = baseKeys.filter((baseKey) =>
    expandToMediaSet([baseKey]).every((key) => deletableSet.has(key))
  )
  const exactKeys = expandToMediaSet(fullSets)

  let deleted = []
  let failed = []
  if (exactKeys.length > 0) {
    const result = await imageStorage.deleteExactKeys(exactKeys)
    deleted = result.deleted
    failed = result.failed
  }
  return {
    deleted,
    failed,
    protected: protectedList.filter((entry) => !deletableSet.has(entry.key)),
  }
}

/**
 * Reference-safe deletion used by /api/upload/delete. Verifies each key is
 * not referenced by ANY Product before deletion, protecting against the
 * lost-response race (save succeeded server-side, client believes it failed
 * and asks to roll back the just-uploaded media).
 */
async function cleanupUnreferencedMedia(keys) {
  const baseKeys = toBaseKeys((keys || []).filter(Boolean))
  if (baseKeys.length === 0) return { deleted: [], failed: [], protected: [] }

  const { deletable, protected: protectedList } = await collectDeletionCandidates(
    expandToMediaSet(baseKeys)
  )

  const deletableSet = new Set(deletable)
  const fullSets = baseKeys.filter((baseKey) =>
    expandToMediaSet([baseKey]).every((key) => deletableSet.has(key))
  )
  const exactKeys = expandToMediaSet(fullSets)

  let deleted = []
  let failed = []
  if (exactKeys.length > 0) {
    const result = await imageStorage.deleteExactKeys(exactKeys)
    deleted = result.deleted
    failed = result.failed
  }
  return {
    deleted,
    failed,
    protected: protectedList.filter((entry) => !deletableSet.has(entry.key)),
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * True when the URL points at this store's configured R2 public bucket.
 */
function isR2Url(url) {
  return Boolean(imageStorage.extractKey(url))
}

function safeObjectId(id) {
  try {
    const { Types } = require('mongoose')
    return Types.ObjectId.createFromHexString(id)
  } catch {
    return id
  }
}

module.exports = {
  collectReferencedKeys,
  collectFinalStateKeys,
  findGlobalReferences,
  collectDeletionCandidates,
  expandToMediaSet,
  toBaseKeys,
  variantBaseKey,
  cleanupReplacedMedia,
  cleanupProductMedia,
  cleanupUnreferencedMedia,
  isR2Url,
}
