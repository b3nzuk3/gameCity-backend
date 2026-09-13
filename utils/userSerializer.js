const SAFE_USER_FIELDS = [
  'id',
  'name',
  'email',
  'isAdmin',
  'joinDate',
  'createdAt',
  'updatedAt',
]

function toPlainUser(user) {
  if (!user) return null
  if (typeof user.toObject === 'function') return user.toObject()
  return user
}

function serializeUser(user) {
  const source = toPlainUser(user)
  if (!source) return null

  const id = source.id ?? source._id
  const serialized = {
    id: id === undefined || id === null ? undefined : String(id),
    name: source.name,
    email: source.email,
    isAdmin: Boolean(source.isAdmin),
    joinDate: source.joinDate,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  }

  return Object.fromEntries(
    SAFE_USER_FIELDS
      .filter((field) => serialized[field] !== undefined)
      .map((field) => [field, serialized[field]])
  )
}

function serializeUsers(users) {
  return users.map(serializeUser).filter(Boolean)
}

module.exports = { SAFE_USER_FIELDS, serializeUser, serializeUsers }
