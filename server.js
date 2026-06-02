const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Load environment variables from .env.local if present
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not installed, ignore
}

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes mimicking Vercel's behavior
app.post('/api/chat', async (req, res) => {
  try {
    const chatHandler = require('./api/chat.js');
    await chatHandler(req, res);
  } catch (err) {
    console.error('Error in /api/chat route:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/recommend', async (req, res) => {
  try {
    const recommendHandler = require('./api/recommend.js');
    await recommendHandler(req, res);
  } catch (err) {
    console.error('Error in /api/recommend route:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/partner/:promoCode', (req, res) => {
  res.sendFile(path.join(__dirname, 'partner.html'));
});

// Fallback to index.html for SPA routing if needed
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`API endpoints are mapped correctly.`);
});
