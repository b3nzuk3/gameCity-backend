
const express = require('express');
const router = express.Router();
const {
  authUser,
  registerUser,
  getUserProfile,
  updateUserProfile,
  addUserAddress,
  getUsers
} = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/').post(registerUser).get(protect, admin, getUsers);
router.post('/login', authUser);
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);
router.route('/address').post(protect, addUserAddress);

module.exports = router;
