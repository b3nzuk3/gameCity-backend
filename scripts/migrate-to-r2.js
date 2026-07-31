#!/usr/bin/env node

/**
 * Migration Script: Cloudinary → Cloudflare R2
 *
 * For every product with a Cloudinary image:
 *   1. Download image from Cloudinary
 *   2. Upload optimized image to Cloudflare R2
 *   3. Save new R2 URL in the database
 *   4. Continue even if one image fails
 *   5. Produce a migration report
 *
 * Supports resuming if interrupted (skips products that already have image_r2).
 *
 * Usage:
 *   node scripts/migrate-to-r2.js [--dry-run] [--batch-size=10] [--delay=500]
 *
 * Environment variables required:
 *   MONGODB_URI        – MongoDB connection string
 *   R2_ACCOUNT_ID      – Cloudflare account ID
 *   R2_ACCESS_KEY_ID   – R2 API token access key
 *   R2_SECRET_ACCESS_KEY – R2 API token secret
 *   R2_BUCKET_NAME     – R2 bucket name
 *   R2_PUBLIC_URL      – Public URL for serving images
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const mongoose = require('mongoose')
const https = require('https')
const http = require('http')
const { Buffer } = require('buffer')
const Product = require('../models/productModel')
const imageStorage = require('../services/imageStorageService')

// Parse CLI args
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const BATCH_SIZE = parseInt(args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] || '10')
const DELAY_MS = parseInt(args.find((a) => a.startsWith('--delay='))?.split('=')[1] || '500')

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set. Cannot connect to database.')
  process.exit(1)
}

/**
 * Download an image from a URL and return as Buffer.
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          return downloadImage(res.headers.location).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        }
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

/**
 * Sleep helper for rate limiting.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Main migration function.
 */
async function migrate() {
  console.log('='.repeat(60))
  console.log('Cloudinary → Cloudflare R2 Migration Script')
  console.log('='.repeat(60))
  console.log(`Dry run: ${DRY_RUN}`)
  console.log(`Batch size: ${BATCH_SIZE}`)
  console.log(`Delay between items: ${DELAY_MS}ms`)
  console.log('')

  // Connect to MongoDB
  console.log('📡 Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI)
  console.log('✅ Connected to MongoDB')

  // Find products that need migration (have image but no image_r2)
  const totalProducts = await Product.countDocuments({
    image: { $exists: true, $ne: null },
  })
  const migratedCount = await Product.countDocuments({
    image_r2: { $exists: true, $ne: null },
  })
  const pendingCount = await Product.countDocuments({
    image: { $exists: true, $ne: null },
    $or: [
      { image_r2: { $exists: false } },
      { image_r2: null },
    ],
  })

  console.log(`\n📊 Migration Status:`)
  console.log(`   Total products with images: ${totalProducts}`)
  console.log(`   Already migrated: ${migratedCount}`)
  console.log(`   Pending migration: ${pendingCount}`)
  console.log('')

  if (pendingCount === 0) {
    console.log('✅ All products already migrated!')
    await mongoose.disconnect()
    return
  }

  // Migration report
  const report = {
    total: pendingCount,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — no changes will be made\n')
  }

  // Process in batches
  let processed = 0
  while (processed < pendingCount) {
    const products = await Product.find({
      image: { $exists: true, $ne: null },
      $or: [
        { image_r2: { $exists: false } },
        { image_r2: null },
      ],
    })
      .limit(BATCH_SIZE)
      .skip(processed)

    if (products.length === 0) break

    for (const product of products) {
      processed++
      const progress = `[${processed}/${pendingCount}]`

      try {
        // Skip if already has R2 image (resume support)
        if (product.image_r2) {
          console.log(`${progress} ⏭️  ${product.name} — already has R2 URL, skipping`)
          report.skipped++
          continue
        }

        // Skip non-Cloudinary URLs (already migrated or external)
        if (!product.image.includes('cloudinary.com')) {
          console.log(`${progress} ⏭️  ${product.name} — not a Cloudinary URL, skipping`)
          report.skipped++
          continue
        }

        if (DRY_RUN) {
          console.log(`${progress} 🔍 ${product.name} — would migrate ${product.image}`)
          report.success++
          continue
        }

        // Download from Cloudinary
        console.log(`${progress} ⬇️  Downloading: ${product.name}`)
        const imageBuffer = await downloadImage(product.image)

        // Upload to R2
        console.log(`${progress} ⬆️  Uploading to R2: ${product.name}`)
        const result = await imageStorage.upload(imageBuffer, product.name || 'product.jpg')

        // Update database
        product.image_r2 = result.url

        // Also migrate gallery images if they exist
        if (product.images && product.images.length > 0) {
          const r2GalleryUrls = []
          for (const img of product.images) {
            try {
              if (img.includes('cloudinary.com')) {
                const galleryBuffer = await downloadImage(img)
                const galleryResult = await imageStorage.upload(
                  galleryBuffer,
                  product.name || 'product.jpg'
                )
                r2GalleryUrls.push(galleryResult.url)
              } else {
                r2GalleryUrls.push(img)
              }
            } catch (galleryErr) {
              console.error(
                `${progress} ⚠️  Gallery image failed for ${product.name}:`,
                galleryErr.message
              )
              // Keep the original URL
              r2GalleryUrls.push(img)
            }
          }
          product.images_r2 = r2GalleryUrls
        }

        await product.save()
        console.log(`${progress} ✅ ${product.name} — migrated successfully`)
        report.success++
      } catch (err) {
        console.error(`${progress} ❌ ${product.name} — FAILED: ${err.message}`)
        report.errors.push({
          productId: product._id.toString(),
          productName: product.name,
          error: err.message,
          imageUrl: product.image,
        })
        report.failed++
        // Continue — don't stop on individual failures
      }

      // Rate limit delay
      await sleep(DELAY_MS)
    }
  }

  // Print report
  console.log('\n' + '='.repeat(60))
  console.log('📋 Migration Report')
  console.log('='.repeat(60))
  console.log(`   Total processed: ${report.success + report.failed + report.skipped}`)
  console.log(`   ✅ Success: ${report.success}`)
  console.log(`   ❌ Failed: ${report.failed}`)
  console.log(`   ⏭️  Skipped: ${report.skipped}`)

  if (report.errors.length > 0) {
    console.log('\n❌ Failed items:')
    for (const err of report.errors) {
      console.log(`   - ${err.productName} (${err.productId}): ${err.error}`)
      console.log(`     Image URL: ${err.imageUrl}`)
    }
  }

  console.log('\n' + '='.repeat(60))

  if (DRY_RUN) {
    console.log('🔍 DRY RUN complete — no changes were made')
  } else {
    console.log('✅ Migration complete!')
    console.log('\nNext steps:')
    console.log('1. Verify products display correctly with R2 images')
    console.log('2. Run: node scripts/migrate-to-r2.js --dry-run (to confirm)')
    console.log('3. When ready, remove Cloudinary dependencies')
  }

  await mongoose.disconnect()
}

// Run migration
migrate().catch((err) => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
