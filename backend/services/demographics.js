const CITY_PROFILES = {
  'pune'       : { basePopDensity: 5765, medianIncome: 42000, growthRate: 0.068, tier: 1 },
  'mumbai'     : { basePopDensity: 20667, medianIncome: 55000, growthRate: 0.05,  tier: 1 },
  'bangalore'  : { basePopDensity: 4381, medianIncome: 65000, growthRate: 0.075, tier: 1 },
  'hyderabad'  : { basePopDensity: 5496, medianIncome: 48000, growthRate: 0.07,  tier: 1 },
  'delhi'      : { basePopDensity: 11317, medianIncome: 50000, growthRate: 0.055, tier: 1 },
  'chennai'    : { basePopDensity: 7088, medianIncome: 40000, growthRate: 0.062, tier: 1 },
  'kolkata'    : { basePopDensity: 24252, medianIncome: 35000, growthRate: 0.04,  tier: 1 },
  'ahmedabad'  : { basePopDensity: 7650, medianIncome: 38000, growthRate: 0.065, tier: 2 },
  'jaipur'     : { basePopDensity: 5950, medianIncome: 32000, growthRate: 0.06,  tier: 2 },
  'surat'      : { basePopDensity: 7460, medianIncome: 36000, growthRate: 0.072, tier: 2 },
  'lucknow'    : { basePopDensity: 5000, medianIncome: 30000, growthRate: 0.055, tier: 2 },
  'nagpur'     : { basePopDensity: 4500, medianIncome: 28000, growthRate: 0.05,  tier: 2 },
  'default'    : { basePopDensity: 3500, medianIncome: 25000, growthRate: 0.045, tier: 3 }
};

const ZONE_MODIFIERS = {
  'downtown core'           : { pop: 1.4, demand: 1.6, comp: 1.8 },
  'north district'          : { pop: 1.1, demand: 1.1, comp: 1.0 },
  'east suburbs'            : { pop: 0.85, demand: 0.85, comp: 0.7 },
  'west retail corridor'    : { pop: 1.2, demand: 1.5, comp: 1.6 },
  'tech park hub'           : { pop: 1.3, demand: 1.2, comp: 0.9 },
  'south industrial'        : { pop: 0.7, demand: 0.65, comp: 0.5 },
  'university belt'         : { pop: 1.6, demand: 1.3, comp: 1.2 },
  'old city'                : { pop: 1.2, demand: 1.0, comp: 1.4 },
};

const BUSINESS_DEMAND = {
  restaurant  : { popWeight: 1.5, minDensity: 3000, idealIncome: 40000 },
  grocery     : { popWeight: 2.0, minDensity: 5000, idealIncome: 28000 },
  pharmacy    : { popWeight: 1.8, minDensity: 4000, idealIncome: 30000 },
  fashion     : { popWeight: 1.0, minDensity: 4000, idealIncome: 45000 },
  electronics : { popWeight: 0.9, minDensity: 3500, idealIncome: 55000 },
  warehouse   : { popWeight: 0.4, minDensity: 500,  idealIncome: 20000 },
  coworking   : { popWeight: 1.1, minDensity: 4000, idealIncome: 60000 },
  gym         : { popWeight: 1.3, minDensity: 5000, idealIncome: 45000 }
};

function getCityProfile(locationStr) {
  const lower = (locationStr || '').toLowerCase();
  for (const key of Object.keys(CITY_PROFILES)) {
    if (lower.includes(key)) return { ...CITY_PROFILES[key], city: key };
  }
  return { ...CITY_PROFILES['default'], city: 'unknown' };
}

function generateZoneDemographics(zones, locationStr, businessType) {
  const city    = getCityProfile(locationStr);
  const bizMeta = BUSINESS_DEMAND[businessType] || BUSINESS_DEMAND.restaurant;

  return zones.map(zoneName => {
    const zKey = zoneName.toLowerCase();
    const mod  = Object.entries(ZONE_MODIFIERS).find(([k]) => zKey.includes(k))?.[1]
                 || { pop: 1.0, demand: 1.0, comp: 1.0 };

    const noise = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.15;

    const popDensity     = Math.round(city.basePopDensity * mod.pop * (1 + noise()));
    const medianIncome   = Math.round(city.medianIncome   * (1 + noise() * 0.5));

    const popScore  = Math.min(popDensity / (bizMeta.minDensity * 2), 1);
    const incomeAdj = medianIncome / bizMeta.idealIncome;
    const supplyDemand = Math.max(0, Math.min(1, (popScore * bizMeta.popWeight * 0.5 + incomeAdj * 0.5) * mod.demand * (1 + noise() * 0.2)));

    const baseComp   = Math.round(12 * mod.comp * (1 + noise()));
    const competition = Math.max(0, baseComp);

    return {
      zone         : zoneName,
      population   : popDensity,
      supplyDemand : supplyDemand,
      competition  : competition,
      medianIncome,
      city         : city.city,
      growthRate   : city.growthRate * (1 + noise() * 0.3)
    };
  });
}

module.exports = { generateZoneDemographics, getCityProfile, CITY_PROFILES, BUSINESS_DEMAND };
