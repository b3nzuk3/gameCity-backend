process.env.NODE_ENV = 'test'
const test = require('node:test')
const assert = require('node:assert/strict')
const Homepage = require('../models/homepageModel')
const { DEFAULT_HERO, adminResponse, publicResponse, updateHero, validateHeroPayload } = require('../controllers/homepageController')

test('hydrated hero serialization preserves every saved field and excludes Mongoose internals', () => {
  const hero = { eyebrow: 'New collection', title: 'Custom title', highlightText: 'Custom', description: 'Custom description', primaryCtaLabel: 'Browse', primaryCtaHref: '/category/monitors', secondaryCtaLabel: '', secondaryCtaHref: '', imageUrl: 'https://example.com/custom.webp', imageAlt: 'Custom image', enabled: true }
  const homepage = Homepage.hydrate({ key: 'default', hero, sections: [] })
  assert.deepEqual(adminResponse(homepage).hero, hero)
  assert.deepEqual(publicResponse(homepage).hero, hero)
  homepage.hero.enabled = false
  assert.equal(adminResponse(homepage).hero.enabled, false)
  assert.equal(publicResponse(homepage).hero, null)
})

test('partial hero update preserves persisted fields and returns the saved config', async (t) => {
  const savedHero = { ...DEFAULT_HERO, description: 'Previously saved description', imageUrl: 'https://example.com/saved.webp', secondaryCtaLabel: '', secondaryCtaHref: '' }
  const homepage = Homepage.hydrate({ key: 'default', hero: savedHero, sections: [] })
  t.mock.method(Homepage, 'findOneAndUpdate', async () => homepage)
  let saved
  t.mock.method(homepage, 'save', async () => { saved = homepage.hero.toObject(); return homepage })
  t.mock.method(homepage, 'populate', async () => homepage)
  let response
  await updateHero({ body: { title: 'Updated title' } }, { json: (body) => { response = body } }, (error) => { throw error })
  const expected = { ...savedHero, title: 'Updated title' }
  assert.deepEqual(saved, expected)
  assert.deepEqual(response.hero, expected)
})

test('empty optional secondary CTA link is accepted but primary link and unsafe secondary links are rejected', () => {
  assert.deepEqual(validateHeroPayload({ secondaryCtaLabel: '', secondaryCtaHref: '' }), { secondaryCtaLabel: '', secondaryCtaHref: '' })
  assert.throws(() => validateHeroPayload({ primaryCtaHref: '' }), /primaryCtaHref/)
  assert.throws(() => validateHeroPayload({ secondaryCtaHref: 'javascript:alert(1)' }), /secondaryCtaHref/)
})
