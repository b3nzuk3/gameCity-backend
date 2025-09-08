const express = require('express')
const { mpesaService } = require('../services/mpesaService')
const router = express.Router()

// Middleware to handle M-Pesa errors
const handleMpesaError = (error, res) => {
  console.error('M-Pesa Error Details:', {
    message: error.message,
    response: error.response?.data,
    stack: error.stack,
    config: error.config
      ? {
          url: error.config.url,
          method: error.config.method,
          headers: error.config.headers,
          data: error.config.data,
        }
      : null,
  })

  res.status(error.response?.status || 500).json({
    success: false,
    error: error.response?.data?.errorMessage || error.message,
    details: error.response?.data,
  })
}

// Test endpoint for sandbox simulation
router.post('/test-payment', async (req, res) => {
  try {
    console.log('Received payment request:', req.body)
    const { phoneNumber, amount } = req.body

    // Validate request body
    if (!phoneNumber || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and amount are required',
      })
    }

    // Validate phone number format
    const cleanedPhone = phoneNumber.replace(/\D/g, '')
    if (cleanedPhone.length < 9 || cleanedPhone.length > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Must be between 9 and 12 digits.',
      })
    }

    // Validate amount
    const numAmount = Number(amount)
    if (isNaN(numAmount) || numAmount < 10 || numAmount > 150000) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be between 10 and 150,000',
      })
    }

    // Log M-Pesa configuration
    console.log('M-Pesa Configuration:', {
      baseUrl: process.env.MPESA_BASE_URL,
      shortCode: process.env.MPESA_BUSINESS_SHORT_CODE,
      validationUrl: process.env.MPESA_VALIDATION_URL,
      confirmationUrl: process.env.MPESA_CONFIRMATION_URL,
      hasConsumerKey: !!process.env.MPESA_CONSUMER_KEY,
      hasConsumerSecret: !!process.env.MPESA_CONSUMER_SECRET,
      hasPasskey: !!process.env.MPESA_PASSKEY,
    })

    // First register URLs (required for sandbox)
    const urlRegistration = await mpesaService.registerUrls()
    console.log('URL Registration result:', urlRegistration)

    // Then simulate payment
    const result = await mpesaService.simulatePayment(phoneNumber, numAmount)
    console.log('Payment simulation result:', result)

    res.json({
      success: true,
      result,
      message: 'Payment simulation initiated successfully',
    })
  } catch (error) {
    handleMpesaError(error, res)
  }
})

// Validation endpoint
router.post('/validate', async (req, res) => {
  try {
    console.log('Received validation request:', req.body)
    const result = await mpesaService.validateTransaction(req.body)
    res.json(result)
  } catch (error) {
    handleMpesaError(error, res)
  }
})

// Confirmation endpoint
router.post('/confirm', async (req, res) => {
  try {
    console.log('Received confirmation request:', req.body)
    const result = await mpesaService.handleConfirmation(req.body)
    res.json(result)
  } catch (error) {
    handleMpesaError(error, res)
  }
})

module.exports = router
