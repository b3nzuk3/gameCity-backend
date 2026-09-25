class InvalidProductFilterError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidProductFilterError'
    this.status = 400
    this.code = 'INVALID_PRODUCT_FILTER'
  }
}

const SPECIFICATION_FILTER_DEFINITIONS = {
  vram: ['Vram in GB'],
  gpuMemoryType: ['Memory type'],
  gpuFanCount: ['No. of fans'],
  videoOutputs: ['Video output ports'],
  screenSize: ['Size in Inches', 'Screen Size', 'Screen Size (inches)'],
  resolution: ['Resolution'],
  refreshRate: ['Refresh Rate'],
  monitorPorts: ['Ports'],
  cpuSocket: ['CPU Socket', 'Cpu socket'],
  cpuCores: ['CPU Cores'],
  cpuThreads: ['CPU Threads'],
  cpuSpeed: ['CPU Speed'],
  motherboardFormFactor: ['Form Factor'],
  motherboardMemoryType: ['Ram type'],
  ramSlots: ['Ram slots'],
  nvmeSlots: ['Nvme slots'],
  memorySpeed: ['Memory Speed'],
  memoryKitSize: ['No. of modules'],
  storageType: ['Type'],
  storageCapacity: ['Capacity', 'Storage', 'Storage (GB/TB)'],
  storageInterface: ['Interface'],
  wattage: ['Watts', 'Power supply wattage'],
  efficiencyRating: ['Power Rating', 'Psu rating'],
  psuFeatures: ['Special Features'],
  motherboardCompatibility: ['Motherboard Compatibility'],
  includedFans: ['No. Of fans included', 'No. of fans'],
  caseFanSize: ['Fan size'],
  caseFeatures: ['Special Features'],
  coolingType: ['Cooling method'],
  radiatorSize: ['Radiator size'],
  coolerFanSize: ['Fans size'],
  coolerFanCount: ['No. of fans'],
  coolerFeatures: ['Special Features'],
  color: ['Color'],
  laptopProcessor: ['Processor'],
  laptopGpu: ['Graphics Card'],
  laptopRam: ['RAM', 'RAM (GB)'],
}

const normalizeBrands = (brands) => {
  const values = Array.isArray(brands) ? brands : brands ? [brands] : []
  return values
    .flatMap((brand) => String(brand).split(','))
    .map((brand) => brand.trim())
    .filter(Boolean)
}

const normalizeValues = (value) => {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return values.map((item) => String(item).trim()).filter(Boolean)
}

const firstValue = (value) => normalizeValues(value)[0]

const parsePrice = (value) => {
  const scalar = firstValue(value)
  if (scalar === undefined || scalar === '') return null
  const price = Number(scalar)
  return Number.isFinite(price) && price >= 0 ? price : null
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const mapCategorySlug = (value, categoryMapping, { allowRaw = false } = {}) => {
  const rawValue = String(value).trim()
  const slug = rawValue.toLowerCase()
  if (categoryMapping && Object.prototype.hasOwnProperty.call(categoryMapping, slug)) {
    return categoryMapping[slug]
  }
  return allowRaw ? rawValue : null
}

const addSpecificationFilters = (query, params) => {
  // Product specifications are Mixed. Visible filters are therefore limited
  // to scalar string/number values and known aliases; arbitrary nested object
  // comparisons cannot be made exact through this public query contract.
  const clauses = []

  for (const [parameter, rawValues] of Object.entries(params)) {
    if (!parameter.startsWith('spec.')) continue
    const filterId = parameter.slice('spec.'.length)
    const keys = Object.prototype.hasOwnProperty.call(SPECIFICATION_FILTER_DEFINITIONS, filterId)
      ? SPECIFICATION_FILTER_DEFINITIONS[filterId]
      : undefined
    if (!keys) {
      throw new InvalidProductFilterError(`Unsupported specification filter: ${filterId}`)
    }

    const values = normalizeValues(rawValues)
    if (values.length === 0) continue

    const valueConditions = []
    for (const value of values) {
      const escapedValue = escapeRegex(value)
      const numericValue = Number(value)
      const exactNumericValue = Number.isFinite(numericValue)
        ? numericValue
        : undefined

      for (const key of keys) {
        const path = `specifications.${key}`
        // Frontend values are strings, but Mixed fields may contain numbers.
        // The anchored regex is exact for strings; numeric equality covers
        // numeric Mixed values without broadening the requested filter.
        valueConditions.push({
          [path]: { $regex: `^${escapedValue}$`, $options: 'i' },
        })
        if (exactNumericValue !== undefined) {
          valueConditions.push({ [path]: exactNumericValue })
        }
      }
    }

    clauses.push({ $or: valueConditions })
  }

  if (clauses.length > 0) query.$and = clauses
}

const buildProductFilterQuery = (params = {}, { categoryMapping = {}, category } = {}) => {
  const query = {}

  if (category !== undefined && category !== null && category !== 'all') {
    query.category = mapCategorySlug(category, categoryMapping, { allowRaw: true })
  } else {
    const requestedCategories = params.categories !== undefined
      ? normalizeValues(params.categories)
      : normalizeValues(params.category)
    if (requestedCategories.length > 0) {
      const mappedCategories = requestedCategories
        .filter((value) => value.toLowerCase() !== 'all')
        .map((value) => mapCategorySlug(value, categoryMapping))
        .filter(Boolean)
      const includesAll = requestedCategories.some((value) => value.toLowerCase() === 'all')
      if (!includesAll || mappedCategories.length > 0) {
        query.category = { $in: mappedCategories }
      }
    }
  }

  const search = firstValue(params.search)
  if (search) {
    const escapedSearch = escapeRegex(search)
    query.$or = [
      { name: { $regex: escapedSearch, $options: 'i' } },
      { description: { $regex: escapedSearch, $options: 'i' } },
      { brand: { $regex: escapedSearch, $options: 'i' } },
    ]
  }

  if (params.filterBy === 'in-stock') query.countInStock = { $gt: 0 }
  if (params.filterBy === 'low-stock') query.countInStock = { $gt: 0, $lte: 5 }
  if (params.filterBy === 'out-of-stock') query.countInStock = 0

  if (params.condition === 'New' || params.condition === 'Pre-Owned') {
    query.condition = params.condition
  }

  const selectedBrands = normalizeBrands(params.brands)
  if (selectedBrands.length > 0) query.brand = { $in: selectedBrands }

  const parsedMinimum = parsePrice(params.minPrice)
  const parsedMaximum = parsePrice(params.maxPrice)
  if (parsedMinimum !== null || parsedMaximum !== null) {
    query.price = {}
    if (parsedMinimum !== null) query.price.$gte = parsedMinimum
    if (parsedMaximum !== null) query.price.$lte = parsedMaximum
  }

  addSpecificationFilters(query, params)
  return query
}

module.exports = {
  InvalidProductFilterError,
  SPECIFICATION_FILTER_DEFINITIONS,
  buildProductFilterQuery,
  escapeRegex,
}
