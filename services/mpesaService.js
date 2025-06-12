const axios = require('axios')

// Sandbox configuration for testing
const SANDBOX_CONFIG = {
  MPESA_BASE_URL: 'https://sandbox.safaricom.co.ke',
  MPESA_CONSUMER_KEY: 'WNGAOnXviA0OsIZAkyxGmKrWKwBkEfAUq3hYr1fsI04cCEz4',
  MPESA_CONSUMER_SECRET:
    'AxfY0znFDN3ZbJXOUmQEZ1C1X7ekAHqtxLcvNrvtDGtMs6cIpTf9aI0k1MnJFc13',
  MPESA_BUSINESS_SHORT_CODE: '600982',
  MPESA_PASSKEY:
    'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
  MPESA_VALIDATION_URL: 'http://localhost:5001/api/mpesa/validate',
  MPESA_CONFIRMATION_URL: 'http://localhost:5001/api/mpesa/confirm',
}

class MpesaService {
  constructor() {
    // Use environment variables or fallback to sandbox config
    this.baseUrl = process.env.MPESA_BASE_URL || SANDBOX_CONFIG.MPESA_BASE_URL
    this.consumerKey =
      process.env.MPESA_CONSUMER_KEY || SANDBOX_CONFIG.MPESA_CONSUMER_KEY
    this.consumerSecret =
      process.env.MPESA_CONSUMER_SECRET || SANDBOX_CONFIG.MPESA_CONSUMER_SECRET
    this.shortCode =
      process.env.MPESA_BUSINESS_SHORT_CODE ||
      SANDBOX_CONFIG.MPESA_BUSINESS_SHORT_CODE
    this.passkey = process.env.MPESA_PASSKEY || SANDBOX_CONFIG.MPESA_PASSKEY
    this.validationUrl =
      process.env.MPESA_VALIDATION_URL || SANDBOX_CONFIG.MPESA_VALIDATION_URL
    this.confirmationUrl =
      process.env.MPESA_CONFIRMATION_URL ||
      SANDBOX_CONFIG.MPESA_CONFIRMATION_URL
    this.accessToken = null
    this.tokenExpiry = 0
    this.urlsRegistered = false

    console.log('M-Pesa service initialized with configuration:', {
      baseUrl: this.baseUrl,
      shortCode: this.shortCode,
      validationUrl: this.validationUrl,
      confirmationUrl: this.confirmationUrl,
      hasConsumerKey: !!this.consumerKey,
      hasConsumerSecret: !!this.consumerSecret,
      hasPasskey: !!this.passkey,
    })
  }

  async getAccessToken() {
    try {
      // Check if token is still valid
      if (this.accessToken && Date.now() < this.tokenExpiry) {
        return this.accessToken
      }

      console.log('Getting new M-Pesa access token...')
      const auth = Buffer.from(
        `${this.consumerKey}:${this.consumerSecret}`
      ).toString('base64')

      const response = await axios.get(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
          },
          timeout: 10000, // 10 second timeout
        }
      )

      if (!response.data.access_token) {
        throw new Error('Access token not received in response')
      }

      this.accessToken = response.data.access_token
      this.tokenExpiry =
        Date.now() + (parseInt(response.data.expires_in) - 300) * 1000
      console.log('Successfully obtained M-Pesa access token')

      return this.accessToken
    } catch (error) {
      console.error('Error getting M-Pesa access token:', {
        error: error.message,
        response: error.response?.data,
        config: error.config
          ? {
              url: error.config.url,
              headers: error.config.headers,
            }
          : null,
      })
      throw new Error(`Failed to get M-Pesa access token: ${error.message}`)
    }
  }

  async registerUrls() {
    try {
      // Skip if already registered
      if (this.urlsRegistered) {
        console.log('URLs already registered, skipping registration')
        return { alreadyRegistered: true }
      }

      console.log('Registering M-Pesa URLs...')
      console.log('Validation URL:', this.validationUrl)
      console.log('Confirmation URL:', this.confirmationUrl)

      const token = await this.getAccessToken()

      const response = await axios.post(
        `${this.baseUrl}/mpesa/c2b/v1/registerurl`,
        {
          ShortCode: this.shortCode,
          ResponseType: 'Completed',
          ConfirmationURL: this.confirmationUrl,
          ValidationURL: this.validationUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      )

      this.urlsRegistered = true
      console.log('Successfully registered M-Pesa URLs:', response.data)
      return response.data
    } catch (error) {
      console.error('Error registering M-Pesa URLs:', {
        error: error.message,
        response: error.response?.data,
        config: error.config
          ? {
              url: error.config.url,
              data: error.config.data,
              headers: error.config.headers,
            }
          : null,
      })
      // Continue with payment simulation even if URL registration fails
      console.log(
        'Continuing with payment simulation despite URL registration failure'
      )
      return { error: 'URL registration failed, but continuing with payment' }
    }
  }

  generateTimestamp() {
    const now = new Date()
    return (
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0')
    )
  }

  generatePassword(timestamp) {
    return Buffer.from(this.shortCode + this.passkey + timestamp).toString(
      'base64'
    )
  }

  async simulatePayment(phoneNumber, amount) {
    try {
      console.log('Initiating M-Pesa payment simulation...')
      console.log('Phone:', phoneNumber)
      console.log('Amount:', amount)

      const token = await this.getAccessToken()

      // Try to register URLs but don't let it block the payment
      await this.registerUrls().catch((err) => {
        console.log(
          'URL registration failed, continuing with payment:',
          err.message
        )
      })

      // Format phone number (ensure it starts with 254)
      const formattedPhone = phoneNumber.replace(/^0/, '254')
      if (!formattedPhone.startsWith('254')) {
        throw new Error('Phone number must start with 254')
      }

      const payload = {
        ShortCode: this.shortCode,
        CommandID: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        Msisdn: formattedPhone,
        BillRefNumber: 'TEST',
      }

      console.log('Sending payment request with payload:', payload)

      const response = await axios.post(
        `${this.baseUrl}/mpesa/c2b/v1/simulate`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000, // 15 second timeout
        }
      )

      console.log('Payment simulation successful:', response.data)
      return response.data
    } catch (error) {
      console.error('Error simulating M-Pesa payment:', {
        error: error.message,
        response: error.response?.data,
        config: error.config
          ? {
              url: error.config.url,
              data: error.config.data,
              headers: error.config.headers,
            }
          : null,
      })

      // Enhance error message based on the type of error
      let errorMessage = 'Failed to simulate M-Pesa payment'
      if (error.response?.data?.errorMessage) {
        errorMessage = error.response.data.errorMessage
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Payment request timed out'
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Could not connect to M-Pesa service'
      }

      throw new Error(errorMessage)
    }
  }

  async validateTransaction(transactionData) {
    try {
      // Basic validation
      if (
        !transactionData.TransID ||
        !transactionData.TransAmount ||
        !transactionData.BusinessShortCode
      ) {
        return {
          ResultCode: 'C2B00014',
          ResultDesc: 'Missing required fields',
        }
      }

      // Validate business short code
      if (transactionData.BusinessShortCode !== this.shortCode) {
        return {
          ResultCode: 'C2B00015',
          ResultDesc: 'Invalid business short code',
        }
      }

      return {
        ResultCode: '0',
        ResultDesc: 'Accepted',
      }
    } catch (error) {
      console.error('Error validating transaction:', error)
      return {
        ResultCode: 'C2B00016',
        ResultDesc: 'Internal server error',
      }
    }
  }

  async handleConfirmation(transactionData) {
    try {
      // Log the confirmation
      console.log('M-Pesa confirmation received:', transactionData)

      // Here you would typically:
      // 1. Update order status
      // 2. Send confirmation to user
      // 3. Update transaction records

      return {
        ResultCode: 0,
        ResultDesc: 'Confirmation received successfully',
      }
    } catch (error) {
      console.error('Error handling confirmation:', error)
      return {
        ResultCode: 1,
        ResultDesc: 'Failed to process confirmation',
      }
    }
  }
}

const mpesaService = new MpesaService()
module.exports = { mpesaService }
