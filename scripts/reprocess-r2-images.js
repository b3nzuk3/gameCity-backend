#!/usr/bin/env node

/**
 * Re-process Script: Fix existing R2 images
 *
 * Downloads images from R2, re-processes with orientation fix + 1600px cap,
 * uploads back to R2, and updates the database with new URLs and variants.
 *
 * Usage:
 *   node scripts/reprocess-r2-images.js [--dry-run] [--batch-size=10] [--delay=500] [--limit=5]
 *
 * The --limit flag is useful for testing — only processes N products.
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

const https = require('https')
const http = require('http')
const { Buffer } = require('buffer')
const mongoose = require('mongoose')
const Product = require('../models/productModel')
const imageStorage = require('../services/imageStorageService')
const r2Service = require('../services/r2Service')

// Parse CLI args
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const BATCH_SIZE = parseInt(args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] || '10')
const DELAY_MS = parseInt(args.find((a) => a.startsWith('--delay='))?.split('=')[1] || '500')
const LIMIT = parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '0')

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set.')
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
 * Main re-processing function.
 */
async function reprocess() {
  console.log('='.repeat(60))
  console.log('R2 Image Re-processing Script')
  console.log('='.repeat(60))
  console.log(`Dry run: ${DRY_RUN}`)
  console.log(`Batch size: ${BATCH_SIZE}`)
  console.log(`Delay between items: ${DELAY_MS}ms`)
  console.log(`Limit: ${LIMIT || 'no limit'}`)
  console.log('')

  // Connect to MongoDB
  console.log('📡 Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI)
  console.log('✅ Connected to MongoDB')

  // Find products that have R2 images (need re-processing)
  const query = {
    image_r2: { $exists: true, $ne: null },
  }

  const totalProducts = await Product.countDocuments(query)
  console.log(`\n📊 Found ${totalProducts} products with R2 images`)

  const processCount = LIMIT > 0 ? Math.min(LIMIT, totalProducts) : totalProducts
  console.log(`   Processing: ${processCount} products`)
  console.log('')

  if (processCount === 0) {
    console.log('✅ No products to re-process')
    await mongoose.disconnect()
    return
  }

  // Migration report
  const report = {
    total: processCount,
    success: 0,
    failed: 0,
    errors: [],
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — no changes will be made\n')
  }

  // Process in batches
  let processed = 0
  while (processed < processCount) {
    const remaining = processCount - processed
    const batchSize = Math.min(BATCH_SIZE, remaining)

    const products = await Product.find(query)
      .limit(batchSize)
      .skip(processed)

    if (products.length === 0) break

    for (const product of products) {
      processed++
      const progress = `[${processed}/${processCount}]`

      try {
        const imageUrl = product.image_r2
        if (!imageUrl) {
          console.log(`${progress} ⏭️  ${product.name} — no R2 URL, skipping`)
          continue
        }

        if (DRY_RUN) {
          console.log(`${progress} 🔍 ${product.name} — would re-process ${imageUrl}`)
          report.success++
          continue
        }

        // Download from R2
        console.log(`${progress} ⬇️  Downloading: ${product.name}`)
        const imageBuffer = await downloadImage(imageUrl)

        // Re-process with fixed optimizer
        console.log(`${progress} 🔄 Re-processing: ${product.name}`)
        const result = await imageStorage.upload(imageBuffer, product.name || 'product.jpg')

        // Update database
        product.image_r2 = result.url
        product.image_r2_variants = result.variants || null

        await product.save()
        console.log(`${progress} ✅ ${product.name} — re-processed successfully`)
        report.success++
      } catch (err) {
        console.error(`${progress} ❌ ${product.name} — FAILED: ${err.message}`)
        report.errors.push({
          productId: product._id.toString(),
          productName: product.name,
          error: err.message,
          imageUrl: product.image_r2,
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
  console.log('📋 Re-processing Report')
  console.log('='.repeat(60))
  console.log(`   Total processed: ${report.success + report.failed}`)
  console.log(`   ✅ Success: ${report.success}`)
  console.log(`   ❌ Failed: ${report.failed}`)

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
    console.log('✅ Re-processing complete!')
  }

  await mongoose.disconnect()
}

// Run re-processing
reprocess().catch((err) => {
  console.error('❌ Re-processing failed:', err)
  process.exit(1)
})
