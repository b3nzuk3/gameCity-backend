const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const User = require('../models/userModel')
const { protect } = require('../middleware/authMiddleware')
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require('../services/emailService')

// Note: sendVerificationEmail is now imported from emailService

// Registration route
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: 'Name, email, and password are required' })
    }
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res
        .status(400)
        .json({ message: 'User already exists with this email' })
    }
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex')
    const user = new User({
      name,
      email,
      password,
      isAdmin: false,
      isVerified: false,
      verificationToken,
    })
    await user.save()
    await sendVerificationEmail(user, req)
    res.status(201).json({
      user: {
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        isVerified: user.isVerified,
      },
      message:
        'Registration successful. Please check your email to verify your account.',
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
    if (!user)
      return res.status(400).json({ message: 'Invalid or expired token' })
    user.isVerified = true
    user.verificationToken = undefined
    await user.save()
    res.json({ message: 'Email verified successfully! You can now log in.' })
  } catch (error) {
    console.error('Email verification error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email and password are required' })
    }
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    const isMatch = await user.matchPassword(password)
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    if (!user.isVerified) {
      return res
        .status(403)
        .json({ message: 'Please verify your email before logging in.' })
    }
    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, isAdmin: user.isAdmin },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    )
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})

// Get current user
router.get('/me', protect, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' })
  }
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      isAdmin: req.user.isAdmin,
    },
  })
})

// Password reset request
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ message: 'Email is required' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ message: 'No user found with that email' })
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    user.resetPasswordToken = resetToken
    user.resetPasswordExpires = Date.now() + 3600000 // 1 hour
    await user.save()

    // Send password reset email using the email service
    await sendPasswordResetEmail(user, resetToken, req)
    res.json({ message: 'Password reset instructions sent to your email.' })
  } catch (error) {
    console.error('Password reset error:', error)
    res
      .status(500)
      .json({
        message: 'Failed to send password reset email. Please try again.',
      })
  }
})

// Password reset (set new password)
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params
  const { password } = req.body
  console.log('Received token:', token)
  if (!password) {
    return res.status(400).json({ message: 'Password is required' })
  }
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  })
  console.log('User found for token:', user)
  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired token' })
  }
  user.password = password
  user.resetPasswordToken = undefined
  user.resetPasswordExpires = undefined
  await user.save()
  res.json({ message: 'Password has been reset successfully.' })
})

module.exports = router
