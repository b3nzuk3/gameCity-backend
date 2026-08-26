const normalizeBrands = (brands) => {
  const values = Array.isArray(brands) ? brands : brands ? [brands] : []
  return values
    .flatMap((brand) => String(brand).split(','))
    .map((brand) => brand.trim())
    .filter(Boolean)
}

const parsePrice = (value) => {
  if (value === undefined || value === null || value === '') return null
  const price = Number(value)
  return Number.isFinite(price) && price >= 0 ? price : null
}

const buildProductFilterQuery = ({
  filterBy,
  condition,
  brands,
  minPrice,
  maxPrice,
} = {}) => {
  const query = {}

  if (filterBy === 'in-stock') query.countInStock = { $gt: 0 }
  if (filterBy === 'low-stock') query.countInStock = { $gt: 0, $lte: 5 }
  if (filterBy === 'out-of-stock') query.countInStock = 0

  if (condition === 'New' || condition === 'Pre-Owned') {
    query.condition = condition
  }

  const selectedBrands = normalizeBrands(brands)
  if (selectedBrands.length > 0) query.brand = { $in: selectedBrands }

  const parsedMinimum = parsePrice(minPrice)
  const parsedMaximum = parsePrice(maxPrice)
  if (parsedMinimum !== null || parsedMaximum !== null) {
    query.price = {}
    if (parsedMinimum !== null) query.price.$gte = parsedMinimum
    if (parsedMaximum !== null) query.price.$lte = parsedMaximum
  }

  return query
}

module.exports = { buildProductFilterQuery }
