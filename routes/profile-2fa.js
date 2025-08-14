const express = require('express');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');

// 2FA Setup
router.post('/2fa/setup', auth, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: 'Smart Environment Monitor' });
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    // Store temp secret in session or user doc (not enabled yet)
    req.user.profile.temp2FASecret = secret.base32;
    await req.user.save();
    res.json({ qr, secret: secret.base32 });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate 2FA secret' });
  }
});

// 2FA Verify
router.post('/2fa/verify', auth, async (req, res) => {
  const { code, secret } = req.body;
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: code,
    window: 1
  });
  if (verified) {
    return res.json({ success: true });
  }
  res.status(400).json({ success: false, message: 'Invalid code' });
});

// 2FA Enable
router.post('/2fa/enable', auth, async (req, res) => {
  try {
    req.user.profile.twoFAEnabled = true;
    req.user.profile.twoFASecret = req.body.secret;
    req.user.profile.temp2FASecret = undefined;
    await req.user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to enable 2FA' });
  }
});

// 2FA Disable
router.post('/2fa/disable', auth, async (req, res) => {
  try {
    req.user.profile.twoFAEnabled = false;
    req.user.profile.twoFASecret = undefined;
    await req.user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to disable 2FA' });
  }
});

module.exports = router;
