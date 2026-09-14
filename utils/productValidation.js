const CONDITIONS = ['New', 'Pre-Owned']
const OFFER_TYPES = ['percentage', 'fixed']

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key)
}

function validateOffer(offer, price) {
  if (offer === undefined || offer === null) return null
  if (typeof offer !== 'object' || Array.isArray(offer)) return 'Offer must be an object'

  if (offer.type !== undefined && !OFFER_TYPES.includes(String(offer.type))) {
    return 'Offer type must be percentage or fixed'
  }

  if (offer.amount !== undefined) {
    const amount = Number(offer.amount)
    if (!Number.isFinite(amount) || amount < 0) return 'Offer amount must be a non-negative number'
    if (offer.type === 'percentage' && amount > 100) return 'Percentage offer must be between 0 and 100'
    if (offer.type === 'fixed' && Number.isFinite(Number(price)) && amount > Number(price)) {
      return 'Fixed offer cannot exceed the product price'
    }
  }

  const start = offer.startDate ? new Date(offer.startDate) : null
  const end = offer.endDate ? new Date(offer.endDate) : null
  if (start && Number.isNaN(start.getTime())) return 'Offer start date is invalid'
  if (end && Number.isNaN(end.getTime())) return 'Offer end date is invalid'
  if (start && end && end < start) return 'Offer end date cannot be before start date'

  return null
}

function validateProductPayload(payload, { partial = false, existing = {} } = {}) {
  const data = payload || {}
  const value = (key) => (hasOwn(data, key) ? data[key] : existing[key])
  const errors = {}

  if (!partial || hasOwn(data, 'name')) {
    if (typeof value('name') !== 'string' || !value('name').trim()) errors.name = 'Product name is required'
  }
  if (!partial || hasOwn(data, 'description')) {
    if (typeof value('description') !== 'string' || !value('description').trim()) errors.description = 'Description is required'
  }
  if (!partial || hasOwn(data, 'brand')) {
    if (typeof value('brand') !== 'string' || !value('brand').trim()) errors.brand = 'Brand is required'
  }
  if (!partial || hasOwn(data, 'category')) {
    if (typeof value('category') !== 'string' || !value('category').trim()) errors.category = 'Category is required'
  }
  if (!partial || hasOwn(data, 'condition')) {
    if (!CONDITIONS.includes(value('condition'))) errors.condition = 'Condition must be New or Pre-Owned'
  }

  if (!partial || hasOwn(data, 'price')) {
    const price = Number(value('price'))
    if (!Number.isFinite(price) || price < 0) errors.price = 'Price must be a non-negative number'
  }
  if (!partial || hasOwn(data, 'countInStock')) {
    const stock = Number(value('countInStock'))
    if (!Number.isInteger(stock) || stock < 0) errors.countInStock = 'Stock must be a non-negative integer'
  }

  const mainImage = hasOwn(data, 'image') ? data.image : existing.image
  const r2Image = hasOwn(data, 'image_r2') ? data.image_r2 : existing.image_r2
  if (!partial || hasOwn(data, 'image') || hasOwn(data, 'image_r2')) {
    if (!(typeof mainImage === 'string' && mainImage.trim()) && !(typeof r2Image === 'string' && r2Image.trim())) {
      errors.image = 'A primary product image is required'
    }
  }

  const offer = hasOwn(data, 'offer') ? data.offer : existing.offer
  const offerError = validateOffer(offer, value('price'))
  if (offerError) errors.offer = offerError

  return errors
}

function isValidProductPayload(payload, options) {
  return Object.keys(validateProductPayload(payload, options)).length === 0
}

module.exports = {
  CONDITIONS,
  OFFER_TYPES,
  hasOwn,
  validateOffer,
  validateProductPayload,
  isValidProductPayload,
}
