
const Cart = require('../models/cartModel');
const Product = require('../models/productModel');

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      // Create a new cart if one doesn't exist
      cart = await Cart.create({
        user: req.user._id,
        cartItems: []
      });
    }
    
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
const addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    
    // Find the product
    const product = await Product.findById(productId);
    
    if (!product) {
      res.status(404);
      throw new Error('Product not found');
    }
    
    // Find user's cart
    let cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      // Create a new cart if one doesn't exist
      cart = await Cart.create({
        user: req.user._id,
        cartItems: []
      });
    }
    
    // Check if item already exists in cart
    const itemIndex = cart.cartItems.findIndex(
      item => item.product.toString() === productId
    );
    
    if (itemIndex > -1) {
      // Item exists, update quantity
      cart.cartItems[itemIndex].quantity += quantity;
    } else {
      // Item doesn't exist, add new item
      cart.cartItems.push({
        product: productId,
        name: product.name,
        image: product.image,
        price: product.price,
        quantity
      });
    }
    
    await cart.save();
    
    res.status(201).json(cart);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update cart item quantity
// @route   PUT /api/cart/:id
// @access  Private
const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const productId = req.params.id;
    
    // Find user's cart
    const cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }
    
    // Find the item
    const itemIndex = cart.cartItems.findIndex(
      item => item.product.toString() === productId
    );
    
    if (itemIndex === -1) {
      res.status(404);
      throw new Error('Item not found in cart');
    }
    
    // Update quantity
    if (quantity > 0) {
      cart.cartItems[itemIndex].quantity = quantity;
    } else {
      // Remove the item if quantity is 0 or negative
      cart.cartItems.splice(itemIndex, 1);
    }
    
    await cart.save();
    
    res.json(cart);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/:id
// @access  Private
const removeFromCart = async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Find user's cart
    const cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }
    
    // Remove the item
    cart.cartItems = cart.cartItems.filter(
      item => item.product.toString() !== productId
    );
    
    await cart.save();
    
    res.json(cart);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
const clearCart = async (req, res) => {
  try {
    // Find user's cart
    const cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }
    
    // Clear cart items
    cart.cartItems = [];
    
    await cart.save();
    
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart
};
