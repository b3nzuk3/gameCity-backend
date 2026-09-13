const express = require('express')
const multer = require('multer')
const imageStorage = require('../services/imageStorageService')
const { protect, admin } = require('../middleware/authMiddleware')
const { isOwnedMediaKey } = require('../utils/mediaKeyValidation')

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false)
    }
    cb(null, true)
  },
}).array('images', 10)

/**
 * Upload images. This route intentionally sits behind both bearer auth and
 * admin authorization; the storefront must not be able to write media.
 */
router.post('/', protect, admin, (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err)
      return res.status(400).json({ code: 'INVALID_UPLOAD', error: err.message })
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ code: 'NO_FILES', error: 'No files uploaded' })
    }

    try {
      const uploadResults = []
      for (const file of req.files) {
        try {
          const result = await imageStorage.upload(file.buffer, file.originalname)
          uploadResults.push({ url: result.url, key: result.key, variants: result.variants })
        } catch (uploadErr) {
          console.error(`[Upload] Failed to upload ${file.originalname}:`, uploadErr.message)
          uploadResults.push({ url: null, key: null, error: 'Image upload failed' })
        }
      }

      const urls = uploadResults.filter((result) => result.url).map((result) => result.url)
      const variants = uploadResults
        .filter((result) => result.url && result.variants)
        .map((result) => result.variants)
      const failures = uploadResults.filter((result) => !result.url)

      return res.json({
        urls,
        variants: variants.length > 0 ? variants : undefined,
        uploaded: urls.length,
        failed: failures.length,
        failures: failures.length > 0 ? failures.map((failure) => failure.error) : undefined,
      })
    } catch (error) {
      console.error('Upload error:', error)
      return res.status(500).json({ code: 'UPLOAD_FAILED', error: 'Failed to upload to cloud storage' })
    }
  })
})

/**
 * Delete only keys in the owned GameCity media prefix and known image formats.
 */
router.post('/delete', protect, admin, async (req, res) => {
  try {
    const { keys } = req.body || {}
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > 50) {
      return res.status(400).json({ code: 'INVALID_MEDIA_KEYS', error: 'keys must contain 1 to 50 media keys' })
    }
    if (!keys.every(isOwnedMediaKey)) {
      return res.status(400).json({ code: 'INVALID_MEDIA_KEY', error: 'One or more media keys are not valid GameCity media keys' })
    }

    await imageStorage.deleteFile(keys)
    return res.json({ message: `Deleted ${keys.length} image(s)` })
  } catch (error) {
    console.error('Delete error:', error)
    return res.status(500).json({ code: 'DELETE_FAILED', error: 'Failed to delete images' })
  }
})

module.exports = router
