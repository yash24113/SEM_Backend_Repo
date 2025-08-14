const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { generateOTP, sendOTPEmail, storeOTP, verifyOTP } = require('../utils/otpService');
const { savePendingRegistration, getPendingRegistration, deletePendingRegistration } = require('../utils/registrationStore');

// Verify OTP
router.post('/verify-otp', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('otp')
    .isLength({ min: 4, max: 4 }).withMessage('Invalid OTP')
    .isNumeric().withMessage('OTP must be numeric'),
  body('type').isIn(['register', 'login']).withMessage('Invalid type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp, type } = req.body;

    // Verify OTP
    if (!verifyOTP(email, otp, type)) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // If verifying registration, build user from pending store if not yet created
    let user = await User.findOne({ email });
    if (type === 'register' && !user) {
      const pending = getPendingRegistration(email);
      if (!pending) {
        return res.status(404).json({ message: 'Registration data not found or expired' });
      }
      user = new User({
        name: pending.name,
        email: pending.email,
        password: pending.password,
        phone: pending.phone,
        isVerified: true,
      });
      await user.save();
      deletePendingRegistration(email);
    } else if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (type === 'register') {
      user.isVerified = true;
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({
      token,
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Resend OTP
router.post('/resend-otp', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('type').isIn(['register', 'login']).withMessage('Invalid type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, type } = req.body;

    // Generate and send new OTP
    const otp = generateOTP();
    await sendOTPEmail(email, otp);
    storeOTP(email, otp, type);

    res.json({ message: 'OTP resent successfully' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Register user (defer DB write until OTP verification)
router.post('/register', [
  body('name').isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, phone } = req.body;

    // Check if user already exists in DB
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Save pending registration in memory (password will be hashed on final save)
    savePendingRegistration(email, { name, email, password, phone });

    // Generate and send OTP
    const otp = generateOTP();
    await sendOTPEmail(email, otp);
    storeOTP(email, otp, 'register');

    res.status(201).json({
      message: 'Registration successful. Please verify your email.',
      email,
      requiresOTP: true
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login user (OTP or 2FA required)
router.post('/login', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Validate password is provided
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // If not verified, request registration verification via OTP first
    if (!user.isVerified) {
      const otp = generateOTP();
      await sendOTPEmail(email, otp);
      storeOTP(email, otp, 'register');
      return res.status(200).json({
        message: 'Please verify your email. Verification code sent.',
        email,
        requiresOTP: true,
        type: 'register'
      });
    }

    // If 2FA is enabled, do not send OTP, just return user info for 2FA modal
    if (user.profile.twoFAEnabled) {
      return res.json({
        message: '2FA enabled',
        user: user.getPublicProfile(),
        requires2FA: true
      });
    }

    // For verified users without 2FA, send login OTP
    const otp = generateOTP();
    await sendOTPEmail(email, otp);
    storeOTP(email, otp, 'login');
    return res.json({
      message: 'OTP sent to your email',
      email,
      requiresOTP: true,
      type: 'login'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Logout user (client-side token removal, but we can track here)
router.post('/logout', auth, async (req, res) => {
  try {
    // In a more complex system, you might want to blacklist the token
    // For now, we'll just return success
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    res.json({
      user: req.user.getPublicProfile()
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify token
router.get('/verify', auth, async (req, res) => {
  try {
    res.json({
      valid: true,
      user: req.user.getPublicProfile()
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ valid: false, message: 'Invalid token' });
  }
});

// Forgot password
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Please enter a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // In a real application, you would send an email here
    // For demo purposes, we'll just return the token
    res.json({
      message: 'Password reset email sent',
      resetToken // Remove this in production
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset password
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, newPassword } = req.body;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(400).json({ message: 'Invalid reset token' });
    }

    if (user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({ message: 'Reset token has expired' });
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
