const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const User = require('../models/userModel')
const { protect } = require('../middleware/authMiddleware')
const { sendPasswordResetEmail } = require('../services/emailService')
const { getJwtSecret } = require('../config/security')
const { serializeUser } = require('../utils/userSerializer')

// Registration route
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' })
    }
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' })
    }
    const user = new User({
      name,
      email,
      password,
      isAdmin: false,
      isVerified: true,
    })
    await user.save()

    const token = jwt.sign(
      { id: user._id, email: user.email, isAdmin: user.isAdmin },
      getJwtSecret(),
      { expiresIn: '24h' }
    )

    res.status(201).json({
      user: serializeUser(user),
      token,
      message: 'Registration successful!',
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Email verification endpoint
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query
    if (!token) return res.status(400).json({ message: 'No token provided' })
    const user = await User.findOne({ verificationToken: token })
    if (!user) return res.status(400).json({ message: 'Invalid or expired token' })
    user.isVerified = true
    user.verificationToken = undefined
    await user.save()
    res.json({ message: 'Email verified successfully! You can now log in.' })
  } catch (error) {
    console.error('Email verification error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Shared storefront login endpoint. The standalone admin uses /api/admin/auth/login.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' })
    }
    const user = await User.findOne({ email })
    if (!user) return res.status(401).json({ message: 'Invalid credentials' })
    const isMatch = await user.matchPassword(password)
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' })

    const token = jwt.sign(
      { id: user._id, email: user.email, isAdmin: user.isAdmin },
      getJwtSecret(),
      { expiresIn: '24h' }
    )
    res.json({ token, user: serializeUser(user) })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Get current user
router.get('/me', protect, async (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Not authenticated' })
  res.json({ user: serializeUser(req.user) })
})

// Password reset request
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ message: 'Email is required' })

    const user = await User.findOne({ email })
    if (!user) return res.status(404).json({ message: 'No user found with that email' })

    const resetToken = crypto.randomBytes(32).toString('hex')
    user.resetPasswordToken = resetToken
    user.resetPasswordExpires = Date.now() + 3600000
    await user.save()
    await sendPasswordResetEmail(user, resetToken, req)
    res.json({ message: 'Password reset instructions sent to your email.' })
  } catch (error) {
    console.error('Password reset error:', error)
    res.status(500).json({ message: 'Failed to send password reset email. Please try again.' })
  }
})

// Password reset (set new password)
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params
    const { password } = req.body
    if (!password) return res.status(400).json({ message: 'Password is required' })
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    })
    if (!user) return res.status(400).json({ message: 'Invalid or expired token' })
    user.password = password
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined
    await user.save()
    res.json({ message: 'Password has been reset successfully.' })
  } catch (error) {
    res.status(500).json({ message: 'Password reset failed' })
  }
})

module.exports = router
