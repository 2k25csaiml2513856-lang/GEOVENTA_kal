function buildForecast({ currentCost, score, growthRate, horizonYears, supplyDemandN, competitionN }) {
  const scoreBonus         = (score / 100) * 0.08;
  const demandBonus        = supplyDemandN * 0.03;
  const saturationPenalty  = competitionN  * 0.02;
  const baseAnnualGrowth   = growthRate + scoreBonus + demandBonus - saturationPenalty;

  const years      = [];
  const projected  = [];
  const upperBand  = [];
  const lowerBand  = [];

  let value   = currentCost;
  const sigma = 0.015;

  for (let y = 0; y <= horizonYears; y++) {
    const label = y === 0 ? 'Now' : `Yr ${y}`;
    years.push(label);
    projected.push(Math.round(value));
    upperBand.push(Math.round(value * (1 + sigma * Math.sqrt(y) * 1.96)));
    lowerBand.push(Math.round(value * (1 - sigma * Math.sqrt(y) * 1.96)));

    const annualNoise  = (Math.random() - 0.5) * sigma * 2;
    value *= (1 + baseAnnualGrowth + annualNoise);
  }

  const totalReturn   = ((projected[projected.length - 1] - projected[0]) / projected[0]) * 100;
  const cagr          = (Math.pow(projected[projected.length - 1] / projected[0], 1 / horizonYears) - 1) * 100;

  return {
    labels          : years,
    projected,
    upperBand,
    lowerBand,
    currentCost     : projected[0],
    projectedCost   : projected[projected.length - 1],
    annualGrowthRate: parseFloat((baseAnnualGrowth * 100).toFixed(2)),
    cagr            : parseFloat(cagr.toFixed(2)),
    totalReturn     : parseFloat(totalReturn.toFixed(1)),
    horizonYears,
    riskBand        : parseFloat((sigma * 100 * Math.sqrt(horizonYears) * 1.96).toFixed(1))
  };
}

function buildAllForecasts(sites, horizonYears) {
  return sites.map(site => ({
    ...site,
    forecast: buildForecast({
      currentCost     : site.landCost,
      score           : site.score,
      growthRate      : site.growthRate || 0.055,
      horizonYears,
      supplyDemandN   : site.normalized.supplyDemand,
      competitionN    : site.normalized.competition
    })
  }));
}

module.exports = { buildForecast, buildAllForecasts };
