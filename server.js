const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Configuration du port pour Render.com
const PORT = process.env.PORT || 10000;

// Base URL de l'API Brawl Stars
const BRAWL_STARS_API_URL = 'https://api.brawlstars.com/v1';

// Configuration des headers d'authentification
const getAuthHeaders = () => ({
  'Authorization': `Bearer ${process.env.BRAWL_STARS_API_KEY}`,
  'Accept': 'application/json',
  'User-Agent': 'BrawlStarsProxy/1.0'
});

// Configuration CORS pour React
const corsOptions = {
  origin: function (origin, callback) {
    // Permettre les requêtes sans origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Liste des domaines autorisés
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://localhost:3000',
      process.env.FRONTEND_URL,
      // Ajoutez vos domaines de production ici
    ].filter(Boolean); // Supprime les valeurs undefined
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Configuration du rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limite de 100 requêtes par IP par fenêtre
  message: {
    error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false // Désactivé pour l'API
}));
app.use(cors(corsOptions));
app.use(express.json());
app.use(limiter);

// Middleware de logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'unknown'}`);
  next();
});

// Middleware de gestion d'erreurs pour les requêtes vers l'API Brawl Stars
const handleBrawlStarsRequest = async (endpoint, res) => {
  try {
    const response = await axios.get(`${BRAWL_STARS_API_URL}${endpoint}`, {
      headers: getAuthHeaders(),
      timeout: 10000 // 10 secondes de timeout
    });
    
    console.log(`✅ Success: ${endpoint} - Status: ${response.status}`);
    return res.json(response.data);
    
  } catch (error) {
    console.error(`❌ Error: ${endpoint}:`, error.message);
    
    if (error.response) {
      // Erreur de l'API Brawl Stars
      const status = error.response.status;
      const message = error.response.data?.message || error.message;
      
      switch (status) {
        case 400:
          return res.status(400).json({
            error: 'Requête invalide',
            message: 'Vérifiez les paramètres de votre requête',
            details: message
          });
        case 403:
          return res.status(403).json({
            error: 'Accès interdit',
            message: 'Clé API invalide ou limite de requêtes atteinte'
          });
        case 404:
          return res.status(404).json({
            error: 'Ressource non trouvée',
            message: 'Le tag du joueur ou du club est introuvable'
          });
        case 429:
          return res.status(429).json({
            error: 'Limite de requêtes atteinte',
            message: 'Veuillez patienter avant de réessayer',
            retryAfter: error.response.headers['retry-after']
          });
        case 503:
          return res.status(503).json({
            error: 'Service temporairement indisponible',
            message: 'L\'API Brawl Stars est en maintenance'
          });
        default:
          return res.status(status).json({
            error: 'Erreur de l\'API Brawl Stars',
            message: message
          });
      }
    } else if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        error: 'Timeout',
        message: 'La requête a pris trop de temps à répondre'
      });
    } else {
      return res.status(500).json({
        error: 'Erreur du serveur proxy',
        message: 'Erreur de connexion à l\'API Brawl Stars'
      });
    }
  }
};

// Route de santé pour Render.com
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Route racine
app.get('/', (req, res) => {
  res.json({
    name: 'Brawl Stars API Proxy',
    version: '1.0.0',
    status: 'active',
    endpoints: [
      'GET /api/players/:playerTag',
      'GET /api/clubs/:clubTag',
      'GET /api/clubs/:clubTag/members',
      'GET /api/brawlers',
      'GET /api/brawlers/:brawlerId',
      'GET /api/events',
      'GET /api/rankings/:countryCode/players',
      'GET /api/rankings/:countryCode/clubs'
    ]
  });
});

// Routes pour l'API Brawl Stars

// Informations d'un joueur
app.get('/api/players/:playerTag', (req, res) => {
  const playerTag = encodeURIComponent(req.params.playerTag);
  handleBrawlStarsRequest(`/players/${playerTag}`, res);
});

// Informations d'un club
app.get('/api/clubs/:clubTag', (req, res) => {
  const clubTag = encodeURIComponent(req.params.clubTag);
  handleBrawlStarsRequest(`/clubs/${clubTag}`, res);
});

// Membres d'un club
app.get('/api/clubs/:clubTag/members', (req, res) => {
  const clubTag = encodeURIComponent(req.params.clubTag);
  handleBrawlStarsRequest(`/clubs/${clubTag}/members`, res);
});

// Liste de tous les brawlers
app.get('/api/brawlers', (req, res) => {
  handleBrawlStarsRequest('/brawlers', res);
});

// Informations d'un brawler spécifique
app.get('/api/brawlers/:brawlerId', (req, res) => {
  const brawlerId = req.params.brawlerId;
  handleBrawlStarsRequest(`/brawlers/${brawlerId}`, res);
});

// Événements actuels
app.get('/api/events', (req, res) => {
  handleBrawlStarsRequest('/events/rotation', res);
});

// Classements des joueurs par pays
app.get('/api/rankings/:countryCode/players', (req, res) => {
  const countryCode = req.params.countryCode.toUpperCase();
  const limit = req.query.limit || 200;
  handleBrawlStarsRequest(`/rankings/${countryCode}/players?limit=${limit}`, res);
});

// Classements des clubs par pays
app.get('/api/rankings/:countryCode/clubs', (req, res) => {
  const countryCode = req.params.countryCode.toUpperCase();
  const limit = req.query.limit || 200;
  handleBrawlStarsRequest(`/rankings/${countryCode}/clubs?limit=${limit}`, res);
});

// Gestion des routes non trouvées
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint non trouvé',
    message: 'Consultez GET / pour voir les endpoints disponibles'
  });
});

// Middleware de gestion d'erreurs global
app.use((error, req, res, next) => {
  console.error('Erreur globale:', error);
  res.status(500).json({
    error: 'Erreur interne du serveur',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Une erreur inattendue s\'est produite'
  });
});

// Démarrage du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Brawl Stars Proxy Server lancé sur le port ${PORT}`);
  console.log(`📍 URL locale: http://localhost:${PORT}`);
  console.log(`🔑 API Key configurée: ${process.env.BRAWL_STARS_API_KEY ? '✅ Oui' : '❌ Non'}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
});