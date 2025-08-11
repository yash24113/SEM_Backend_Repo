const mongoose = require('mongoose');

const environmentDataSchema = new mongoose.Schema({
  temperature: {
    type: Number,
    required: true,
    min: -50,
    max: 100
  },
  humidity: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  airQuality: {
    type: Number,
    required: true,
    min: 0,
    max: 500
  },
  pressure: {
    type: Number,
    required: true,
    min: 800,
    max: 1200
  },
  lightLevel: {
    type: Number,
    required: true,
    min: 0,
    max: 1000
  },
  location: {
    type: String,
    default: 'Main Room'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  deviceId: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient querying by timestamp
environmentDataSchema.index({ timestamp: -1 });
environmentDataSchema.index({ deviceId: 1, timestamp: -1 });

module.exports = mongoose.model('EnvironmentData', environmentDataSchema);
