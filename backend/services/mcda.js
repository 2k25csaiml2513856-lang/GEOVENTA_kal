function minMax(val, min, max) {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

function normalizeZones(zones) {
  
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
        competition  : compN,   
        landCost     : lcN      
      }
    };
  });
}

function scoreZones(zones, weights) {
  
  const wTotal = Object.values(weights).reduce((a, b) => a + b, 0);
  const wNorm  = {};
  Object.keys(weights).forEach(k => (wNorm[k] = weights[k] / wTotal));

  const scored = zones.map(z => {
    const n = z.normalized;

    const contrib = {
      population   : n.population   * wNorm.population,
      supplyDemand : n.supplyDemand * wNorm.supplyDemand,
      competition  : (1 - n.competition) * wNorm.competition,  
      landCost     : (1 - n.landCost)    * wNorm.landCost       
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

function gradeFromScore(score) {
  if (score >= 80) return { label: 'Excellent Match', cls: 'excellent' };
  if (score >= 65) return { label: 'Good Match',      cls: 'good' };
  if (score >= 45) return { label: 'Fair Match',      cls: 'fair' };
  return               { label: 'Poor Match',         cls: 'poor' };
}

module.exports = { normalizeZones, scoreZones, gradeFromScore };
