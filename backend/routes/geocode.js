/* =====================================================================
   routes/geocode.js — GET /api/geocode
   Proxy for Google Maps Geocoding + Places API (keeps API key server-side)
   ===================================================================== */
const express  = require('express');
const router   = express.Router();
const { geocodeLocation, LIVE } = require('../services/geocoder');

/* GET /api/geocode?q=Pune */
router.get('/', async (req, res, next) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Query parameter q is required' });
  try {
    const result = await geocodeLocation(q);
    res.json({ ...result, live: LIVE });
  } catch (err) {
    next(err);
  }
});

/* GET /api/geocode/status */
router.get('/status', (req, res) => {
  res.json({
    live       : LIVE,
    mapsKey    : LIVE ? 'configured' : 'not configured',
    mode       : LIVE ? 'Google Maps API (live)' : 'Synthetic coordinates (demo)'
  });
});

module.exports = router;
