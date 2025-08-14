const mongoose = require('mongoose');

const systemMetricsSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  deviceManufacturer: { type: String },
  deviceModel: { type: String },

  batteryPercent: { type: Number, min: 0, max: 100 },
  isCharging: { type: Boolean, default: false },

  cpuLoadPercent: { type: Number, min: 0, max: 100 },
  uptimeSeconds: { type: Number, min: 0 },

  memoryUsedPercent: { type: Number, min: 0, max: 100 },
  memoryTotalMB: { type: Number, min: 0 },
  memoryFreeMB: { type: Number, min: 0 },

  brightnessPercent: { type: Number, min: 0, max: 100 },
  volumePercent: { type: Number, min: 0, max: 100 },

  isOnline: { type: Boolean, default: true },
  networkType: { type: String },

  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

systemMetricsSchema.index({ timestamp: -1 });
systemMetricsSchema.index({ deviceId: 1, timestamp: -1 });

module.exports = mongoose.model('SystemMetrics', systemMetricsSchema);


