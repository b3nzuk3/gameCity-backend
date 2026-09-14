const express = require('express')
const { protect, admin } = require('../middleware/authMiddleware')
const {
  getPublicHomepage,
  getAdminHomepage,
  updateHero,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  updateSectionProducts,
} = require('../controllers/homepageController')

const router = express.Router()

router.get('/public/homepage', getPublicHomepage)
router.get('/admin/homepage', protect, admin, getAdminHomepage)
router.put('/admin/homepage/hero', protect, admin, updateHero)
router.post('/admin/homepage/sections', protect, admin, createSection)
router.put('/admin/homepage/sections/reorder', protect, admin, reorderSections)
router.put('/admin/homepage/sections/:id/products', protect, admin, updateSectionProducts)
router.put('/admin/homepage/sections/:id', protect, admin, updateSection)
router.delete('/admin/homepage/sections/:id', protect, admin, deleteSection)

module.exports = router
