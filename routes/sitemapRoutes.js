const express = require('express')
const router = express.Router()
const Product = require('../models/productModel')

// Generate XML sitemap
router.get('/sitemap.xml', async (req, res) => {
  try {
    // Set proper XML content type
    res.set('Content-Type', 'application/xml')

    // Fetch all products
    const products = await Product.find({}).lean()

    const baseUrl = 'https://www.gamecityelectronics.com'
    const currentDate = new Date().toISOString()

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`

    // Homepage
    xml += `
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`

    // Get unique categories
    const categories = [
      ...new Set(products.map((p) => p.category).filter(Boolean)),
    ]

    // Category pages
    categories.forEach((category) => {
      const categorySlug = category.toLowerCase().replace(/\s+/g, '-')
      xml += `
  <url>
    <loc>${baseUrl}/category/${categorySlug}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
    })

    // Individual product pages
    products.forEach((product) => {
      const lastmod = product.updatedAt
        ? new Date(product.updatedAt).toISOString()
        : product.createdAt
        ? new Date(product.createdAt).toISOString()
        : currentDate

      // Generate SEO-friendly slug
      const slug = product.name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .concat('-nairobi')

      const productUrl = `/product/${slug}`

      xml += `
  <url>
    <loc>${baseUrl}${productUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`
    })

    // Static pages
    const staticPages = [
      { url: '/search', priority: '0.7' },
      { url: '/contact', priority: '0.6' },
      { url: '/build-pc', priority: '0.7' },
      { url: '/privacy', priority: '0.3' },
      { url: '/terms', priority: '0.3' },
    ]

    staticPages.forEach((page) => {
      xml += `
  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${page.priority}</priority>
  </url>`
    })

    xml += `
</urlset>`

    res.send(xml)
  } catch (error) {
    console.error('Error generating sitemap:', error)
    res.status(500).send('Error generating sitemap')
  }
})

module.exports = router
