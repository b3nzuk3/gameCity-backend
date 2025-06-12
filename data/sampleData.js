
const bcrypt = require('bcryptjs');

const users = [
  {
    name: 'Admin User',
    email: 'admin@greenbits.com',
    password: bcrypt.hashSync('admin123', 10),
    isAdmin: true
  },
  {
    name: 'John Doe',
    email: 'john@example.com',
    password: bcrypt.hashSync('123456', 10),
    isAdmin: false
  },
  {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: bcrypt.hashSync('123456', 10),
    isAdmin: false
  }
];

const products = [
  {
    name: 'Gaming Monitor 27"',
    image: '/images/monitor.jpg',
    description: 'High-quality gaming monitor with 144Hz refresh rate',
    brand: 'TechBrand',
    category: 'monitors',
    price: 299.99,
    countInStock: 10,
    rating: 4.5,
    numReviews: 12
  },
  {
    name: 'Gaming Mouse',
    image: '/images/mouse.jpg',
    description: 'Precision gaming mouse with adjustable DPI',
    brand: 'GamerGear',
    category: 'accessories',
    price: 49.99,
    countInStock: 7,
    rating: 4.0,
    numReviews: 8
  },
  {
    name: 'RGB Mechanical Keyboard',
    image: '/images/keyboard.jpg',
    description: 'Mechanical keyboard with customizable RGB lighting',
    brand: 'GamerGear',
    category: 'accessories',
    price: 129.99,
    countInStock: 5,
    rating: 4.8,
    numReviews: 15
  },
  {
    name: 'Gaming PC - Pro Edition',
    image: '/images/pc.jpg',
    description: 'High-performance gaming PC with RTX graphics',
    brand: 'GreenBits',
    category: 'pc-building',
    price: 1299.99,
    countInStock: 3,
    rating: 5.0,
    numReviews: 7
  },
  {
    name: 'SSD 1TB',
    image: '/images/ssd.jpg',
    description: 'Fast solid state drive with 1TB storage',
    brand: 'DataStore',
    category: 'components',
    price: 159.99,
    countInStock: 15,
    rating: 4.6,
    numReviews: 22
  }
];

module.exports = { users, products };
