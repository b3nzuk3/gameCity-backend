const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const path = require('path')

/**
 * Cloudflare R2 Storage Service
 * Uses AWS S3 SDK because R2 is S3-compatible.
 *
 * Environment variables required:
 *   R2_ACCOUNT_ID       – Cloudflare account ID
 *   R2_ACCESS_KEY_ID    – R2 API token access key
 *   R2_SECRET_ACCESS_KEY – R2 API token secret
 *   R2_BUCKET_NAME      – R2 bucket name
 *   R2_PUBLIC_URL       – Public URL for serving images (e.g. https://pub-xxx.r2.dev)
 */

let r2Client = null

function getR2Client() {
  if (r2Client) return r2Client

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 credentials missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env'
    )
  }

  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  return r2Client
}

/**
 * Upload a buffer to R2
 * @param {Buffer} buffer – file content
 * @param {string} key – object key (e.g. "greenbits-store/abc123.webp")
 * @param {string} contentType – MIME type
 * @returns {Promise<{key: string, url: string}>}
 */
async function uploadToR2(buffer, key, contentType) {
  const client = getR2Client()
  const bucket = process.env.R2_BUCKET_NAME

  if (!bucket) throw new Error('R2_BUCKET_NAME not set')

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    // R2 supports cache-control for CDN
    CacheControl: 'public, max-age=31536000, immutable',
  })

  await client.send(command)

  const publicUrl = getPublicUrl(key)

  return { key, url: publicUrl }
}

/**
 * Delete an object from R2
 * @param {string} key
 */
async function deleteFromR2(key) {
  const client = getR2Client()
  const bucket = process.env.R2_BUCKET_NAME

  if (!bucket) throw new Error('R2_BUCKET_NAME not set')

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  await client.send(command)
}

/**
 * Check if an object exists in R2
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function objectExists(key) {
  try {
    const client = getR2Client()
    const bucket = process.env.R2_BUCKET_NAME

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    })

    await client.send(command)
    return true
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false
    }
    throw err
  }
}

/**
 * Get the public URL for a given R2 key
 * @param {string} key
 * @returns {string}
 */
function getPublicUrl(key) {
  const publicUrl = process.env.R2_PUBLIC_URL
  if (!publicUrl) {
    throw new Error('R2_PUBLIC_URL not set')
  }
  // Ensure no double slashes
  return `${publicUrl.replace(/\/$/, '')}/${key}`
}

/**
 * Generate a unique R2 key for an image
 * @param {string} originalName – original filename
 * @param {string} folder – folder prefix (e.g. "greenbits-store")
 * @returns {string}
 */
function generateKey(originalName, folder = 'greenbits-store') {
  const { v4: uuidv4 } = require('uuid')
  const ext = path.extname(originalName).toLowerCase() || '.webp'
  const timestamp = Date.now()
  return `${folder}/${timestamp}-${uuidv4()}${ext}`
}

module.exports = {
  uploadToR2,
  deleteFromR2,
  objectExists,
  getPublicUrl,
  generateKey,
}
