/**
 * Image URL resolution utilities.
 * Handles the dual-provider strategy:
 *   - Prefer image_r2 if present
 *   - Fallback to image (Cloudinary)
 *
 * The frontend always sees a single `image` field.
 */

/**
 * Resolve the best image URL for a product.
 * If the product has an R2 URL, use it. Otherwise fall back to the original.
 * @param {Object} product – Mongoose product document or plain object
 * @returns {string|null} – resolved image URL
 */
function resolveMainImage(product) {
  if (!product) return null
  return product.image_r2 || product.image || null
}

/**
 * Resolve the best URL for each image in an array.
 * @param {Object} product
 * @returns {string[]} – array of resolved image URLs
 */
function resolveAllImages(product) {
  if (!product) return []
  // If there's an R2 main image, prefer R2 gallery too
  const hasR2Main = !!product.image_r2

  const r2Images = product.images_r2 || []
  const legacyImages = product.images || []

  // Merge: R2 versions first, then any legacy ones not already covered
  const resolved = []

  // Main image
  const main = resolveMainImage(product)
  if (main) resolved.push(main)

  // Gallery images
  if (hasR2Main && r2Images.length > 0) {
    resolved.push(...r2Images)
  } else {
    resolved.push(...legacyImages)
  }

  return resolved.filter(Boolean)
}

/**
 * Apply image resolution to a product object (non-mutating).
 * Returns a new object with `image` and `images` resolved.
 * @param {Object} product
 * @returns {Object} – product with resolved image fields
 */
function resolveProductImages(product) {
  if (!product) return product

  // Convert to plain object if it's a Mongoose doc
  const obj = product.toObject ? product.toObject() : { ...product }

  obj.image = resolveMainImage(product)
  obj.images = resolveAllImages(product)

  // Keep the raw fields for admin/migration purposes
  // obj.image_r2 and obj.image remain accessible

  return obj
}

/**
 * Apply image resolution to an array of products.
 * @param {Object[]} products
 * @returns {Object[]}
 */
function resolveProductImagesBulk(products) {
  return products.map(resolveProductImages)
}

/**
 * Resolve the best image URL for a given size context.
 * @param {Object} product
 * @param {string} size - 'thumbnail' | 'medium' | 'large' | 'original'
 * @returns {string|null}
 */
function resolveImageUrl(product, size = 'original') {
  if (!product) return null

  const hasR2 = !!product.image_r2
  const variants = product.image_r2_variants || {}

  // If R2 is available, use variants
  if (hasR2) {
    if (size !== 'original' && variants[size]) {
      return variants[size]
    }
    return product.image_r2
  }

  // Fallback to Cloudinary (no variants available)
  return product.image || null
}

module.exports = {
  resolveMainImage,
  resolveAllImages,
  resolveProductImages,
  resolveProductImagesBulk,
  resolveImageUrl,
}
