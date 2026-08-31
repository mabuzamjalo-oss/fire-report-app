require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const incidentRoutes = require('./routes/incidents');
const unitRoutes = require('./routes/units');
const uploadRoutes = require('./routes/uploads');
const stationRoutes = require('./routes/stations');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
});

app.set('io', io);

app.use(cors());

// Skip ngrok browser warning page so API calls work directly
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

app.use(express.json());
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/incidents', incidentRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/stations', stationRoutes);

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚒 Fire report backend running on port ${PORT}`);
});