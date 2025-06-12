const express = require('express')
const multer = require('multer')
const cloudinary = require('../utils/cloudinary')
const { Readable } = require('stream')

const router = express.Router()

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false)
    }
    cb(null, true)
  },
}).single('image')

// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const writeStream = cloudinary.uploader.upload_stream(
      {
        folder: 'greenbits-store',
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      }
    )

    const readStream = new Readable({
      read() {
        this.push(buffer)
        this.push(null)
      },
    })

    readStream.pipe(writeStream)
  })
}

// Handle image upload
router.post('/', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err)
      return res.status(400).json({ error: err.message })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    try {
      const result = await uploadToCloudinary(req.file.buffer)
      res.json({
        url: result.secure_url,
        public_id: result.public_id,
      })
    } catch (error) {
      console.error('Cloudinary upload error:', error)
      res.status(500).json({ error: 'Failed to upload to cloud storage' })
    }
  })
})

module.exports = router
