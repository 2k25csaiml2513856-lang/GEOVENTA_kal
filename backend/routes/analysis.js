/* =====================================================================
   routes/analysis.js — POST /api/analysis/run
   Orchestrates the full MCDA pipeline:
   geocode → generate zones → demographics →
   land valuation → MCDA scoring → forecast → narrative
   ===================================================================== */

const express     = require('express');
const router      = express.Router();

const { geocodeLocation, generateCandidateZones, countNearbyCompetitors } = require('../services/geocoder');
const { generateZoneDemographics, getCityProfile }                         = require('../services/demographics');
const { estimateLandCost, budgetFit }                                      = require('../services/landValue');
const { normalizeZones, scoreZones, gradeFromScore }                       = require('../services/mcda');
const { buildAllForecasts }                                                = require('../services/forecast');
const { generateSiteNarrative }                                            = require('../services/narrative');

/* ── Validation helpers ─────────────────────────────────────────────── */
function validateInput(body) {
  const errors = [];
  if (!body.targetLocation) errors.push('targetLocation is required');
  if (body.monthlyBudget <= 0) errors.push('monthlyBudget must be > 0');
  if (body.searchRadius  <= 0) errors.push('searchRadius must be > 0');
  return errors;
}

/* ── POST /api/analysis/run ─────────────────────────────────────────── */
router.post('/run', async (req, res, next) => {
  try {
    const {
      targetLocation = 'Pune, Maharashtra',
      businessType   = 'restaurant',
      supplierModel  = 'regional',
      searchRadius   = 8,
      monthlyBudget  = 250000,
      requiredArea   = 1800,
      forecastYears  = 5,
      numZones       = 6,
      weights        = { population: 30, supplyDemand: 25, competition: 20, landCost: 25 }
    } = req.body;

    // --- Validate ---
    const errors = validateInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    // ── Step 1: Geocode target location ──
    const center = await geocodeLocation(targetLocation);

    // ── Step 2: Generate candidate zones ──
    const zones = await generateCandidateZones(center, searchRadius, numZones);

    // ── Step 3: Get city profile for tier info ──
    const cityProfile = getCityProfile(targetLocation);

    // ── Step 4: Generate demographics per zone ──
    const demos = generateZoneDemographics(zones.map(z => z.name), targetLocation, businessType);

    // ── Step 5: Estimate land cost per zone ──
    const withCosts = zones.map((zone, i) => {
      const { cost, ratePerSqft } = estimateLandCost(zone.name, cityProfile.tier || 2, businessType, requiredArea);
      const fit = budgetFit(cost, monthlyBudget);
      return {
        ...zone,
        ...demos[i],
        landCost      : cost,
        ratePerSqft,
        ...fit
      };
    });

    // ── Step 6: Count nearby competitors (async, parallelized) ──
    await Promise.all(withCosts.map(async (z) => {
      z.competition = await countNearbyCompetitors(z.lat, z.lng, businessType);
    }));

    // ── Step 7: Normalize factors ──
    const normalized = normalizeZones(withCosts);

    // ── Step 8: MCDA scoring ──
    const scored = scoreZones(normalized, weights);

    // ── Step 9: Forecasts ──
    const withForecasts = buildAllForecasts(scored, forecastYears);

    // ── Step 10: Narrative for top site ──
    const topSite = withForecasts[0];
    const narrative = generateSiteNarrative(topSite, {
      businessType,
      monthlyBudget,
      requiredArea,
      targetLocation,
      radiusKm: searchRadius
    });

    // ── Response ──
    res.json({
      success    : true,
      meta: {
        targetLocation,
        businessType,
        center,
        searchRadius,
        monthlyBudget,
        requiredArea,
        forecastYears,
        weights,
        mapsMode   : require('../services/geocoder').LIVE ? 'live' : 'demo',
        analyzedAt : new Date().toISOString()
      },
      sites      : withForecasts.map(s => ({
        id           : `site-${s.rank}`,
        rank         : s.rank,
        zone         : s.zone,
        name         : s.name || s.zone,
        lat          : s.lat,
        lng          : s.lng,
        score        : s.score,
        grade        : gradeFromScore(s.score),
        contrib      : s.contrib,
        // Raw dimensions
        population   : s.population,
        supplyDemand : s.supplyDemand,
        competition  : s.competition,
        landCost     : s.landCost,
        ratePerSqft  : s.ratePerSqft,
        medianIncome : s.medianIncome,
        // Budget
        budgetFit        : s.budgetFit,
        overageRatio     : s.overageRatio,
        utilizationPct   : s.utilizationPct,
        // Normalized (for radar)
        normalized       : s.normalized,
        // Forecast
        forecast         : s.forecast,
        // Distance
        distFromCenter   : s.distFromCenter,
        growthRate       : s.growthRate
      })),
      narrative  // Only for top site
    });

  } catch (err) {
    next(err);
  }
});

/* ── GET /api/analysis/factors ─────────────────────────────────────── */
router.get('/factors', (req, res) => {
  res.json([
    { id: 'population',   name: 'Population Density',   type: 'benefit', unit: 'residents/km²',   default: 30 },
    { id: 'supplyDemand', name: 'Supply-Demand Gap',    type: 'benefit', unit: 'demand index 0-1', default: 25 },
    { id: 'competition',  name: 'Competitor Clustering', type: 'cost',    unit: 'count in 1.5km',  default: 20 },
    { id: 'landCost',     name: 'Land Valuation & Cost', type: 'cost',    unit: '₹/month',          default: 25 }
  ]);
});

module.exports = router;
