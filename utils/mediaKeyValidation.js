const OWNED_MEDIA_KEY_PATTERN = /^greenbits-store\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:webp|png|jpe?g|gif|avif)$/i

function isOwnedMediaKey(key) {
  return typeof key === 'string' && key.length <= 512 && OWNED_MEDIA_KEY_PATTERN.test(key)
}

module.exports = { OWNED_MEDIA_KEY_PATTERN, isOwnedMediaKey }
