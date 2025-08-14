const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Accept self-signed certificates
  },
});

const sendOTP = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Admin Panel Login OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; text-align: center;">Admin Panel Login</h2>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #666;">Your OTP for admin panel login is:</p>
          <h1 style="color: #007bff; text-align: center; font-size: 32px; margin: 20px 0;">${otp}</h1>
          <p style="margin: 0; color: #666; font-size: 14px;">This OTP will expire in 5 minutes.</p>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center;">
          If you didn't request this OTP, please ignore this email.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Email sending error:", error);
    return false;
  }
};

const sendAlertEmail = async ({ to, subject, message, data }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        <h2 style="color:#333;">${subject}</h2>
        <p style="color:#666;">${message}</p>
        ${
          data
            ? `<div style="margin-top:20px;padding:15px;background:#f5f5f5;border-radius:5px;">
                 <h3 style="margin-top:0;">Alert Details:</h3>
                 ${Object.entries(data)
                   .map(
                     ([key, value]) =>
                       `<p style="margin:5px 0;"><strong>${key}:</strong> ${value}</p>`
                   )
                   .join('')}
               </div>`
            : ''
        }
        <p style="margin-top:30px;color:#999;font-size:12px;">
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Failed to send alert email:', error);
    return false;
  }
};

// Generic email sending function with attachment support
const sendEmail = async ({ to, subject, text, html, attachments }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html,
    attachments: attachments || []
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.code,
      response: error.response,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
};

module.exports = { 
  sendOTP, 
  sendAlertEmail, 
  sendEmail,
  transporter 
};
