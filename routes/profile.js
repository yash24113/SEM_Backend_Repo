const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/avatars';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Get user profile
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Middleware to check if 2FA is required
const require2FA = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    req.currentUser = user; // Store user in request for later use
    
    // If 2FA is not enabled, skip verification
    if (!user.profile?.twoFAEnabled) {
      return next();
    }

    // Check if 2FA code is provided and valid
    const { twoFACode } = req.body;
    if (!twoFACode) {
      return res.status(400).json({ 
        requires2FA: true,
        message: '2FA verification code is required' 
      });
    }

    // Verify 2FA code
    const speakeasy = require('speakeasy');
    const verified = speakeasy.totp.verify({
      secret: user.profile.twoFASecret,
      encoding: 'base32',
      token: twoFACode,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({ 
        requires2FA: true,
        message: 'Invalid 2FA verification code' 
      });
    }

    next();
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({ message: 'Error during 2FA verification' });
  }
};

// Update user profile
router.put('/', auth, [
  body('name').optional().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
  body('profile.bio').optional().isLength({ max: 500 }).withMessage('Bio must be less than 500 characters'),
  body('profile.location').optional().isLength({ max: 100 }).withMessage('Location must be less than 100 characters'),
  body('profile.preferences.temperatureUnit').optional().isIn(['celsius', 'fahrenheit']).withMessage('Invalid temperature unit'),
  body('profile.preferences.notifications').optional().isBoolean().withMessage('Notifications must be a boolean')
], require2FA, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updateFields = {};
    
    if (req.body.name) updateFields.name = req.body.name;
    if (req.body.phone) updateFields.phone = req.body.phone;
    if (req.body.profile) {
      updateFields.profile = { ...req.currentUser.profile, ...req.body.profile };
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateFields,
      { new: true, runValidators: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload avatar
router.post('/avatar', auth, upload.single('avatar'), require2FA, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Delete old avatar if exists
    if (req.user.profile.avatar && req.user.profile.avatar !== '') {
      const oldAvatarPath = path.join(__dirname, '..', req.user.profile.avatar);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    // Update user with new avatar path
    const avatarPath = `uploads/avatars/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 'profile.avatar': avatarPath },
      { new: true }
    ).select('-password');

    res.json({
      message: 'Avatar uploaded successfully',
      avatar: avatarPath,
      user
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Change password
router.put('/password', auth, require2FA, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isMatch = await req.user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    req.user.password = newPassword;
    await req.user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete account
router.delete('/', auth, async (req, res) => {
  try {
    // Delete avatar if exists
    if (req.user.profile.avatar && req.user.profile.avatar !== '') {
      const avatarPath = path.join(__dirname, '..', req.user.profile.avatar);
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }

    await User.findByIdAndDelete(req.user._id);
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Serve avatar files
router.get('/avatar/:filename', (req, res) => {
  const filePath = path.join(__dirname, '..', 'uploads', 'avatars', req.params.filename);
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ message: 'Avatar not found' });
  }
});

module.exports = router;
