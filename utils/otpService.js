const otpGenerator = require('otp-generator');
const nodemailer = require('nodemailer');

// Store OTPs temporarily (in production, use Redis or another suitable storage)
const otpStore = new Map();

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.EMAIL_PASS
  }
});

// Generate 4-digit numeric OTP (digits only)
const generateOTP = () => {
  return otpGenerator.generate(4, {
    digits: true,
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Verification Code for Smart Environment Monitor',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Email Verification</h2>
        <p>Your verification code is:</p>
        <h1 style="font-size: 36px; letter-spacing: 5px; color: #4CAF50;">${otp}</h1>
        <p>This code will expire in 5 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Store OTP with expiration
const storeOTP = (email, otp, type) => {
  const expiration = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(email, {
    otp,
    expiration,
    type
  });
};

// Verify OTP
const verifyOTP = (email, otp, type) => {
  const storedData = otpStore.get(email);
  
  if (!storedData) {
    return false;
  }

  if (Date.now() > storedData.expiration) {
    otpStore.delete(email);
    return false;
  }

  if (storedData.otp !== otp || storedData.type !== type) {
    return false;
  }

  otpStore.delete(email);
  return true;
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  storeOTP,
  verifyOTP
};
