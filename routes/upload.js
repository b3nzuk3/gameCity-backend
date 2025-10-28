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

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' })
    }

    try {
      const uploadPromises = req.files.map((file) =>
        uploadToCloudinary(file.buffer)
      )
      const results = await Promise.all(uploadPromises)
      const urls = results.map((result) => result.secure_url)
      res.json({ urls })
    } catch (error) {
      console.error('Cloudinary upload error:', error)
      res.status(500).json({ error: 'Failed to upload to cloud storage' })
    }
  })
})

module.exports = router
