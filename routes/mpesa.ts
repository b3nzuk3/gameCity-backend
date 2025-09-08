const express = require('express')
const { validateMpesa } = require('../controllers/mpesaController')
const { mpesaService } = require('../services/mpesaService')

const router = express.Router()

// Validation endpoint
router.post('/validate', validateMpesa)

// Confirmation endpoint
router.post('/confirm', (req, res) => {
  console.log('M-Pesa Confirmation Received:', {
    body: req.body,
    timestamp: new Date().toISOString(),
  })
  res.json({ ResultCode: '0', ResultDesc: 'Confirmation received' })
})

// Test endpoint for sandbox simulation
router.post('/test-payment', async (req, res) => {
  const { phoneNumber, amount } = req.body

  // Log the incoming request
  console.log('Received test payment request:', {
    phoneNumber,
    amount,
    timestamp: new Date().toISOString(),
  })

  // Validate input
  if (!phoneNumber || !amount) {
    return res.status(400).json({
      success: false,
      error: 'Phone number and amount are required',
    })
  }

  try {
    // First register URLs (required for sandbox)
    await mpesaService.registerUrls()

    // Then attempt payment
    console.log('Attempting payment simulation with:', { phoneNumber, amount })
    const result = await mpesaService.simulatePayment(phoneNumber, amount)

    console.log('Payment simulation result:', result)
    res.json({
      success: true,
      message:
        'If you see this message but used a wrong number, please check the server logs',
      result,
    })
  } catch (error) {
    console.error('Test payment failed:', error)
    res.status(400).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Payment simulation failed',
    })
  }
})

module.exports = router
