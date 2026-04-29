
require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const analysisRouter          = require('./routes/analysis');
const geocodeRouter           = require('./routes/geocode');
const forecastRouter          = require('./routes/forecast');
const { router: authRouter, requireAuth } = require('./routes/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('dev'));


app.use('/api/', rateLimit({
  windowMs : 15 * 60 * 1000,
  max      : 100,
  message  : { error: 'Too many requests. Please slow down.' }
}));


app.use(express.static(path.join(__dirname, '..')));

app.use('/api/auth',      authRouter);               
app.use('/api/analysis',  requireAuth, analysisRouter); 
app.use('/api/geocode',   requireAuth, geocodeRouter);  
app.use('/api/forecast',  requireAuth, forecastRouter); 

app.get('/api/health', (req, res) => {
  res.json({
    status  : 'OK',
    version : '1.0.0',
    engine  : 'GeoVenta MCDA AI v1',
    mapsKey : !!process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key_here',
    auth    : 'JWT (bcrypt + jsonwebtoken)',
    time    : new Date().toISOString()
  });
});

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'login.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(err.status || 500).json({
    error   : err.message || 'Internal server error',
    code    : err.code    || 'SERVER_ERROR'
  });
});

app.listen(PORT, () => {
  console.log(`\n🌐 GeoVenta API running → http://localhost:${PORT}`);
  console.log(`🔐 Auth:       ✅ JWT + bcrypt`);
  console.log(`📡 Google Maps: ${process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key_here' ? '✅ ACTIVE' : '⚠️  DEMO MODE'}`);
  console.log(`📊 MCDA Engine: ✅ READY`);
  console.log(`🔑 Login page: http://localhost:${PORT}/login.html\n`);
});

module.exports = app;
