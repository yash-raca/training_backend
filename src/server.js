// File: BACKEND/src/server.js

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authenticateToken = require('./middleware/auth');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Simple test route
app.get('/', (req, res) => {
  res.send('Backend server is running!');
});

app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'Protected data', user: req.user });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'API route is working!' });
});

// Import existing routes
const authRoutes = require('./routes/auth');
const roleRoutes = require('./routes/role');
const courseRoutes = require('./routes/course');
const userRoutes = require('./routes/user');

// Import assessment routes
const assessmentRoutes = require('./routes/assessment');
const assessmentAdminRoutes = require('./routes/assessment');

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api', roleRoutes);          // exposes role/capability endpoints
app.use('/api', courseRoutes);        // exposes course endpoints, including /courses/:id/enroll
app.use('/api/users', userRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/assessments', assessmentAdminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'UP' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
