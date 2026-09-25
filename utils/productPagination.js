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

module.exports = { stableProductSort }