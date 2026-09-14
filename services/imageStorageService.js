/**
 * ImageStorage Service
 * Unified interface for image upload/delete/URL resolution.
 * New uploads use Cloudflare R2 and are optimized to WebP.
 */

const r2Service = require('./r2Service')
const { optimizeImage } = require('../utils/imageOptimizer')

const FOLDER = 'greenbits-store'
const PRESETS = ['thumbnail', 'medium', 'large']

async function upload(buffer, originalName) {
  const variants = await optimizeImage(buffer, originalName)
  const mainKey = r2Service.generateKey(originalName, FOLDER)
  const uploadedKeys = []

  try {
    const mainResult = await r2Service.uploadToR2(variants.original, mainKey, 'image/webp')
    uploadedKeys.push(mainKey)
    const variantUrls = {}
    for (const preset of PRESETS) {
      const variantKey = mainKey.replace(/\.webp$/i, `-${preset}.webp`)
      const result = await r2Service.uploadToR2(variants[preset], variantKey, 'image/webp')
      uploadedKeys.push(variantKey)
      variantUrls[preset] = result.url
    }
    return { url: mainResult.url, key: mainKey, variants: variantUrls }
  } catch (error) {
    // Do not leave orphaned R2 objects when one variant fails.
    await deleteFile(uploadedKeys)
    throw error
  }
}

async function deleteFile(keys) {
  const values = Array.isArray(keys) ? keys : [keys]
  const deleted = []
  const failed = []
  for (const key of values) {
    if (!key) continue
    const objectKeys = [
      ...PRESETS.map((preset) => key.replace(/\.webp$/i, `-${preset}.webp`)),
      key,
    ]
    for (const objectKey of objectKeys) {
      try {
        await r2Service.deleteFromR2(objectKey)
        deleted.push(objectKey)
      } catch (err) {
        console.error(`[ImageStorage] Failed to delete ${objectKey}:`, err.message)
        failed.push({ key: objectKey, error: err.message })
      }
    }
  }
  return { deleted, failed }
}

function getPublicUrl(key) {
  return r2Service.getPublicUrl(key)
}

function extractKey(url) {
  if (!url) return null
  const publicUrl = process.env.R2_PUBLIC_URL
  if (!publicUrl || !url.startsWith(`${publicUrl}/`)) return null
  return url.replace(`${publicUrl}/`, '')
}

module.exports = { upload, deleteFile, getPublicUrl, extractKey }
