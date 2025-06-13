const { mpesaService } = require('../services/mpesaService')

/**
 * @typedef {Object} MpesaValidationRequest
 * @property {string} TransactionType
 * @property {string} TransID
 * @property {string} TransTime
 * @property {string} TransAmount
 * @property {string} BusinessShortCode
 * @property {string} BillRefNumber
 * @property {string} InvoiceNumber
 * @property {string} OrgAccountBalance
 * @property {string} ThirdPartyTransID
 * @property {string} MSISDN
 * @property {string} FirstName
 * @property {string} MiddleName
 * @property {string} LastName
 */

const validateMpesa = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ResultCode: 'C2B00013',
      ResultDesc: 'Method not allowed',
    })
  }

  try {
    // Basic validation of required fields
    const validation = req.body
    if (
      !validation.TransID ||
      !validation.TransAmount ||
      !validation.BusinessShortCode
    ) {
      return res.status(400).json({
        ResultCode: 'C2B00014',
        ResultDesc: 'Missing required fields',
      })
    }

    // Check if the BusinessShortCode matches our configuration
    const expectedShortCode = process.env.MPESA_BUSINESS_SHORT_CODE
    if (validation.BusinessShortCode !== expectedShortCode) {
      return res.status(400).json({
        ResultCode: 'C2B00015',
        ResultDesc: 'Invalid business short code',
      })
    }

    const validationResult = await mpesaService.validateTransaction(validation)
    res.status(200).json(validationResult)
  } catch (error) {
    console.error('M-Pesa validation error:', error)
    res.status(500).json({
      ResultCode: 'C2B00016',
      ResultDesc: 'Internal server error',
    })
  }
}

module.exports = {
  validateMpesa,
}
