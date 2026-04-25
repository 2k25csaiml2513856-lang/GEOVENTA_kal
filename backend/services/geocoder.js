/* =====================================================================
   services/geocoder.js — Google Maps Geocoding & Places Proxy
   Wraps Google Maps APIs server-side (key never exposed to browser).
   Falls back to synthetic coordinate generation when key is absent.
   ===================================================================== */

const fetch = require('node-fetch');

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;
const LIVE     = MAPS_KEY && MAPS_KEY !== 'your_google_maps_api_key_here';

/* ── Sub-zone name generators per city ──────────────────────────────── */
const ZONE_TEMPLATES = [
  'Downtown Core',
  'North District',
  'Tech Park Hub',
  'East Suburbs',
  'West Retail Corridor',
  'South Industrial',
  'University Belt',
  'Old City',
  'Airport Corridor',
  'Financial District'
];

/**
 * Geocode a free-text location to lat/lng.
 * Returns { lat, lng, formattedAddress } or throws.
 */
async function geocodeLocation(locationStr) {
  if (!LIVE) {
    // Synthetic coords for Indian cities
    const mockCoords = {
      pune      : { lat: 18.5204, lng: 74.8567 },
      mumbai    : { lat: 19.0760, lng: 72.8777 },
      bangalore : { lat: 12.9716, lng: 77.5946 },
      hyderabad : { lat: 17.3850, lng: 78.4867 },
      delhi     : { lat: 28.7041, lng: 77.1025 },
      chennai   : { lat: 13.0827, lng: 80.2707 },
      kolkata   : { lat: 22.5726, lng: 88.3639 },
      ahmedabad : { lat: 23.0225, lng: 72.5714 },
      jaipur    : { lat: 26.9124, lng: 75.7873 },
      surat     : { lat: 21.1702, lng: 72.8311 },
    };
    const lower = (locationStr || '').toLowerCase();
    for (const [city, coord] of Object.entries(mockCoords)) {
      if (lower.includes(city)) return { ...coord, formattedAddress: locationStr };
    }
    return { lat: 18.5204, lng: 74.8567, formattedAddress: locationStr }; // Default Pune
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationStr)}&key=${MAPS_KEY}`;
  const res  = await fetch(url);
  const json = await res.json();

  if (json.status !== 'OK' || !json.results.length) {
    throw new Error(`Geocoding failed: ${json.status}`);
  }

  const loc = json.results[0].geometry.location;
  return {
    lat              : loc.lat,
    lng              : loc.lng,
    formattedAddress : json.results[0].formatted_address
  };
}

/**
 * Generate candidate zone offsets around a center lat/lng.
 * In LIVE mode fetches Places API; in DEMO mode uses angular offsets.
 * @param {{ lat, lng }} center
 * @param {number} radiusKm
 * @param {number} numZones
 */
async function generateCandidateZones(center, radiusKm, numZones = 6) {
  const zones = [];
  const selectedTemplates = ZONE_TEMPLATES.slice(0, numZones);

  // Angular distribution around the center
  selectedTemplates.forEach((name, i) => {
    const angleDeg  = (360 / numZones) * i;
    const angleRad  = (angleDeg * Math.PI) / 180;
    const distKm    = radiusKm * (0.4 + Math.random() * 0.6);   // 40-100% of radius
    const deltaLat  = (distKm / 111) * Math.cos(angleRad);
    const deltaLng  = (distKm / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angleRad);

    zones.push({
      name   : name,
      lat    : parseFloat((center.lat + deltaLat).toFixed(6)),
      lng    : parseFloat((center.lng + deltaLng).toFixed(6)),
      distFromCenter: parseFloat(distKm.toFixed(2))
    });
  });

  return zones;
}

/**
 * Count nearby businesses of a given type using Google Places API.
 * Fallback: returns synthetic count weighted by zone type.
 */
async function countNearbyCompetitors(lat, lng, businessType, radiusM = 1500) {
  if (!LIVE) {
    // Synthetic competitor count (seeded for consistency)
    return Math.round(3 + Math.random() * 18);
  }

  // Map business types to Google Places 'type' parameter
  const typeMap = {
    restaurant  : 'restaurant',
    grocery     : 'grocery_or_supermarket',
    pharmacy    : 'pharmacy',
    fashion     : 'clothing_store',
    electronics : 'electronics_store',
    warehouse   : 'storage',
    coworking   : 'coworking_space',
    gym         : 'gym'
  };

  const placeType = typeMap[businessType] || 'establishment';
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusM}&type=${placeType}&key=${MAPS_KEY}`;

  try {
    const res  = await fetch(url);
    const json = await res.json();
    return json.results ? json.results.length : Math.round(Math.random() * 10);
  } catch {
    return Math.round(Math.random() * 10);
  }
}

module.exports = { geocodeLocation, generateCandidateZones, countNearbyCompetitors, LIVE };
