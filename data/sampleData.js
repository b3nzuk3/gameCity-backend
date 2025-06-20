const bcrypt = require('bcryptjs')

const users = [
  {
    name: 'Admin User',
    email: 'admin@greenbits.com',
    password: bcrypt.hashSync('admin123', 10),
    isAdmin: true,
  },
  {
    name: 'John Doe',
    email: 'john@example.com',
    password: bcrypt.hashSync('123456', 10),
    isAdmin: false,
  },
  {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: bcrypt.hashSync('123456', 10),
    isAdmin: false,
  },
]

const products = []

module.exports = { users, products }
