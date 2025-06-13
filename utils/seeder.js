
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { users, products } = require('../data/sampleData');
const User = require('../models/userModel');
const Product = require('../models/productModel');
const Order = require('../models/orderModel');
const Cart = require('../models/cartModel');

dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected for seeding data'))
  .catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

const importData = async () => {
  try {
    // Clear all collections
    await User.deleteMany();
    await Product.deleteMany();
    await Order.deleteMany();
    await Cart.deleteMany();
    
    // Import users
    const createdUsers = await User.insertMany(users);
    const adminUser = createdUsers[0]._id;
    
    // Add admin user ID to products
    const sampleProducts = products.map(product => {
      return { ...product, user: adminUser };
    });
    
    // Import products
    await Product.insertMany(sampleProducts);
    
    console.log('Data imported successfully!');
    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const destroyData = async () => {
  try {
    // Clear all collections
    await User.deleteMany();
    await Product.deleteMany();
    await Order.deleteMany();
    await Cart.deleteMany();
    
    console.log('Data destroyed successfully!');
    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

// Check command line argument to determine action
if (process.argv[2] === '-d') {
  destroyData();
} else {
  importData();
}
