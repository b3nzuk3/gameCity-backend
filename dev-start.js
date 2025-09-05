// Development startup script
// This ensures NODE_ENV is set before loading environment variables

process.env.NODE_ENV = 'development'

// Now load the environment variables
require('dotenv').config({
  path: require('path').join(__dirname, '.env.development'),
})

// Start the server
require('./index.js')
