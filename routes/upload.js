const express = require('express')
const multer = require('multer')
const imageStorage = require('../services/imageStorageService')

const router = express.Router()

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false)
    }
    cb(null, true)
  },
}).array('images', 10) // Accept up to 10 images

/**
 * Handle image upload
 * New uploads go to Cloudflare R2 with Sharp optimization.
 * Cloudinary is no longer used for new uploads.
 */
router.post('/', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err)
      return res.status(400).json({ error: err.message })
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' })
    }

    try {
      const uploadResults = []

      for (const file of req.files) {
        try {
          const result = await imageStorage.upload(file.buffer, file.originalname)
          uploadResults.push({
            url: result.url,
            key: result.key,
            variants: result.variants,
          })
        } catch (uploadErr) {
          console.error(`[Upload] Failed to upload ${file.originalname}:`, uploadErr.message)
          // Continue with other files — don't break the whole batch
          uploadResults.push({
            url: null,
            key: null,
            error: uploadErr.message,
          })
        }
      }

      const urls = uploadResults
        .filter((r) => r.url)
        .map((r) => r.url)

      const failures = uploadResults.filter((r) => !r.url)

      res.json({
        urls,
        uploaded: urls.length,
        failed: failures.length,
        failures: failures.length > 0 ? failures.map((f) => f.error) : undefined,
      })
    } catch (error) {
      console.error('Upload error:', error)
      res.status(500).json({ error: 'Failed to upload to cloud storage' })
    }
  })
})

/**
 * Delete images from R2
 * POST /api/upload/delete
 * Body: { keys: ["greenbits-store/xxx.webp", ...] }
 */
router.post('/delete', async (req, res) => {
  try {
    const { keys } = req.body
    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ error: 'keys array is required' })
    }

    for (const key of keys) {
      await imageStorage.deleteFile(key)
    }

    res.json({ message: `Deleted ${keys.length} image(s)` })
  } catch (error) {
    console.error('Delete error:', error)
    res.status(500).json({ error: 'Failed to delete images' })
  }
})

module.exports = router
