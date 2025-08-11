// Edge processor: evaluates incoming sensor data and determines alerts.
// For production, consider moving state (last alerts) to Redis or a DB.

const lastAlertMap = new Map();

const minutes = (m) => m * 60 * 1000;

const getThresholds = () => ({
  temperatureHigh: Number(process.env.ALERT_TEMP_HIGH ?? 35),
  temperatureLow: Number(process.env.ALERT_TEMP_LOW ?? 0),
  humidityHigh: Number(process.env.ALERT_HUMIDITY_HIGH ?? 85),
  humidityLow: Number(process.env.ALERT_HUMIDITY_LOW ?? 20),
  airQualityHigh: Number(process.env.ALERT_AQI_HIGH ?? 150),
  pressureLow: Number(process.env.ALERT_PRESSURE_LOW ?? 900),
  pressureHigh: Number(process.env.ALERT_PRESSURE_HIGH ?? 1100),
  lightLevelHigh: Number(process.env.ALERT_LIGHT_HIGH ?? 900),
});

const getCooldownMs = () => minutes(Number(process.env.ALERT_COOLDOWN_MINUTES ?? 15));

function evaluateData(data) {
  const t = getThresholds();
  const alerts = [];
  const { temperature, humidity, airQuality, pressure, lightLevel, deviceId } = data;

  if (typeof temperature === 'number') {
    if (temperature >= t.temperatureHigh) {
      alerts.push({
        key: 'temperatureHigh',
        metric: 'temperature',
        level: 'high',
        message: `High temperature detected: ${temperature.toFixed(1)}°C (≥ ${t.temperatureHigh}°C)`,
        value: temperature,
        threshold: t.temperatureHigh,
        deviceId,
      });
    } else if (temperature <= t.temperatureLow) {
      alerts.push({
        key: 'temperatureLow',
        metric: 'temperature',
        level: 'low',
        message: `Low temperature detected: ${temperature.toFixed(1)}°C (≤ ${t.temperatureLow}°C)`,
        value: temperature,
        threshold: t.temperatureLow,
        deviceId,
      });
    }
  }

  if (typeof humidity === 'number') {
    if (humidity >= t.humidityHigh) {
      alerts.push({
        key: 'humidityHigh',
        metric: 'humidity',
        level: 'high',
        message: `High humidity: ${humidity.toFixed(1)}% (≥ ${t.humidityHigh}%)`,
        value: humidity,
        threshold: t.humidityHigh,
        deviceId,
      });
    } else if (humidity <= t.humidityLow) {
      alerts.push({
        key: 'humidityLow',
        metric: 'humidity',
        level: 'low',
        message: `Low humidity: ${humidity.toFixed(1)}% (≤ ${t.humidityLow}%)`,
        value: humidity,
        threshold: t.humidityLow,
        deviceId,
      });
    }
  }

  if (typeof airQuality === 'number' && airQuality >= t.airQualityHigh) {
    alerts.push({
      key: 'airQualityHigh',
      metric: 'airQuality',
      level: 'high',
      message: `Poor air quality detected: AQI ${airQuality} (≥ ${t.airQualityHigh})`,
      value: airQuality,
      threshold: t.airQualityHigh,
      deviceId,
    });
  }

  if (typeof pressure === 'number') {
    if (pressure <= t.pressureLow) {
      alerts.push({
        key: 'pressureLow',
        metric: 'pressure',
        level: 'low',
        message: `Low pressure: ${pressure.toFixed(0)} hPa (≤ ${t.pressureLow})`,
        value: pressure,
        threshold: t.pressureLow,
        deviceId,
      });
    } else if (pressure >= t.pressureHigh) {
      alerts.push({
        key: 'pressureHigh',
        metric: 'pressure',
        level: 'high',
        message: `High pressure: ${pressure.toFixed(0)} hPa (≥ ${t.pressureHigh})`,
        value: pressure,
        threshold: t.pressureHigh,
        deviceId,
      });
    }
  }

  if (typeof lightLevel === 'number' && lightLevel >= t.lightLevelHigh) {
    alerts.push({
      key: 'lightHigh',
      metric: 'lightLevel',
      level: 'high',
      message: `High light level: ${lightLevel.toFixed(0)} (≥ ${t.lightLevelHigh})`,
      value: lightLevel,
      threshold: t.lightLevelHigh,
      deviceId,
    });
  }

  return alerts;
}

function shouldNotify(deviceId, key) {
  const cooldownMs = getCooldownMs();
  const mapKey = `${deviceId || 'unknown'}:${key}`;
  const last = lastAlertMap.get(mapKey) || 0;
  const now = Date.now();
  if (now - last >= cooldownMs) {
    lastAlertMap.set(mapKey, now);
    return true;
  }
  return false;
}

function evaluateAndFilter(data) {
  const alerts = evaluateData(data);
  return alerts.filter(a => shouldNotify(a.deviceId, a.key));
}

module.exports = {
  evaluateData,
  evaluateAndFilter,
  getThresholds,
};


