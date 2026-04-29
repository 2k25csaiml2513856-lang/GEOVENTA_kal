

const TIER_SQFT_RATE = {
  1: { min: 80,  max: 250 },  
  2: { min: 40,  max: 120 },  
  3: { min: 20,  max: 70  }   
};


const ZONE_PREMIUM = {
  'downtown core'        : 2.2,
  'west retail corridor' : 1.8,
  'tech park hub'        : 1.6,
  'north district'       : 1.2,
  'university belt'      : 1.3,
  'old city'             : 1.4,
  'east suburbs'         : 0.9,
  'south industrial'     : 0.6
};


const BUSINESS_PREMIUM = {
  restaurant  : 1.5,
  grocery     : 1.2,
  pharmacy    : 1.1,
  fashion     : 1.6,
  electronics : 1.3,
  warehouse   : 0.5,
  coworking   : 1.4,
  gym         : 1.1
};

function estimateLandCost(zoneName, cityTier, businessType, requiredArea) {
  const tier    = TIER_SQFT_RATE[cityTier] || TIER_SQFT_RATE[3];
  const zKey    = (zoneName || '').toLowerCase();
  const zMod    = Object.entries(ZONE_PREMIUM).find(([k]) => zKey.includes(k))?.[1] || 1.0;
  const bMod    = BUSINESS_PREMIUM[businessType] || 1.0;
  const noise   = () => 0.85 + Math.random() * 0.3; 

  const ratePerSqft = ((tier.min + Math.random() * (tier.max - tier.min)) * zMod * bMod * noise());
  const cost        = Math.round(ratePerSqft * requiredArea);

  return { cost, ratePerSqft: Math.round(ratePerSqft) };
}

function budgetFit(cost, monthlyBudget) {
  const fit           = cost <= monthlyBudget;
  const overageRatio  = cost / monthlyBudget;          
  const utilizationPct = Math.min(overageRatio * 100, 200); 
  return { budgetFit: fit, overageRatio, utilizationPct };
}

module.exports = { estimateLandCost, budgetFit, TIER_SQFT_RATE, ZONE_PREMIUM };
