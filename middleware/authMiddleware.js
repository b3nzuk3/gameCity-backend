const jwt = require('jsonwebtoken')
const User = require('../models/userModel')
const { getJwtSecret } = require('../config/security')

const SAFE_USER_SELECT = '-password -verificationToken -resetPasswordToken -resetPasswordExpires'

const protect = async (req, res, next) => {
  const authorization = req.headers.authorization || ''
  if (!/^Bearer\s+/i.test(authorization)) {
    return res.status(401).json({ message: 'Not authorized, no token' })
  }

  try {
    const token = authorization.replace(/^Bearer\s+/i, '').trim()
    const decoded = jwt.verify(token, getJwtSecret())
    req.user = await User.findById(decoded.id).select(SAFE_USER_SELECT)

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, user not found' })
    }

    return next()
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' })
  }
}

const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    return next()
  }
  return res.status(403).json({ message: 'Not authorized as an admin' })
}

const optionalAuth = async (req, res, next) => {
  const authorization = req.headers.authorization || ''
  if (/^Bearer\s+/i.test(authorization)) {
    try {
      const token = authorization.replace(/^Bearer\s+/i, '').trim()
      const decoded = jwt.verify(token, getJwtSecret())
      req.user = await User.findById(decoded.id).select(SAFE_USER_SELECT)
    } catch (error) {
      req.user = null
    }
  }

  return next()
}

module.exports = { protect, admin, optionalAuth, SAFE_USER_SELECT }
