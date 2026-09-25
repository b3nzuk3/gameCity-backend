function stableProductSort(sort = '-createdAt') {
  const fields = String(sort || '-createdAt')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
  const sortSpec = {}

  for (const field of fields) {
    const name = field.replace(/^[-+]/, '')
    if (!name) continue
    sortSpec[name] = field.startsWith('-') ? -1 : 1
  }

  if (Object.keys(sortSpec).length === 0) {
    sortSpec.createdAt = -1
  }
  if (!Object.prototype.hasOwnProperty.call(sortSpec, '_id')) {
    sortSpec._id = 1
  }
  return sortSpec
}

const PUBLIC_SORTS = {
  // Match the existing catalog's canonical URL precedence for equal names.
  name: 'name -_id',
  price: 'price',
  '-price': '-price',
  '-rating': '-rating',
  // Keep the existing frontend's sort values working while it migrates to
  // the API contract's directional values.
  'price-low': 'price',
  'price-high': '-price',
  rating: '-rating',
}

function publicProductSort(sort) {
  const requested = typeof sort === 'string' ? sort.trim() : ''
  return stableProductSort(PUBLIC_SORTS[requested] || '-createdAt')
}

module.exports = { stableProductSort, publicProductSort }