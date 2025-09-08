const Redis = require('ioredis')

// Configure Redis client with TLS for production
const redisConfig = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.NODE_ENV === 'production' ? {} : undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
}

const redis = new Redis(redisConfig)

redis.on('error', (err) => {
  console.error('Redis connection error:', err)
})

redis.on('connect', () => {
  console.log('Connected to Redis')
})

const cacheMiddleware = (duration) => {
  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next()
    }

    const key = `cache:${req.originalUrl || req.url}`

    try {
      const cachedResponse = await redis.get(key)

      if (cachedResponse) {
        return res.json(JSON.parse(cachedResponse))
      }

      // Modify res.json to cache the response
      const originalJson = res.json
      res.json = function (body) {
        redis
          .setex(key, duration, JSON.stringify(body))
          .catch((err) => console.error('Redis set error:', err))
        return originalJson.call(this, body)
      }

      next()
    } catch (error) {
      console.error('Cache middleware error:', error)
      next()
    }
  }
}

const clearCache = async (prefix = 'cache:/api/products') => {
  try {
    const stream = redis.scanStream({
      match: `${prefix}*`,
      count: 100,
    })
    const keysToDelete = []
    stream.on('data', (keys) => {
      if (keys.length) {
        keysToDelete.push(...keys)
      }
    })
    stream.on('end', async () => {
      if (keysToDelete.length > 0) {
        await redis.del(keysToDelete)
        console.log(`Cleared cache for keys: ${keysToDelete.join(', ')}`)
      }
    })
  } catch (error) {
    console.error('Error clearing cache:', error)
  }
}

module.exports = { cacheMiddleware, clearCache }
