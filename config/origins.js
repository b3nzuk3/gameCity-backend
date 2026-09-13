const DEFAULT_ADMIN_ORIGIN = 'https://admin.gamecityelectronics.co.ke'
const DEFAULT_STOREFRONT_ORIGIN = 'https://www.gamecityelectronics.co.ke'

const hardcodedAllowedOrigins = [
  'https://www.gamecityelectronics.com',
  DEFAULT_STOREFRONT_ORIGIN,
  'https://gamecityelectronics.co.ke',
  'https://game-city-one.vercel.app',
  DEFAULT_ADMIN_ORIGIN,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
  'http://localhost:4175',
  'http://127.0.0.1:4175',
  'http://localhost:4176',
  'http://127.0.0.1:4176',
  'http://localhost:4177',
  'http://127.0.0.1:4177',
  'http://localhost:4178',
  'http://127.0.0.1:4178',
]

function normalizeOrigin(origin) {
  return origin.trim().replace(/\/$/, '')
}

function getAllowedOrigins(env = process.env) {
  const configured = [
    env.ADMIN_ORIGIN || DEFAULT_ADMIN_ORIGIN,
    env.STOREFRONT_ORIGIN || DEFAULT_STOREFRONT_ORIGIN,
    ...(env.ALLOWED_ORIGINS || '').split(','),
  ]

  return [...new Set([
    ...hardcodedAllowedOrigins,
    ...configured.map(normalizeOrigin).filter(Boolean),
  ])]
}

module.exports = {
  DEFAULT_ADMIN_ORIGIN,
  DEFAULT_STOREFRONT_ORIGIN,
  getAllowedOrigins,
  normalizeOrigin,
}
