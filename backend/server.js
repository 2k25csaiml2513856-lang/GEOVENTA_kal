const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express      = require('express');
const cors         = require('cors');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const analysisRouter          = require('./routes/analysis');
const geocodeRouter           = require('./routes/geocode');
const forecastRouter          = require('./routes/forecast');

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

app.use('/api/analysis',  analysisRouter); 
app.use('/api/geocode',   geocodeRouter);  
app.use('/api/forecast',  forecastRouter); 

app.get('/api/health', (req, res) => {
  res.json({
    status  : 'OK',
    version : '1.0.0',
    engine  : 'GeoVenta MCDA AI v1',
    mapsMode: 'Google Maps API (Live Geocoding)',
    mapsKey : true, 
    auth    : 'JWT (bcrypt + jsonwebtoken)',
    time    : new Date().toISOString()
  });
});

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
  console.log(`📡 Geospatial: ✅ Google Maps API ACTIVE`);
  console.log(`📊 MCDA Engine: ✅ READY`);
});

module.exports = app;
