const Redis = require('ioredis')

const hasRedisConfig = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST)
const redis = hasRedisConfig
  ? new Redis(process.env.REDIS_URL || {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
      tls: process.env.NODE_ENV === 'production' ? {} : undefined,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    })
  : null

if (redis) {
  redis.on('error', (err) => console.error('Redis connection error:', err))
  redis.on('connect', () => console.log('Connected to Redis'))
}

const cacheMiddleware = (duration) => async (req, res, next) => {
  if (req.method !== 'GET' || !redis) return next()

  const key = `cache:${req.originalUrl || req.url}`
  try {
    const cachedResponse = await redis.get(key)
    if (cachedResponse) {
      const parsed = JSON.parse(cachedResponse)
      const cached = parsed && Object.prototype.hasOwnProperty.call(parsed, 'body')
        ? parsed
        : { status: 200, body: parsed }
      res.status(cached.status || 200)
      return res.json(cached.body)
    }

    const originalJson = res.json.bind(res)
    res.json = (body) => {
      const status = res.statusCode
      if (status >= 200 && status < 300) {
        redis.setex(key, duration, JSON.stringify({ status, body })).catch((err) => console.error('Redis set error:', err))
      }
      return originalJson(body)
    }
    return next()
  } catch (error) {
    console.error('Cache middleware error:', error)
    return next()
  }
}

const clearCache = (prefix = 'cache:/api/products') => {
  if (!redis) return Promise.resolve()
  return new Promise((resolve) => {
    const stream = redis.scanStream({ match: `${prefix}*`, count: 100 })
    const keysToDelete = []
    let settled = false
    const finish = () => {
      if (!settled) {
        settled = true
        resolve()
      }
    }

    stream.on('data', (keys) => {
      if (keys.length) keysToDelete.push(...keys)
    })
    stream.on('error', (error) => {
      console.error('Error scanning cache keys:', error)
      finish()
    })
    stream.on('end', async () => {
      if (keysToDelete.length === 0) return finish()
      try {
        await redis.del(keysToDelete)
        console.log(`Cleared cache for ${keysToDelete.length} key(s)`)
      } catch (error) {
        console.error('Error deleting cache keys:', error)
      }
      finish()
    })
  })
}

module.exports = { cacheMiddleware, clearCache }