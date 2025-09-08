const axios = require('axios')

const testMpesaPayment = async () => {
  try {
    console.log('Testing M-Pesa payment...')

    const response = await axios.post(
      'http://localhost:5001/api/mpesa/test-payment',
      {
        phoneNumber: '254708374149', // Test phone number for successful transactions
        amount: 100, // Amount between 10-150000
      }
    )

    console.log('Response:', response.data)
  } catch (error) {
    console.error('Error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    })
  }
}

testMpesaPayment()
