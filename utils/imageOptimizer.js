const sharp = require('sharp')

/**
 * Image optimization presets using Sharp.
 * Generates WebP variants for R2 uploads.
 */

const PRESETS = {
  thumbnail: { width: 300, height: 300, fit: 'cover' },
  medium: { width: 800, height: 800, fit: 'inside' },
  large: { width: 1600, height: 1600, fit: 'inside' },
}

/**
 * Optimize an image buffer into multiple size variants.
 * @param {Buffer} inputBuffer – raw image buffer
 * @param {string} originalName – original filename (used for logging)
 * @returns {Promise<{original: Buffer, thumbnail: Buffer, medium: Buffer, large: Buffer}>}
 */
async function optimizeImage(inputBuffer, originalName = 'unknown') {
  const results = {}

  // Original: convert to WebP, compress, preserve aspect ratio, never upscale
  results.original = await sharp(inputBuffer)
    .webp({ quality: 85, effort: 6 })
    .withMetadata()
    .toBuffer()

  // Generate size variants
  for (const [preset, options] of Object.entries(PRESETS)) {
    try {
      results[preset] = await sharp(inputBuffer)
        .resize({
          width: options.width,
          height: options.height,
          fit: options.fit,
          withoutEnlargement: true, // Never upscale
        })
        .webp({ quality: 80, effort: 6 })
        .toBuffer()
    } catch (err) {
      console.error(
        `[ImageOptimizer] Failed to generate ${preset} variant for ${originalName}:`,
        err.message
      )
      // Fall back to original for this variant
      results[preset] = results.original
    }
  }

  return results
}

/**
 * Get the metadata of an image buffer.
 * @param {Buffer} buffer
 * @returns {Promise<sharp.Metadata>}
 */
async function getImageMetadata(buffer) {
  return sharp(buffer).metadata()
}

module.exports = {
  optimizeImage,
  getImageMetadata,
  PRESETS,
}
