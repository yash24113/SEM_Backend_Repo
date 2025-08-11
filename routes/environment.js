const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const EnvironmentData = require('../models/EnvironmentData');
const { auth, optionalAuth } = require('../middleware/auth');
const { evaluateAndFilter } = require('../utils/edgeProcessor');
const { sendAlertEmail } = require('../utils/emailService');
const User = require('../models/User');

// Get latest environment data
router.get('/latest', optionalAuth, async (req, res) => {
  try {
    console.log('Fetching latest environment data...');
    const latestData = await EnvironmentData.findOne()
      .sort({ timestamp: -1 })
      .limit(1);
    
    if (!latestData) {
      console.log('No environment data found');
      return res.status(404).json({ message: 'No environment data found' });
    }
    
    console.log('Latest data found:', latestData);
    res.json(latestData);
  } catch (error) {
    console.error('Error fetching latest data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get environment data with pagination
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    const data = await EnvironmentData.find()
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await EnvironmentData.countDocuments();
    
    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching environment data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get data by date range
router.get('/range', optionalAuth, async (req, res) => {
  try {
    const { startDate, endDate, deviceId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }
    
    const query = {
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };
    
    if (deviceId) {
      query.deviceId = deviceId;
    }
    
    const data = await EnvironmentData.find(query)
      .sort({ timestamp: 1 });
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching data by range:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add new environment data (for IoT devices)
router.post('/', [
  body('temperature').isFloat({ min: -50, max: 100 }),
  body('humidity').isFloat({ min: 0, max: 100 }),
  body('airQuality').isFloat({ min: 0, max: 500 }),
  body('pressure').isFloat({ min: 800, max: 1200 }),
  body('lightLevel').isFloat({ min: 0, max: 1000 }),
  body('deviceId').notEmpty(),
  body('location').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const environmentData = new EnvironmentData(req.body);
    await environmentData.save();
    
    // Emit to connected clients via Socket.IO
    if (req.app.get('io')) {
      req.app.get('io').emit('newEnvironmentData', environmentData);
    }

    // Edge processing: evaluate alerts and notify via email with cooldown
    try {
      const alerts = evaluateAndFilter(environmentData.toObject());
      if (alerts.length > 0) {
        // Find notification recipients
        const users = await User.find({ 'profile.preferences.notifications': true }).select('email name');
        const recipients = users.map(u => u.email).filter(Boolean);

        if (recipients.length > 0) {
          const tableData = {};
          for (const a of alerts) {
            tableData[a.metric] = `${a.value} (threshold ${a.threshold})`;
          }

          const subject = `Environment Alert (${environmentData.deviceId}) - ${alerts.map(a => a.metric).join(', ')}`;
          const message = `Threshold(s) exceeded at ${new Date(environmentData.timestamp).toLocaleString()} for device ${environmentData.deviceId}.`;

          await Promise.all(
            recipients.map(to =>
              sendAlertEmail({
                to,
                subject,
                message,
                data: { ...tableData, Location: environmentData.location }
              })
            )
          );
        }

        // Also broadcast alerts to clients
        if (req.app.get('io')) {
          req.app.get('io').emit('alerts', alerts);
        }
      }
    } catch (alertErr) {
      console.error('Edge alert processing error:', alertErr);
    }
    
    res.status(201).json(environmentData);
  } catch (error) {
    console.error('Error saving environment data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get statistics
router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    let startDate;
    switch (period) {
      case '1h':
        startDate = new Date(Date.now() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }
    
    const data = await EnvironmentData.find({
      timestamp: { $gte: startDate }
    }).sort({ timestamp: 1 });
    
    if (data.length === 0) {
      return res.json({
        avgTemperature: 0,
        avgHumidity: 0,
        avgAirQuality: 0,
        avgPressure: 0,
        avgLightLevel: 0,
        dataPoints: 0
      });
    }
    
    const stats = {
      avgTemperature: data.reduce((sum, item) => sum + item.temperature, 0) / data.length,
      avgHumidity: data.reduce((sum, item) => sum + item.humidity, 0) / data.length,
      avgAirQuality: data.reduce((sum, item) => sum + item.airQuality, 0) / data.length,
      avgPressure: data.reduce((sum, item) => sum + item.pressure, 0) / data.length,
      avgLightLevel: data.reduce((sum, item) => sum + item.lightLevel, 0) / data.length,
      dataPoints: data.length,
      minTemperature: Math.min(...data.map(item => item.temperature)),
      maxTemperature: Math.max(...data.map(item => item.temperature)),
      minHumidity: Math.min(...data.map(item => item.humidity)),
      maxHumidity: Math.max(...data.map(item => item.humidity))
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
