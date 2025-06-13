const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// CORS permissif pour tester
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

// Route de santé
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    apiKey: process.env.BRAWL_STARS_API_KEY ? 'Present' : 'Missing'
  });
});

// Route racine
app.get('/', (req, res) => {
  res.json({
    message: 'Brawl Stars Proxy is running',
    endpoints: ['/health', '/api/players/:tag']
  });
});

// Route pour récupérer un joueur
app.get('/api/players/:tag', async (req, res) => {
  try {
    const playerTag = req.params.tag;
    console.log('Fetching player:', playerTag);
    
    if (!process.env.BRAWL_STARS_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    const response = await axios.get(`https://api.brawlstars.com/v1/players/%23${playerTag}`, {
      headers: {
        'Authorization': `Bearer ${process.env.BRAWL_STARS_API_KEY}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Success for player:', playerTag);
    res.json(response.data);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 404:
          res.status(404).json({ error: 'Player not found. Check your tag.' });
          break;
        case 403:
          res.status(403).json({ error: 'API key invalid or IP not authorized' });
          break;
        case 429:
          res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
          break;
        default:
          res.status(status).json({ error: `API Error: ${status}` });
      }
    } else {
      res.status(500).json({ error: 'Network error. Please try again later.' });
    }
  }
});

// Démarrage du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Proxy running on port ${PORT}`);
  console.log(`🔑 API Key: ${process.env.BRAWL_STARS_API_KEY ? 'Present' : 'Missing'}`);
});