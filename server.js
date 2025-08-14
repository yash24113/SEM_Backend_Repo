require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});


// const allowedOrigins = process.env.CLIENT_URL
//   .split(",") // Split comma-separated URLs
//   .map(url => url.trim()); // Remove spaces

// const io = socketIo(server, {
//   cors: {
//     origin: (origin, callback) => {
//       if (!origin || allowedOrigins.includes(origin)) {
//         callback(null, true); // Allow
//       } else {
//         callback(new Error("Not allowed by CORS")); // Block
//       }
//     },
//     methods: ["GET", "POST"]
//   }
// });


const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "localhost";

// MongoDB connection with retry and safe startup
mongoose.set('strictQuery', true);
const MONGO_URL = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/smart-environment-monitor';
let serverStarted = false;

async function connectWithRetry() {
  try {
    console.log(`Connecting to MongoDB: ${MONGO_URL}`);
    await mongoose.connect(MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
    if (!serverStarted) {
      startHttpServer();
      serverStarted = true;
    }
  } catch (err) {
    console.error('MongoDB connection error:', err?.message || err);
    setTimeout(connectWithRetry, 5000);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Retrying connection...');
  connectWithRetry();
});

connectWithRetry();

// Make io available to routes
app.set('io', io);

// Routes
const authRoutes = require("./routes/auth");
const environmentRoutes = require("./routes/environment");
const profileRoutes = require("./routes/profile");
const profile2faRoutes = require("./routes/profile-2fa");
const auth2faRoutes = require("./routes/auth-2fa");
const systemRoutes = require("./routes/system");
const alertRoutes = require("./routes/alerts");

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static('uploads'));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/environment", environmentRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/profile", profile2faRoutes);
app.use("/api/auth", auth2faRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/alerts", alertRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-dashboard', () => {
    socket.join('dashboard');
    console.log('Client joined dashboard room');
  });

  // Agent registration to enable targeted commands
  socket.on('register-device', (deviceId) => {
    if (deviceId) {
      socket.join(`device:${deviceId}`);
      console.log(`Device registered: ${deviceId} (${socket.id})`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Smart Environment Monitor API is running",
    version: "1.0.0"
  });
});

// Google Maps API key endpoint
app.get("/google", (req, res) => {
  res.json({ key: process.env.GOOGLE_MAPS_API_KEY });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

function startHttpServer() {
  server.listen(PORT, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
    console.log(`Socket.IO server is ready`);
  });
}
