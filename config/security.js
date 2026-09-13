const crypto = require('crypto')

let ephemeralDevelopmentSecret

function getJwtSecret() {
  const configured = typeof process.env.JWT_SECRET === 'string'
    ? process.env.JWT_SECRET.trim()
    : ''

  if (configured) return configured

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production')
  }

  // Local development remains usable without committing a reusable secret.
  ephemeralDevelopmentSecret ||= crypto.randomBytes(32).toString('hex')
  return ephemeralDevelopmentSecret
}

function assertSecurityConfiguration() {
  if (process.env.NODE_ENV !== 'production') return

  const secret = process.env.JWT_SECRET?.trim()
  if (!secret) {
    throw new Error('JWT_SECRET must be configured before starting production')
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters in production')
  }
}

module.exports = { getJwtSecret, assertSecurityConfiguration }
