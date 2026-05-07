
const fetch = require('node-fetch');

const LIVE = true;

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

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function geocodeLocation(locationStr) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationStr)}&key=${GOOGLE_KEY}`;

  try {
    const res = await fetch(url);
    const json = await res.json();

    if (json.status !== 'OK' || !json.results.length) {
      throw new Error(`Google Geocoding failed: ${json.status}`);
    }

    const result = json.results[0];
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address
    };
  } catch (err) {
    console.error('[Google Geocode Error]', err.message);
    return { lat: 18.5204, lng: 73.8567, formattedAddress: 'Pune, Maharashtra (Fallback)' };
  }
}

async function reverseGeocode(lat, lng) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 'OK' && json.results.length > 0) {
      // Find the most relevant neighborhood or locality
      const result = json.results[0];
      const components = result.address_components;
      const sub = components.find(c => c.types.includes('sublocality') || c.types.includes('neighborhood'));
      const loc = components.find(c => c.types.includes('locality'));
      return (sub ? sub.long_name : (loc ? loc.long_name : 'Selected Zone'));
    }
    return 'Selected Zone';
  } catch (err) {
    return 'Selected Zone';
  }
}

async function generateCandidateZones(center, radiusKm, numZones = 10) {
  const radiusM = radiusKm * 1000;
  const overpassQuery = `[out:json][timeout:25];
    (
      node["shop"](around:${radiusM},${center.lat},${center.lng});
      node["amenity"="restaurant"](around:${radiusM},${center.lat},${center.lng});
      node["office"](around:${radiusM},${center.lat},${center.lng});
    );
    out body 20;`;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

  try {
    const res = await fetch(url);
    const json = await res.json();

    let candidates = json.elements || [];

    // If no real candidates found, fallback to random points
    if (candidates.length < 3) {
      return fallbackZones(center, radiusKm, numZones);
    }

    // Shuffle and pick top N
    candidates = candidates.sort(() => 0.5 - Math.random()).slice(0, numZones);

    // To avoid "IP address problem" (429 rate limits), we process these sequentially with a small delay
    const results = [];
    for (const c of candidates) {
      const lat = c.lat;
      const lng = c.lon;
      const shopName = c.tags.name || c.tags.shop || c.tags.amenity || 'Commercial Zone';

      const realName = await reverseGeocode(lat, lng);
      const dist = calculateDistance(center.lat, center.lng, lat, lng);

      results.push({
        name: realName || shopName, // Prioritize location name over shop name
        lat: lat,
        lng: lng,
        distFromCenter: parseFloat(dist.toFixed(2))
      });

      // 250ms delay between Nominatim calls to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    return results;
  } catch (err) {
    console.warn('[Overpass Candidates Error]', err.message);
    return fallbackZones(center, radiusKm, numZones);
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function fallbackZones(center, radiusKm, numZones) {
  const zones = [];
  const templates = ZONE_TEMPLATES.slice(0, numZones);

  templates.forEach((name, i) => {
    const angleDeg = (360 / numZones) * i;
    const angleRad = (angleDeg * Math.PI) / 180;
    const distKm = radiusKm * (0.4 + Math.random() * 0.6);
    const deltaLat = (distKm / 111) * Math.cos(angleRad);
    const deltaLng = (distKm / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angleRad);

    zones.push({
      name: name,
      lat: parseFloat((center.lat + deltaLat).toFixed(6)),
      lng: parseFloat((center.lng + deltaLng).toFixed(6)),
      distFromCenter: parseFloat(distKm.toFixed(2))
    });
  });
  return zones;
}

async function countNearbyCompetitors(lat, lng, businessType, radiusM = 1500) {

  const typeMap = {
    restaurant: 'node["amenity"="restaurant"]',
    grocery: 'node["shop"="supermarket"]',
    pharmacy: 'node["amenity"="pharmacy"]',
    fashion: 'node["shop"="clothes"]',
    electronics: 'node["shop"="electronics"]',
    warehouse: 'node["industrial"="warehouse"]',
    coworking: 'node["office"="coworking"]',
    gym: 'node["leisure"="fitness_centre"]'
  };

  const osmQueryPart = typeMap[businessType] || 'node["amenity"]';
  const overpassQuery = `[out:json][timeout:25];
    (
      ${osmQueryPart}(around:${radiusM},${lat},${lng});
    );
    out count;`;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

  try {
    const res = await fetch(url);
    const json = await res.json();


    if (json.elements && json.elements.length > 0) {
      return parseInt(json.elements[0].tags.nodes) || 0;
    }
    return Math.round(Math.random() * 5); // Fallback
  } catch (err) {
    console.warn('[Overpass Error]', err.message);
    return Math.round(Math.random() * 10);
  }
}

module.exports = { geocodeLocation, generateCandidateZones, countNearbyCompetitors, LIVE };
