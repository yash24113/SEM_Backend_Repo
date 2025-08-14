const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const { sendEmail } = require('../utils/emailService');
const { generateSystemMetricsPDF } = require('../utils/pdfService');
const EnvironmentData = require('../models/EnvironmentData');

/**
 * @route   POST /api/alerts/send
 * @desc    Send an alert email to the logged-in user
 * @access  Private
 */
router.post(
  '/send',
  auth,
  [
    body('message')
      .optional()
      .isString()
      .withMessage('Message must be a string')
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Get user from auth middleware (already verified)
      const user = await User.findById(req.user._id).select('-password');
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Get latest environment data for PDF
      const latestData = await EnvironmentData.findOne()
        .sort({ timestamp: -1 })
        .lean();

      // Generate PDF with live data
      const pdfBuffer = await generateSystemMetricsPDF({
        companyName: 'Smart Environment Monitor',
        metrics: {
          ...latestData,
          timestamp: latestData?.timestamp || new Date(),
          deviceId: latestData?.deviceId || 'Unknown',
          deviceManufacturer: 'Smart Environment Monitor',
          deviceModel: 'SEM-1000',
          isOnline: true,
          networkType: 'WiFi'
        },
        companyLogoPath: null // Add path to your logo if available
      });

      // Prepare email content with PDF attachment
      const emailData = {
        to: user.email,
        subject: '🔔 Smart Environment Monitor - Alert Notification',
        text: `Hello ${user.name || 'there'},\n\n` +
          `You have received an alert from your Smart Environment Monitor system.\n\n` +
          `Alert Details:\n` +
          `- Time: ${new Date().toLocaleString()}\n` +
          `- Message: ${req.body.message || 'Alert triggered from chatbot'}\n\n` +
          `Please find attached the latest environment data report.\n\n` +
          `This is an automated message. Please do not reply to this email.\n\n` +
          `Best regards,\nSmart Environment Monitor Team`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1976d2;">🔔 Smart Environment Monitor - Alert Notification</h2>
            <p>Hello ${user.name || 'there'},</p>
            <p>You have received an alert from your Smart Environment Monitor system.</p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">Alert Details:</h3>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Message:</strong> ${req.body.message || 'Alert triggered from chatbot'}</p>
            </div>
            
            <p>Please find attached the latest environment data report.</p>
            
            <p>This is an automated message. Please do not reply to this email.</p>
            
            <p>Best regards,<br>Smart Environment Monitor Team</p>
            
            <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #777;">
              <p>If you did not request this alert, please secure your account immediately.</p>
            </div>
          </div>
        `,
        attachments: [
          {
            filename: `environment-report-${new Date().toISOString().split('T')[0]}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      };

      // Send the email with PDF attachment
      const emailResult = await sendEmail(emailData);

      if (!emailResult.success) {
        console.error('Failed to send alert email:', emailResult.error);
        return res.status(500).json({
          success: false,
          message: 'Failed to send alert email',
          error: process.env.NODE_ENV === 'development' ? emailResult.error : undefined
        });
      }

      console.log(`Alert email sent to ${user.email}`, { messageId: emailResult.messageId });
      res.status(200).json({ 
        success: true,
        message: 'Alert email sent successfully',
        email: user.email,
        messageId: emailResult.messageId
      });
      
    } catch (error) {
      console.error('Error in alert route:', error);
      
      // More specific error handling
      let errorMessage = 'Server error';
      let statusCode = 500;
      
      if (error.name === 'ValidationError') {
        statusCode = 400;
        errorMessage = 'Validation error';
      }
      
      res.status(statusCode).json({ 
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;
