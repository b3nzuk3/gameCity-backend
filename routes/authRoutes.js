const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const User = require('../models/userModel')
const { protect } = require('../middleware/authMiddleware')

// Helper: send verification email
async function sendVerificationEmail(user, req) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })
  const verifyUrl = `${req.protocol}://${req.get(
    'host'
  )}/api/auth/verify-email?token=${user.verificationToken}`
  await transporter.sendMail({
    from: 'no-reply@gamecity.com',
    to: user.email,
    subject: 'Verify your email',
    html: `<p>Hi ${user.name},</p><p>Please verify your email by clicking <a href="${verifyUrl}">here</a>.</p>`,
  })
}

// Registration route
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: 'Name, email, and password are required' })
    }
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res
        .status(400)
        .json({ error: 'User already exists with this email' })
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
    res.status(500).json({ error: 'Server error' })
  }
})

// Email verification endpoint
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query
    if (!token) return res.status(400).json({ error: 'No token provided' })
    const user = await User.findOne({ verificationToken: token })
    if (!user)
      return res.status(400).json({ error: 'Invalid or expired token' })
    user.isVerified = true
    user.verificationToken = undefined
    await user.save()
    res.send('<h2>Email verified! You can now log in.</h2>')
  } catch (error) {
    console.error('Email verification error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const isMatch = await user.matchPassword(password)
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    if (!user.isVerified) {
      return res
        .status(403)
        .json({ error: 'Please verify your email before logging in.' })
    }
    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, isAdmin: user.isAdmin },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    )
    res.json({
      token,
      user: { name: user.name, email: user.email, isAdmin: user.isAdmin },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get current user
router.get('/me', protect, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  res.json({ user: req.user })
})

module.exports = router
