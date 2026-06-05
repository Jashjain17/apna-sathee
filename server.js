const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

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

// Programmatic SEO Route for Infinite Landing Pages
app.get('/tools/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    
    // Simple mock lookup for the meta tags based on the slug. 
    // You can replace this with a real DB query later!
    const seoData = {
      'hindi-speaking-ai': {
        title: 'Hindi Speaking AI | Apna Sathee',
        description: 'Get JEE counselling guidance in Hindi with our AI copilot.'
      },
      'study-buddy': {
        title: 'Study Buddy | Apna Sathee',
        description: 'Your personal AI study buddy for JEE preparation and counselling.'
      }
    };
    
    // Default fallback if the exact slug isn't in our dictionary
    const formattedSlug = slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    const meta = seoData[slug] || {
      title: `${formattedSlug} | Apna Sathee`,
      description: `Explore the ${formattedSlug} tool to boost your JEE counselling success.`
    };
    
    // 1. Read the static index.html file
    const indexPath = path.join(__dirname, 'index.html');
    let html = await fs.promises.readFile(indexPath, 'utf8');
    
    // 2. Inject the dynamic meta tags via string replacement
    html = html.replace(
      '<title>Apna Sathee | JEE Counselling Copilot</title>', 
      `<title>${meta.title}</title>\n  <meta name="description" content="${meta.description}" />`
    );
    
    // 3. Send the SEO-optimized HTML to the browser
    res.send(html);
  } catch (error) {
    console.error('Error serving programmatic SEO route:', error);
    res.sendFile(path.join(__dirname, 'index.html')); // Safe fallback
  }
});

// Fallback to index.html for SPA routing if needed
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`API endpoints are mapped correctly.`);
});
