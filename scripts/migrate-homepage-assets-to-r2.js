#!/usr/bin/env node

/**
 * Migrate the hard-coded homepage assets from Cloudinary to Cloudflare R2.
 *
 * Safe by default: without --upload, this only downloads and optimizes assets
 * locally, writes a manifest, and never changes source files or deletes assets.
 *
 * Usage:
 *   node scripts/migrate-homepage-assets-to-r2.js --dry-run
 *   node scripts/migrate-homepage-assets-to-r2.js --upload
 *   node scripts/migrate-homepage-assets-to-r2.js --upload --apply
 *
 * Required for --upload:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_URL
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const fs = require('fs/promises')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')
const https = require('https')
const http = require('http')
const sharp = require('sharp')
const { uploadToR2 } = require('../services/r2Service')
const { optimizeImage } = require('../utils/imageOptimizer')

const execFileAsync = promisify(execFile)
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg'
const OUTPUT_PREFIX = 'homepage'
const R2_FALLBACK_URL = 'https://pub-5e82d594e79e436e9cfd3a07c9c7eb7d.r2.dev'

const assets = {
  poster: {
    source: 'https://res.cloudinary.com/dq3jxutxg/video/upload/f_auto,q_auto/v1777433582/greenbits-store/0429_1_kjyl0t.jpg',
    key: `${OUTPUT_PREFIX}/hero/gamecity-hero-poster.webp`,
  },
  video: {
    source: 'https://res.cloudinary.com/dq3jxutxg/video/upload/f_auto,q_auto/v1777433582/greenbits-store/0429_1_kjyl0t.mov',
    key: `${OUTPUT_PREFIX}/hero/gamecity-hero.mp4`,
  },
  categories: [
    ['pre-built', 'https://res.cloudinary.com/dq3jxutxg/image/upload/v1750431696/greenbits-store/GamingPcs_euewim.jpg'],
    ['graphics-cards', 'https://res.cloudinary.com/dq3jxutxg/image/upload/v1750432917/greenbits-store/AdobeStock_848719298_Preview_ag8zqj.jpg'],
    ['monitors', 'https://res.cloudinary.com/dq3jxutxg/image/upload/v1750432934/greenbits-store/AdobeStock_1452111894_Preview_hsqona.jpg'],
    ['processors', 'https://res.cloudinary.com/dq3jxutxg/image/upload/v1750433035/greenbits-store/AdobeStock_1479635189_Preview_kjbjw0.jpg'],
    ['power-supply', 'https://res.cloudinary.com/dq3jxutxg/image/upload/v1750433413/greenbits-store/andrey-matveev-vfXpYMzmSew-unsplash_nkpbwf.jpg'],
    ['accessories', 'https://res.cloudinary.com/dq3jxutxg/image/upload/v1750433029/greenbits-store/AdobeStock_772458668_Preview_nonsm8.jpg'],
  ],
}

function parseArgs() {
  const args = new Set(process.argv.slice(2))
  if (args.has('--help')) {
    console.log('Usage: node scripts/migrate-homepage-assets-to-r2.js [--dry-run|--upload] [--apply]')
    process.exit(0)
  }
  if (args.has('--upload') && args.has('--dry-run')) throw new Error('Choose --dry-run or --upload, not both.')
  if (args.has('--apply') && !args.has('--upload')) throw new Error('--apply requires --upload.')
  return { upload: args.has('--upload'), apply: args.has('--apply') }
}

function download(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error(`Too many redirects for ${url}`))
  const client = url.startsWith('https:') ? https : http
  return new Promise((resolve, reject) => {
    client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        return download(new URL(response.headers.location, url).toString(), redirects + 1).then(resolve, reject)
      }
      if (response.statusCode !== 200) {
        response.resume()
        return reject(new Error(`HTTP ${response.statusCode} for ${url}`))
      }
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    }).on('error', reject)
  })
}

function publicUrl(key) {
  const base = (process.env.R2_PUBLIC_URL || R2_FALLBACK_URL).replace(/\/$/, '')
  return `${base}/${key}`
}

async function put(buffer, key, contentType, upload) {
  if (upload) await uploadToR2(buffer, key, contentType)
  return publicUrl(key)
}

async function optimizePoster(input) {
  return sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'cover', withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toBuffer()
}

async function convertVideo(input) {
  const inputPath = path.join(os.tmpdir(), `gamecity-homepage-${Date.now()}.mov`)
  const outputPath = `${inputPath}.mp4`
  await fs.writeFile(inputPath, input)
  try {
    await execFileAsync(FFMPEG_BIN, ['-y', '-i', inputPath, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath])
    return await fs.readFile(outputPath)
  } finally {
    await fs.rm(inputPath, { force: true })
    await fs.rm(outputPath, { force: true })
  }
}

async function applyFrontendReferences(manifest) {
  const frontendRoot = path.resolve(__dirname, '../../gameCity')
  const files = [path.join(frontendRoot, 'src/components/Hero.tsx'), path.join(frontendRoot, 'src/pages/Index.tsx')]
  const replacements = new Map([
    [assets.poster.source, manifest.hero.poster],
    [assets.video.source, manifest.hero.video],
  ])
  for (const [name, source] of assets.categories) replacements.set(source, manifest.categories[name].medium)

  for (const file of files) {
    let source = await fs.readFile(file, 'utf8')
    for (const [from, to] of replacements) source = source.split(from).join(to)
    await fs.writeFile(file, source)
    console.log(`Updated frontend references: ${file}`)
  }
}

async function main() {
  const { upload, apply } = parseArgs()
  console.log(`Homepage asset migration: ${upload ? 'UPLOAD' : 'DRY RUN'}`)
  console.log(`Frontend references: ${apply ? 'will update' : 'unchanged'}. Cloudinary assets: never deleted.`)

  if (upload) {
    for (const variable of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL']) {
      if (!process.env[variable]) throw new Error(`${variable} is required for --upload`)
    }
  }

  const manifest = { hero: {}, categories: {} }
  const poster = await optimizePoster(await download(assets.poster.source))
  manifest.hero.poster = await put(poster, assets.poster.key, 'image/webp', upload)
  console.log(`${upload ? 'Uploaded' : 'Prepared'} poster`)

  const video = await convertVideo(await download(assets.video.source))
  manifest.hero.video = await put(video, assets.video.key, 'video/mp4', upload)
  console.log(`${upload ? 'Uploaded' : 'Prepared'} video`)

  for (const [name, source] of assets.categories) {
    const variants = await optimizeImage(await download(source), `${name}.jpg`)
    manifest.categories[name] = {}
    for (const variant of ['thumbnail', 'medium', 'large']) {
      const key = `${OUTPUT_PREFIX}/categories/${name}-${variant}.webp`
      manifest.categories[name][variant] = await put(variants[variant], key, 'image/webp', upload)
    }
    console.log(`${upload ? 'Uploaded' : 'Prepared'} category: ${name}`)
  }

  const manifestPath = path.join(__dirname, 'homepage-assets-r2-manifest.json')
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Wrote manifest: ${manifestPath}`)
  if (apply) await applyFrontendReferences(manifest)
  console.log(upload ? 'Upload complete.' : 'Dry run complete. Nothing was uploaded.')
}

main().catch((error) => {
  console.error(`Homepage asset migration failed: ${error.message}`)
  process.exitCode = 1
})
