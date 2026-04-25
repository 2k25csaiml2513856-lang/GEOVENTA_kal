/* =====================================================================
   services/narrative.js — AI Narrative Report Generator
   Produces a structured analytical text report for the top-ranked site
   based on all computed factors. Designed to plug into an LLM endpoint
   or run fully local as a template-based generator.
   ===================================================================== */

const BUSINESS_LABELS = {
  restaurant  : 'Restaurant / Café',
  grocery     : 'Grocery / Supermarket',
  pharmacy    : 'Pharmacy / Clinic',
  fashion     : 'Fashion Retail',
  electronics : 'Electronics Showroom',
  warehouse   : 'Warehouse / Fulfilment',
  coworking   : 'Co-working Space',
  gym         : 'Gym / Fitness Studio'
};

const COMPETITION_ADJECTIVE = (count) => {
  if (count <= 3)  return 'minimal';
  if (count <= 8)  return 'moderate';
  if (count <= 15) return 'elevated';
  return 'saturated';
};

const SCORE_DESCRIPTOR = (score) => {
  if (score >= 80) return { adj: 'highly compelling', strength: 'exceptional' };
  if (score >= 65) return { adj: 'strong', strength: 'solid' };
  if (score >= 48) return { adj: 'moderate', strength: 'adequate' };
  return               { adj: 'cautious', strength: 'limited' };
};

/**
 * Generate a structured narrative report for a single site.
 * @param {object} site  — fully scored zone object
 * @param {object} input — original user input params
 */
function generateSiteNarrative(site, input) {
  const bLabel  = BUSINESS_LABELS[input.businessType] || 'Business';
  const compAdj = COMPETITION_ADJECTIVE(site.competition);
  const desc    = SCORE_DESCRIPTOR(site.score);
  const budgetStatus = site.budgetFit
    ? `within your declared monthly budget of ₹${Number(input.monthlyBudget).toLocaleString()}`
    : `approximately ${Math.round((site.landCost / input.monthlyBudget - 1) * 100)}% above your declared budget`;

  const demandVerdict = site.supplyDemand > 0.65
    ? 'a significant unmet demand gap, implying a favorable first-mover advantage'
    : site.supplyDemand > 0.35
    ? 'moderate latent demand — viable but competitive positioning will be essential'
    : 'a relatively saturated or low-demand market — differentiation is critical';

  const popContext = site.population > 8000
    ? `a high-density residential base (≈${site.population.toLocaleString()} residents/km²) that supports sustained daily footfall`
    : `a moderate catchment density (≈${site.population.toLocaleString()} residents/km²) — marketing outreach will be necessary to build sufficient walk-in traffic`;

  const forecastNote = site.forecast
    ? `land valuation at ₹${site.forecast.projected[0].toLocaleString()} today is projected to reach ₹${site.forecast.projectedCost.toLocaleString()} in ${site.forecast.horizonYears} years (CAGR: ${site.forecast.cagr}%)`
    : 'a forecast is pending zone selection';

  const sections = [
    {
      heading : 'Executive Summary',
      body    : `The MCDA engine has evaluated <strong>${site.zone}</strong> and assigned a composite alignment score of <strong>${site.score}/100</strong> — a ${desc.adj} match for a ${bLabel} operation. This zone ranks <strong>#${site.rank}</strong> out of all candidate areas analyzed within ${input.radiusKm || 8} km of ${input.targetLocation}.`
    },
    {
      heading : 'Demand & Demographic Signal',
      body    : `The area presents ${popContext}. Our demand model indicates ${demandVerdict}. The local median household income of ≈₹${site.medianIncome?.toLocaleString() || 'N/A'}/month aligns ${site.medianIncome > 40000 ? 'well' : 'partially'} with the spending profile expected for a ${bLabel}.`
    },
    {
      heading : 'Competitive Landscape',
      body    : `Our competitor clustering analysis detected <strong>${site.competition} comparable ${bLabel} outlets</strong> within a 1.5 km radius — representing ${compAdj} market saturation. ${compAdj === 'saturated' ? 'Strong brand identity, service differentiation, or a niche sub-segment focus will be essential to capture meaningful share.' : 'This represents a favorable opportunity for market entry with manageable competitive intensity.'}`
    },
    {
      heading : 'Financial Feasibility',
      body    : `Estimated monthly occupancy cost for <strong>${Number(input.requiredArea || 1800).toLocaleString()} sq ft</strong> is approximately <strong>₹${site.landCost?.toLocaleString()}</strong> — ${budgetStatus}. ${site.budgetFit ? 'This leaves headroom for operational and marketing expenditure.' : 'Consider negotiating a multi-year lock-in or evaluating adjacent zones with lower land premiums.'}`
    },
    {
      heading : 'Land Valuation Outlook',
      body    : `Based on city growth patterns and zone desirability, ${forecastNote}, yielding a total return of ${site.forecast?.totalReturn?.toFixed(1) || 'N/A'}%. This suggests ${site.forecast?.cagr > 8 ? 'strong long-term asset appreciation potential' : 'stable but conservative appreciation — prioritize operational ROI over real-estate upside'}.`
    },
    {
      heading : 'Strategic Recommendation',
      body    : site.score >= 65
        ? `<strong>Proceed with site survey and due diligence.</strong> ${site.zone} demonstrates ${desc.strength} fundamentals across the four geospatial pillars. Immediate action is advisable to secure lease terms before competitive pressure intensifies.`
        : `<strong>Conditional recommendation.</strong> While this zone shows promise in specific dimensions, overall alignment is ${desc.adj}. Consider re-running the analysis with adjusted weights emphasizing your most critical success factors, or expanding the search radius.`
    }
  ];

  return sections;
}

module.exports = { generateSiteNarrative };
