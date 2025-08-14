const express = require('express');
const router = express.Router();
const speakeasy = require('speakeasy');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// POST /api/auth/2fa/verify-login
router.post('/2fa/verify-login', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ message: 'Missing email or code' });
  try {
    const user = await User.findOne({ email });
    if (!user || !user.profile.twoFAEnabled || !user.profile.twoFASecret) {
      return res.status(400).json({ message: '2FA not enabled' });
    }
    const verified = speakeasy.totp.verify({
      secret: user.profile.twoFASecret,
      encoding: 'base32',
      token: code,
      window: 1
    });
    if (!verified) return res.status(400).json({ message: 'Invalid code' });
    // Generate JWT token consistent with auth middleware payload
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: user.getPublicProfile() });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
