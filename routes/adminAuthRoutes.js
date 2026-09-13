const express = require('express')
const jwt = require('jsonwebtoken')
const User = require('../models/userModel')
const { protect, admin } = require('../middleware/authMiddleware')
const { getJwtSecret } = require('../config/security')
const { serializeUser } = require('../utils/userSerializer')

const router = express.Router()

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({
        code: 'INVALID_INPUT',
        message: 'Email and password are required',
      })
    }

    const user = await User.findOne({ email })
    const passwordMatches = user ? await user.matchPassword(password) : false

    if (!passwordMatches) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      })
    }

    if (!user.isAdmin) {
      return res.status(403).json({
        code: 'ADMIN_ACCESS_REQUIRED',
        message: 'Admin access required',
      })
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, isAdmin: true },
      getJwtSecret(),
      { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '24h' }
    )

    return res.json({ token, user: serializeUser(user) })
  } catch (error) {
    console.error('Admin login error:', error)
    return res.status(500).json({
      code: 'AUTHENTICATION_UNAVAILABLE',
      message: 'Authentication is temporarily unavailable',
    })
  }
})

router.get('/me', protect, admin, (req, res) => {
  res.json({ user: serializeUser(req.user) })
})

module.exports = router
