const crypto = require('crypto')

const CSRF_TOKEN_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex')

function generateCsrfToken(sessionId) {
  return crypto
    .createHmac('sha256', CSRF_TOKEN_SECRET)
    .update(sessionId)
    .digest('hex')
}

function verifyCsrfToken(token, sessionId) {
  if (!token || !sessionId) return false
  const expected = generateCsrfToken(sessionId)
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}

const csrfMiddleware = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next()
  }

  const csrfToken = req.headers['x-csrf-token']
  const sessionId = req.headers['x-session-id']

  if (!csrfToken || !sessionId) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token missing',
    })
  }

  if (!verifyCsrfToken(csrfToken, sessionId)) {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token',
    })
  }

  next()
}

const csrfTokenRoute = (req, res) => {
  const sessionId = req.headers['x-session-id'] || crypto.randomBytes(16).toString('hex')
  const token = generateCsrfToken(sessionId)
  res.json({
    csrfToken: token,
    sessionId: sessionId,
  })
}

module.exports = {
  generateCsrfToken,
  verifyCsrfToken,
  csrfMiddleware,
  csrfTokenRoute,
}