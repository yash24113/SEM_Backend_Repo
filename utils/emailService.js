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
        <p style="color:#444;">${message}</p>
        ${data ? `
        <table style="border-collapse: collapse; width: 100%; margin-top:12px;">
          <tbody>
            ${Object.entries(data).map(([k,v]) => `
              <tr>
                <td style="border:1px solid #eee;padding:8px;">${k}</td>
                <td style="border:1px solid #eee;padding:8px;">${v}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>` : ''}
        <p style="color:#999; font-size:12px;">This notification was generated automatically.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Alert email sending error:', error);
    return false;
  }
};

module.exports = { sendOTP, sendAlertEmail };
