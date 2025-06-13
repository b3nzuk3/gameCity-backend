
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const Product = require('../models/productModel');

const migrateUsers = async (usersData) => {
  const users = JSON.parse(usersData);
  
  for (const user of users) {
    const existingUser = await User.findOne({ email: user.email });
    
    if (!existingUser) {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(user.password, salt);
      
      await User.create({
        name: user.name,
        email: user.email,
        password: hashedPassword,
        isAdmin: user.isAdmin || false,
        joinDate: user.joinDate || new Date(),
        addresses: user.addresses || []
      });
    }
  }
  
  console.log('Users migration completed');
};

const migrateProducts = async (productsData) => {
  const products = JSON.parse(productsData);
  
  for (const product of products) {
    const existingProduct = await Product.findOne({ name: product.name });
    
    if (!existingProduct) {
      await Product.create({
        name: product.name,
        image: product.image,
        description: product.description || 'No description available',
        brand: product.brand || 'Unknown',
        category: product.category || 'Other',
        price: product.price,
        countInStock: product.countInStock || 10,
        rating: product.rating || 0,
        numReviews: product.numReviews || 0
      });
    }
  }
  
  console.log('Products migration completed');
};

module.exports = {
  migrateUsers,
  migrateProducts
};
