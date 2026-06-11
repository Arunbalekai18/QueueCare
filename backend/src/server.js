const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./db');
const setupRoutes = require('./routes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend interactions
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://queue-care-weld.vercel.app'
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const normalizedOrigin = origin.replace(/\/$/, '');
    
    // Check if origin matches any allowed origin exactly, OR is a Vercel preview domain for this project
    const isVercelPreview = normalizedOrigin.endsWith('.vercel.app') && 
                            (normalizedOrigin.includes('queue-care') || normalizedOrigin.includes('queue-care-weld'));
                            
    const isAllowed = allowedOrigins.some(allowed => allowed.replace(/\/$/, '') === normalizedOrigin) || isVercelPreview;
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`⚠️ Blocked by CORS: Origin '${origin}' not in allowed list`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));

app.use(express.json());

// Create HTTP Server
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
  cors: corsOptions
});

// Real-time connections monitor
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Bootstrap API and Socket
async function startServer() {
  try {
    // Connect and setup DB (MySQL or mock)
    await db.initDB();

    // Bind endpoints
    const routes = setupRoutes(io);
    app.use('/api', routes);

    // Default status route
    app.get('/status', (req, res) => {
      res.json({ status: 'online', time: new Date() });
    });

    server.listen(PORT, () => {
      console.log(`\n🚀 QueueCare Backend running on port ${PORT}`);
      console.log(`👉 REST API Endpoint: http://localhost:${PORT}/api`);
      console.log(`👉 WebSocket Listener: ws://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start the QueueCare backend service:', err);
    process.exit(1);
  }
}

startServer();
