const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const SystemMetrics = require('../models/SystemMetrics');
const { evaluateAndFilterSystem } = require('../utils/edgeProcessor');
const { sendAlertEmail } = require('../utils/emailService');
const User = require('../models/User');
const { generateSystemMetricsPDF } = require('../utils/pdfService');
const path = require('path');
const fs = require('fs');

function resolveCompanyLogoPath() {
  if (process.env.COMPANY_LOGO_PATH) {
    const p = path.resolve(process.env.COMPANY_LOGO_PATH);
    if (fs.existsSync(p)) return p;
  }
  // User-provided absolute path (Windows)
  const winPath = 'M:\\smart-environment-monitor\\SEM_Frontend\\public\\logo.jpg';
  if (fs.existsSync(winPath)) return winPath;
  // Repo-relative fallback
  const repoPath = path.resolve(__dirname, '..', '..', 'SEM_Frontend', 'public', 'logo.jpg');
  if (fs.existsSync(repoPath)) return repoPath;
  return undefined;
}

// POST /api/system/metrics - ingest system metrics (from laptop agent)
router.post('/metrics', [
  body('deviceId').notEmpty(),
  body('batteryPercent').optional().isFloat({ min: 0, max: 100 }),
  body('isCharging').optional().isBoolean(),
  body('cpuLoadPercent').optional().isFloat({ min: 0, max: 100 }),
  body('uptimeSeconds').optional().isFloat({ min: 0 }),
  body('isOnline').optional().isBoolean(),
  body('networkType').optional().isString(),
  body('volumePercent').optional().isFloat({ min: 0, max: 100 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const metrics = new SystemMetrics({ ...req.body, timestamp: new Date() });
    await metrics.save();

    // Emit to clients
    if (req.app.get('io')) {
      req.app.get('io').emit('systemMetrics', metrics);
    }

    // Edge alerts & emails
    try {
      const alerts = evaluateAndFilterSystem(metrics.toObject());
      if (alerts.length > 0) {
        const users = await User.find({ 'profile.preferences.notifications': true }).select('email name');
        const recipients = users.map(u => u.email).filter(Boolean);
        if (recipients.length > 0) {
          const subject = `System Alert (${metrics.deviceId}) - ${alerts.map(a => a.metric).join(', ')}`;
          const message = `System thresholds triggered at ${new Date(metrics.timestamp).toLocaleString()} for device ${metrics.deviceId}. See attached report for details.`;
          const tableData = alerts.reduce((acc, a) => {
            acc[a.metric] = `${a.value} (threshold ${a.threshold})`;
            return acc;
          }, {});

          // Generate PDF attachment buffer
          const pdfBuffer = await generateSystemMetricsPDF({
            companyName: process.env.COMPANY_NAME || 'Smart Environment Monitor',
            companyLogoPath: resolveCompanyLogoPath(),
            metrics: metrics.toObject(),
          });

          // Send email with custom HTML and attachment (inline implementation to include attachment)
          const nodemailer = require('nodemailer');
          const transporter = require('../utils/emailService').transporter || nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_FROM, pass: process.env.EMAIL_PASS },
            tls: { rejectUnauthorized: false },
          });

          await Promise.all(recipients.map(async (to) => {
            await transporter.sendMail({
              from: process.env.EMAIL_FROM,
              to,
              subject,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
                  <h2 style="color:#333;">${subject}</h2>
                  <p style="color:#444;">${message}</p>
                  <table style="border-collapse:collapse;width:100%;margin-top:12px;">
                    <tbody>
                      ${Object.entries(tableData).map(([k,v]) => `
                        <tr>
                          <td style="border:1px solid #eee;padding:8px;">${k}</td>
                          <td style="border:1px solid #eee;padding:8px;">${v}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                  <p style="color:#999;font-size:12px;margin-top:8px;">A detailed PDF report is attached.</p>
                </div>
              `,
              attachments: [
                {
                  filename: `system-alert-${metrics.deviceId}-${Date.now()}.pdf`,
                  content: pdfBuffer,
                  contentType: 'application/pdf'
                }
              ]
            });
          }));
        }

        if (req.app.get('io')) {
          req.app.get('io').emit('systemAlerts', alerts);
        }
      }
    } catch (err) {
      console.error('System edge alert processing error:', err);
    }

    res.status(201).json(metrics);
  } catch (err) {
    console.error('Error saving system metrics:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/system/latest
router.get('/latest', async (req, res) => {
  try {
    const latest = await SystemMetrics.findOne().sort({ timestamp: -1 }).limit(1);
    if (!latest) return res.status(404).json({ message: 'No system metrics found' });
    res.json(latest);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/system/range?startDate=...&endDate=...&deviceId=...
router.get('/range', async (req, res) => {
  try {
    const { startDate, endDate, deviceId } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ message: 'Start date and end date are required' });
    const query = {
      timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) },
    };
    if (deviceId) query.deviceId = deviceId;
    const data = await SystemMetrics.find(query).sort({ timestamp: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
 
// BELOW: additional device utilities
// GET /api/system/devices - latest metrics per device
router.get('/devices', async (req, res) => {
  try {
    const SystemMetrics = require('../models/SystemMetrics');
    const latestPerDevice = await SystemMetrics.aggregate([
      { $sort: { deviceId: 1, timestamp: -1 } },
      {
        $group: {
          _id: '$deviceId',
          doc: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { deviceId: 1 } }
    ]);
    res.json(latestPerDevice);
  } catch (err) {
    console.error('Error fetching devices:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/system/command - send command to a device's agent via socket
router.post('/command', [
  body('deviceId').notEmpty(),
  body('command').isIn([
    'open-task-manager',
    'open-battery-settings',
    'open-brightness-settings',
    'open-sound-settings',
    'open-network-settings'
  ]).withMessage('Unsupported command')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { deviceId, command } = req.body;
    const io = req.app.get('io');
    if (io) {
      io.to(`device:${deviceId}`).emit('agentCommand', { command });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error sending command:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


