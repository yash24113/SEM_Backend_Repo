const EnvironmentData = require('../models/EnvironmentData');

// Generate realistic environment data
const generateEnvironmentData = () => {
  const baseTemp = 22 + (Math.random() - 0.5) * 10; // 17-27°C
  const baseHumidity = 45 + (Math.random() - 0.5) * 30; // 30-60%
  const baseAQI = 20 + Math.random() * 80; // 20-100 AQI
  const basePressure = 1013 + (Math.random() - 0.5) * 20; // 1003-1023 hPa
  const baseLight = 200 + Math.random() * 600; // 200-800 lux

  return {
    temperature: parseFloat(baseTemp.toFixed(1)),
    humidity: parseFloat(baseHumidity.toFixed(1)),
    airQuality: Math.round(baseAQI),
    pressure: Math.round(basePressure),
    lightLevel: Math.round(baseLight),
    location: 'Main Room',
    deviceId: 'sensor-001',
    timestamp: new Date()
  };
};

// Generate historical data for the last 24 hours
const generateHistoricalData = async (hours = 24) => {
  const dataPoints = [];
  const now = new Date();
  
  for (let i = hours; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
    const data = generateEnvironmentData();
    data.timestamp = timestamp;
    dataPoints.push(data);
  }
  
  return dataPoints;
};

// Seed the database with sample data
const seedDatabase = async () => {
  try {
    console.log('Generating sample environment data...');
    
    // Clear existing data
    await EnvironmentData.deleteMany({});
    
    // Generate 24 hours of data
    const historicalData = await generateHistoricalData(24);
    
    // Insert data
    await EnvironmentData.insertMany(historicalData);
    
    console.log(`Successfully seeded database with ${historicalData.length} data points`);
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};

// Generate a single data point (for real-time simulation)
const generateSingleDataPoint = () => {
  return generateEnvironmentData();
};

module.exports = {
  generateEnvironmentData,
  generateHistoricalData,
  seedDatabase,
  generateSingleDataPoint
};
