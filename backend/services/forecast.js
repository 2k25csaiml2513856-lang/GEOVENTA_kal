function buildForecast({ currentCost, score, growthRate, horizonYears, supplyDemandN, competitionN, populationN }) {

  const scoreFactor     = (score / 100) * 0.06;
  const demandFactor    = supplyDemandN * 0.04;
  const densityFactor   = populationN * 0.05;
  const saturationDrag  = competitionN * 0.03;

  const baseAnnualGrowth = growthRate + scoreFactor + demandFactor + densityFactor - saturationDrag;

  const years      = [];
  const projected  = [];
  const upperBand  = [];
  const lowerBand  = [];

  let value   = currentCost;
  const sigma = 0.012 + (competitionN * 0.01); // Competition adds volatility

  for (let y = 0; y <= horizonYears; y++) {
    const label = y === 0 ? 'Now' : `Yr ${y}`;
    years.push(label);
    projected.push(Math.round(value));

    const confidenceMultiplier = 1.96 * sigma * Math.sqrt(y);
    upperBand.push(Math.round(value * (1 + confidenceMultiplier)));
    lowerBand.push(Math.round(value * (1 - confidenceMultiplier)));

    const annualNoise  = (Math.random() - 0.5) * sigma;
    value *= (1 + baseAnnualGrowth + annualNoise);
  }

  const terminalValue = projected[projected.length - 1];
  const initialValue  = projected[0];
  const totalReturn   = ((terminalValue - initialValue) / initialValue) * 100;

  const cagr = (Math.pow(terminalValue / initialValue, 1 / horizonYears) - 1) * 100;

  const confidenceScore = Math.round(85 + (score/20) - (sigma*100));

  return {
    labels          : years,
    projected,
    upperBand,
    lowerBand,
    currentCost     : initialValue,
    projectedCost   : terminalValue,
    annualGrowthRate: parseFloat((baseAnnualGrowth * 100).toFixed(2)),
    cagr            : parseFloat(cagr.toFixed(2)),
    totalReturn     : parseFloat(totalReturn.toFixed(1)),
    horizonYears,
    confidenceScore : Math.min(98, confidenceScore),
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
      competitionN    : site.normalized.competition,
      populationN     : site.normalized.population
    })
  }));
}

module.exports = { buildForecast, buildAllForecasts };
