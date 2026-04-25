/* =====================================================================
   services/mcda.js — Multi-Criteria Decision Analysis Engine
   Core scoring algorithm for geospatial site ranking
   ===================================================================== */

/**
 * Normalize a raw value to [0, 1] using min-max normalization.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 */
function minMax(val, min, max) {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

/**
 * Normalize an array of zone raw factor objects into [0,1].
 * Returns the same array augmented with a `normalized` field.
 * @param {Array} zones — each zone must have: population, supplyDemand, competition, landCost
 */
function normalizeZones(zones) {
  // Find min / max per dimension
  const dims = ['population', 'supplyDemand', 'competition', 'landCost'];
  const range = {};
  dims.forEach(d => {
    const vals = zones.map(z => z[d]);
    range[d] = { min: Math.min(...vals), max: Math.max(...vals) };
  });

  return zones.map(z => {
    const popN  = minMax(z.population,    range.population.min,    range.population.max);
    const sdN   = minMax(z.supplyDemand,  range.supplyDemand.min,  range.supplyDemand.max);
    const compN = minMax(z.competition,   range.competition.min,   range.competition.max);
    const lcN   = minMax(z.landCost,      range.landCost.min,      range.landCost.max);

    return {
      ...z,
      normalized: {
        population   : popN,
        supplyDemand : sdN,
        competition  : compN,   // Higher = worse  (cost criterion)
        landCost     : lcN      // Higher = worse  (cost criterion)
      }
    };
  });
}

/**
 * Calculate weighted MCDA composite score for every zone.
 * @param {Array}  zones   — output of normalizeZones()
 * @param {Object} weights — { population, supplyDemand, competition, landCost }
 * returns zones sorted by score descending, each with .score and .rank
 */
function scoreZones(zones, weights) {
  // Ensure weights sum to 100; if not, rescale
  const wTotal = Object.values(weights).reduce((a, b) => a + b, 0);
  const wNorm  = {};
  Object.keys(weights).forEach(k => (wNorm[k] = weights[k] / wTotal));

  const scored = zones.map(z => {
    const n = z.normalized;
    // Benefit factors: higher raw norm → higher score
    // Cost factors:    lower  raw norm → higher score  (invert with 1 - n)
    const contrib = {
      population   : n.population   * wNorm.population,
      supplyDemand : n.supplyDemand * wNorm.supplyDemand,
      competition  : (1 - n.competition) * wNorm.competition,  // invert
      landCost     : (1 - n.landCost)    * wNorm.landCost       // invert
    };

    const raw = contrib.population + contrib.supplyDemand + contrib.competition + contrib.landCost;
    return {
      ...z,
      score    : Math.round(raw * 100),
      contrib  : {
        population   : Math.round(contrib.population   * 100),
        supplyDemand : Math.round(contrib.supplyDemand * 100),
        competition  : Math.round(contrib.competition  * 100),
        landCost     : Math.round(contrib.landCost     * 100)
      }
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((z, i) => ({ ...z, rank: i + 1 }));
}

/**
 * Grade label and CSS class from score.
 */
function gradeFromScore(score) {
  if (score >= 80) return { label: 'Excellent Match', cls: 'excellent' };
  if (score >= 65) return { label: 'Good Match',      cls: 'good' };
  if (score >= 45) return { label: 'Fair Match',      cls: 'fair' };
  return               { label: 'Poor Match',         cls: 'poor' };
}

module.exports = { normalizeZones, scoreZones, gradeFromScore };
