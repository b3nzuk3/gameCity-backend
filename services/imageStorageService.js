/**
 * ImageStorage Service
 * Unified interface for image upload/delete/URL resolution.
 * Currently supports: Cloudflare R2 (primary), Cloudinary (legacy/read-only).
 *
 * New uploads always go to R2.
 * Cloudinary is kept for reading existing images during migration.
 */

const r2Service = require('./r2Service')
const { optimizeImage } = require('../utils/imageOptimizer')

const FOLDER = 'greenbits-store'

/**
 * Upload an image buffer to Cloudflare R2 with Sharp optimization.
 * Generates thumbnail, medium, and large variants in WebP.
 *
 * @param {Buffer} buffer – raw image buffer
 * @param {string} originalName – original filename
 * @returns {Promise<{url: string, key: string, variants: {thumbnail: string, medium: string, large: string}}>}
 */
async function upload(buffer, originalName) {
  // Optimize the image into variants
  const variants = await optimizeImage(buffer, originalName)

  // Upload main (optimized) image
  const mainKey = r2Service.generateKey(originalName, FOLDER)
  const mainResult = await r2Service.uploadToR2(
    variants.original,
    mainKey,
    'image/webp'
  )

  // Upload size variants
  const variantUrls = {}
  const ext = '.webp'
  for (const [preset, variantBuffer] of Object.entries(variants)) {
    if (preset === 'original') continue
    const variantKey = mainKey.replace(ext, `-${preset}${ext}`)
    const result = await r2Service.uploadToR2(
      variantBuffer,
      variantKey,
      'image/webp'
    )
    variantUrls[preset] = result.url
  }

  return {
    url: mainResult.url,
    key: mainKey,
    variants: variantUrls,
  }
}

/**
 * Delete an image and its variants from R2.
 * @param {string} key – the R2 object key
 */
async function deleteFile(key) {
  if (!key) return

  const ext = '.webp'
  // Delete variants
  for (const preset of ['thumbnail', 'medium', 'large']) {
    const variantKey = key.replace(ext, `-${preset}${ext}`)
    try {
      await r2Service.deleteFromR2(variantKey)
    } catch (err) {
      console.error(`[ImageStorage] Failed to delete variant ${variantKey}:`, err.message)
    }
  }

  // Delete main
  try {
    await r2Service.deleteFromR2(key)
  } catch (err) {
    console.error(`[ImageStorage] Failed to delete main ${key}:`, err.message)
  }
}

/**
 * Get the public URL for an R2 key.
 * @param {string} key
 * @returns {string}
 */
function getPublicUrl(key) {
  return r2Service.getPublicUrl(key)
}

/**
 * Extract the R2 key from a full URL.
 * @param {string} url – full R2 public URL
 * @returns {string|null} – the key portion, or null if not an R2 URL
 */
function extractKey(url) {
  if (!url) return null
  const publicUrl = process.env.R2_PUBLIC_URL
  if (!publicUrl) return null
  if (!url.startsWith(publicUrl)) return null
  return url.replace(`${publicUrl}/`, '')
}

module.exports = {
  upload,
  deleteFile,
  getPublicUrl,
  extractKey,
}
