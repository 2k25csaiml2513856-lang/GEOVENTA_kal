const API_BASE = '/api';   

const state = {
  sites          : [],
  selectedSiteId : null,
  narrative      : null,
  meta           : {},
  mapMode        : 'score',
  serverOnline   : false,
  chartInstances : { radar: null, forecast: null },
  map            : null,
  mapLayers      : []
};

const FACTORS = [
  { id: 'population',   name: 'Population Density',    type: 'benefit', default: 30, icon: '👥' },
  { id: 'supplyDemand', name: 'Supply-Demand Gap',     type: 'benefit', default: 25, icon: '📈' },
  { id: 'competition',  name: 'Competitor Clustering', type: 'cost',    default: 20, icon: '🏪' },
  { id: 'landCost',     name: 'Land Valuation & Cost', type: 'cost',    default: 25, icon: '💰' }
];

const weights = { population: 30, supplyDemand: 25, competition: 20, landCost: 25 };

document.addEventListener('DOMContentLoaded', async () => {
  await loadChartJS();
  initWeightSliders();
  attachFormEvents();
  await checkServerStatus();
  initFactorTable();
});

async function loadChartJS() {
  if (window.Chart) return;
  await new Promise(resolve => {
    const s  = document.createElement('script');
    s.src    = 'https://cdn.jsdelivr.net/npm/chart.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

async function checkServerStatus() {
  try {
    const res  = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    state.serverOnline = json.status === 'OK';

    if (state.serverOnline) {
      setStatus('form-status', '✅ Backend API connected — full-stack mode active', 'var(--emerald)');
      if (json.mapsKey) {
        setConnBadge('maps-badge', 'LIVE', 'live');
        setText('maps-status-text', 'Google Maps API connected (live geocoding)');
      }
    }
  } catch {
    state.serverOnline = false;
    setStatus('form-status', '⚠️ Backend offline — running in client-side fallback mode', 'var(--amber)');
  }
}

function initWeightSliders() {
  const container = document.getElementById('weight-sliders');
  if (!container) return;
  container.innerHTML = '';

  FACTORS.forEach(f => {
    const val = weights[f.id];
    container.insertAdjacentHTML('beforeend', `
      <div class="weight-item">
        <div class="weight-item-header">
          <span class="weight-item-label">${f.icon} ${f.name} ${f.type === 'cost' ? '(cost)' : ''}</span>
          <span class="weight-item-val" id="val-${f.id}">${val}%</span>
        </div>
        <input type="range" id="slider-${f.id}" data-id="${f.id}"
               min="0" max="100" value="${val}"
               aria-label="Weight for ${f.name}">
      </div>
    `);
  });

  FACTORS.forEach(f => {
    document.getElementById(`slider-${f.id}`)
      .addEventListener('input', e => {
        weights[f.id] = parseInt(e.target.value);
        rebalanceWeights(f.id);
      });
  });
}

function rebalanceWeights(changedId) {
  const changedVal  = weights[changedId];
  const otherIds    = FACTORS.map(f => f.id).filter(id => id !== changedId);
  const otherTotal  = otherIds.reduce((s, id) => s + weights[id], 0);
  const remainder   = Math.max(0, 100 - changedVal);

  if (otherTotal > 0) {
    otherIds.forEach(id => {
      weights[id] = Math.round((weights[id] / otherTotal) * remainder);
    });
    
    const drift = 100 - Object.values(weights).reduce((a, b) => a + b, 0);
    weights[otherIds[0]] += drift;
  }

  FACTORS.forEach(f => {
    const v = Math.max(0, weights[f.id]);
    const badge  = document.getElementById(`val-${f.id}`);
    const slider = document.getElementById(`slider-${f.id}`);
    if (badge)  badge.textContent  = `${v}%`;
    if (slider) slider.value       = v;
  });

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const badge = document.getElementById('weight-total');
  if (badge) {
    badge.textContent  = `${total}%`;
    badge.className    = Math.abs(total - 100) > 3
      ? 'weight-total-badge warn'
      : 'weight-total-badge';
  }
}

function attachFormEvents() {
  document.getElementById('analysis-form')
    ?.addEventListener('submit', e => { e.preventDefault(); runAnalysis(); });

  document.getElementById('reset-weights')
    ?.addEventListener('click', () => {
      FACTORS.forEach(f => { weights[f.id] = f.default; });
      FACTORS.forEach(f => rebalanceWeights(f.id));
    });

  ['score', 'density', 'competition'].forEach(mode => {
    document.getElementById(`view-${mode}`)
      ?.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`view-${mode}`).classList.add('active');
        state.mapMode = mode;
        renderMap();
        const lm = document.getElementById('legend-metric');
        if (lm) lm.textContent = mode.toUpperCase();
      });
  });

  document.getElementById('radar-site-select')
    ?.addEventListener('change', e => selectSite(e.target.value));

  document.getElementById('export-pdf-btn')
    ?.addEventListener('click', exportToPDF);

  document.getElementById('save-project-btn')
    ?.addEventListener('click', saveProject);
}

async function runAnalysis() {
  setLoading(true);
  clearResults();

  const payload = buildPayload();

  try {
    let sites, narrative, meta;

    if (state.serverOnline) {
      
      const res  = await fetch(`${API_BASE}/analysis/run`, {
        method  : 'POST',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'API error');
      }

      const data = await res.json();
      sites     = data.sites;
      narrative = data.narrative;
      meta      = data.meta;

    } else {
      
      ({ sites, narrative, meta } = clientSideEngine(payload));
    }

    state.sites     = sites;
    state.narrative = narrative;
    state.meta      = meta || payload;

    renderAll();

    setStatus('form-status', `✅ Analysis complete — ${sites.length} zones ranked`, 'var(--emerald)');

    const syncEl = document.getElementById('sb-last-sync');
    if (syncEl) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      syncEl.textContent = `Last analysis: ${now}`;
    }

  } catch (err) {
    console.error(err);
    setStatus('form-status', `❌ Error: ${err.message}`, 'var(--rose)');
  } finally {
    setLoading(false);
  }
}

function buildPayload() {
  return {
    targetLocation : getVal('target-location', 'Pune, Maharashtra'),
    businessType   : getVal('business-type',   'restaurant'),
    supplierModel  : getVal('supplier-model',  'regional'),
    searchRadius   : getNum('search-radius',   8),
    monthlyBudget  : getNum('monthly-budget',  250000),
    requiredArea   : getNum('required-area',   1800),
    forecastYears  : getNum('forecast-years',  5),
    numZones       : 6,
    weights        : { ...weights }
  };
}

function clientSideEngine(p) {
  const ZONES = ['Downtown Core','North District','Tech Park Hub','East Suburbs','West Retail Corridor','South Industrial'];
  const CITY_POP = { pune: 5765, mumbai: 20667, bangalore: 4381, hyderabad: 5496, delhi: 11317, default: 4000 };
  const lower    = p.targetLocation.toLowerCase();
  const cityPop  = Object.entries(CITY_POP).find(([k]) => lower.includes(k))?.[1] || CITY_POP.default;

  const ZONE_MOD = { 'downtown core': 1.4, 'north district': 1.1, 'tech park hub': 1.3,
                     'east suburbs': 0.85, 'west retail corridor': 1.2, 'south industrial': 0.7 };

  const raw = ZONES.map((zone, i) => {
    const mod        = ZONE_MOD[zone.toLowerCase()] || 1;
    const noise      = () => 0.85 + Math.random() * 0.3;
    const population = Math.round(cityPop * mod * noise());
    const sd         = Math.min(1, (population / 10000) * mod * noise());
    const comp       = Math.max(0, Math.round(10 * mod + Math.random() * 8));
    const landCost   = Math.round((p.monthlyBudget * 0.5 + Math.random() * p.monthlyBudget) * mod / 1.3);
    const bf         = landCost <= p.monthlyBudget;
    const angle      = (2 * Math.PI / ZONES.length) * i;
    const dist       = p.searchRadius * (0.4 + Math.random() * 0.6);
    const lat        = 18.5204 + (dist / 111) * Math.cos(angle);
    const lng        = 74.8567 + (dist / 111) * Math.sin(angle);

    return { zone, name: zone, lat, lng, population, supplyDemand: sd,
             competition: comp, landCost, budgetFit: bf,
             overageRatio: landCost / p.monthlyBudget,
             medianIncome: Math.round(35000 * mod * noise()),
             growthRate: 0.055 + Math.random() * 0.03,
             distFromCenter: parseFloat(dist.toFixed(2)) };
  });

  const dims = ['population','supplyDemand','competition','landCost'];
  const ranges = {};
  dims.forEach(d => {
    const vals = raw.map(z => z[d]);
    ranges[d] = { min: Math.min(...vals), max: Math.max(...vals) };
  });

  const normalized = raw.map(z => {
    const norm = {};
    dims.forEach(d => {
      norm[d] = ranges[d].max === ranges[d].min ? 0.5
        : (z[d] - ranges[d].min) / (ranges[d].max - ranges[d].min);
    });
    return { ...z, normalized: norm };
  });

  const wTotal = Object.values(p.weights).reduce((a, b) => a + b, 0);
  const scored = normalized.map(z => {
    const n    = z.normalized;
    const wn   = {};
    Object.keys(p.weights).forEach(k => (wn[k] = p.weights[k] / wTotal));
    const score = Math.round(((n.population * wn.population)
      + (n.supplyDemand * wn.supplyDemand)
      + ((1 - n.competition) * wn.competition)
      + ((1 - n.landCost)    * wn.landCost)) * 100);

    return { ...z, score: Math.max(0, Math.min(100, score)),
      contrib: {
        population:   Math.round(n.population * wn.population * 100),
        supplyDemand: Math.round(n.supplyDemand * wn.supplyDemand * 100),
        competition:  Math.round((1-n.competition) * wn.competition * 100),
        landCost:     Math.round((1-n.landCost) * wn.landCost * 100)
      }};
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, i) => {
    s.rank  = i + 1;
    s.id    = `site-${i + 1}`;
    s.grade = gradeClient(s.score);
    s.forecast = buildForecastClient(s, p.forecastYears);
  });

  const top = scored[0];
  const narrative = [
    { heading: 'Top Recommendation', body: `<strong>${top.zone}</strong> scores <strong>${top.score}/100</strong> — Rank #1 among ${scored.length} zones.` },
    { heading: 'Demand Signal',       body: `Population density of ${top.population.toLocaleString()} res/km² with a supply-demand index of ${(top.supplyDemand * 100).toFixed(0)}%.` },
    { heading: 'Financial Fit',       body: top.budgetFit ? `Lease cost ₹${top.landCost.toLocaleString()} is within your budget.` : `Lease cost ₹${top.landCost.toLocaleString()} exceeds budget — review adjacent zones.` }
  ];

  return { sites: scored, narrative, meta: { ...p, mapsMode: 'demo' } };
}

function gradeClient(score) {
  if (score >= 80) return { label: 'Excellent Match', cls: 'excellent' };
  if (score >= 65) return { label: 'Good Match',      cls: 'good' };
  if (score >= 48) return { label: 'Fair Match',      cls: 'fair' };
  return               { label: 'Poor Match',         cls: 'poor' };
}

function buildForecastClient(site, years) {
  const scoreBonus  = (site.score / 100) * 0.08;
  const base        = (site.growthRate || 0.06) + scoreBonus;
  const labels = [], projected = [], upper = [], lower = [];
  let val = site.landCost;
  for (let y = 0; y <= years; y++) {
    labels.push(y === 0 ? 'Now' : `Yr ${y}`);
    projected.push(Math.round(val));
    upper.push(Math.round(val * (1 + 0.015 * Math.sqrt(y) * 1.96)));
    lower.push(Math.round(val * (1 - 0.015 * Math.sqrt(y) * 1.96)));
    val *= (1 + base + (Math.random() - 0.5) * 0.03);
  }
  const cagr = ((Math.pow(projected[years] / projected[0], 1 / years) - 1) * 100).toFixed(2);
  return { labels, projected, upperBand: upper, lowerBand: lower,
           currentCost: projected[0], projectedCost: projected[years],
           annualGrowthRate: parseFloat((base * 100).toFixed(2)),
           cagr: parseFloat(cagr),
           totalReturn: parseFloat(((projected[years] - projected[0]) / projected[0] * 100).toFixed(1)),
           horizonYears: years, riskBand: parseFloat((0.015 * 1.96 * Math.sqrt(years) * 100).toFixed(1)) };
}

function renderAll() {
  renderRankings();
  renderMap();
  updateMapSiteList();
  renderNarrative();

  if (state.sites.length > 0) {
    selectSite(state.sites[0].id);
    document.getElementById('map-legend').style.display = 'flex';
    renderBestSiteHero(state.sites[0]);
  } else {
    document.getElementById('best-site-hero').style.display = 'none';
  }
}

function renderBestSiteHero(site) {
  const hero = document.getElementById('best-site-hero');
  if (!hero) return;
  hero.style.display = 'flex';
  document.getElementById('hero-name').textContent = site.zone;
  document.getElementById('hero-score').textContent = site.score;
  
  const topFactor = Object.entries(site.contrib || {}).sort((a,b) => b[1] - a[1])[0];
  const factorLabels = { population: 'High Density', supplyDemand: 'Strong Demand', competition: 'Low Competition', landCost: 'Best Value' };
  document.getElementById('hero-reason').textContent = `Excellent ${factorLabels[topFactor[0]] || 'profile'}`;
}

function scrollToTopResult() {
  const container = document.getElementById('ranked-results');
  if (container) {
    container.scrollTo({ left: 0, behavior: 'smooth' });
  }
}

function renderRankings() {
  const container = document.getElementById('ranked-results');
  if (!container) return;
  container.innerHTML = '';

  const metaEl = document.getElementById('results-meta');
  if (metaEl) metaEl.textContent = `${state.sites.length} sites found in ${state.meta.targetLocation}`;

  state.sites.forEach(site => {
    const g = site.grade || gradeClient(site.score);
    const ringCircumference = 2 * Math.PI * 28;
    const ringOffset        = ringCircumference * (1 - site.score / 100);

    let ringColor = '#D9480F';
    if (site.score >= 80) ringColor = '#1D9E75';
    else if (site.score >= 65) ringColor = '#185FA5';
    else if (site.score >= 48) ringColor = '#EF9F27';

    const budgetTag = site.budgetFit
      ? `<span style="color:var(--emerald)">✅ Within budget</span>`
      : `<span style="color:var(--rose)">⚠️ +${Math.round((site.overageRatio - 1) * 100)}% over budget</span>`;

    const card = document.createElement('div');
    card.className = 'result-card';
    card.id        = `rc-${site.id}`;
    card.innerHTML = `
      <div class="rc-rank">
        <span class="rc-rank-num">RANK 0${site.rank}</span>
        <span class="rc-badge ${g.cls}">${g.label.toUpperCase()}</span>
      </div>
      <h3 class="rc-name">${site.zone}</h3>
      <p class="rc-zone">📍 ${state.meta.targetLocation || ''} · ${site.distFromCenter} km from center</p>

      <div class="rc-score-ring">
        <div class="ring-wrap">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle class="ring-bg" cx="32" cy="32" r="28" fill="none" stroke-width="5"></circle>
            <circle cx="32" cy="32" r="28" fill="none" stroke-width="5"
              stroke="${ringColor}" stroke-dasharray="${ringCircumference}"
              stroke-dashoffset="${ringOffset}" stroke-linecap="round"
              transform="rotate(-90 32 32)">
            </circle>
          </svg>
          <div class="ring-score" style="color:${ringColor}">${site.score}</div>
        </div>
        <div class="rc-metrics">
          <div class="rc-metric">👥 Population <span>${site.population?.toLocaleString()} /km²</span></div>
          <div class="rc-metric">🏪 Competitors <span>${site.competition} nearby</span></div>
          <div class="rc-metric">💰 Lease Cost <span>₹${site.landCost?.toLocaleString()}/mo</span></div>
        </div>
      </div>

      <div class="rc-factor-bars">
        ${renderFactorBars(site)}
      </div>

      <div class="rc-footer">
        <div class="rc-budget">${budgetTag}</div>
        <button class="rc-view-btn" onclick="selectSite('${site.id}')">Inspect →</button>
      </div>
    `;
    card.addEventListener('click', () => selectSite(site.id));
    container.appendChild(card);
  });
}

function renderFactorBars(site) {
  const factors = [
    { label: 'Pop Density',  val: site.normalized?.population   ?? 0, color: '#06b6d4' },
    { label: 'Demand Gap',   val: site.normalized?.supplyDemand ?? 0, color: '#10b981' },
    { label: 'Low Saturation', val: 1 - (site.normalized?.competition ?? 0), color: '#a78bfa' },
    { label: 'Cost Efficiency', val: 1 - (site.normalized?.landCost ?? 0),   color: '#f59e0b' }
  ];
  return factors.map(f => `
    <div class="rc-factor">
      <div class="rc-factor-header">
        <span>${f.label}</span>
        <span>${Math.round(f.val * 100)}%</span>
      </div>
      <div class="mini-bar">
        <div class="mini-fill" style="width:${f.val * 100}%; background:${f.color}"></div>
      </div>
    </div>
  `).join('');
}

function selectSite(id) {
  state.selectedSiteId = id;
  const site = state.sites.find(s => s.id === id);
  if (!site) return;

  const sel = document.getElementById('radar-site-select');
  if (sel) sel.value = id;

  renderMap();
  renderMiniMap(site);
  renderRadarChart(site);
  renderForecastChart(site);
  renderVenueImage(site);

  document.querySelectorAll('.result-card').forEach(c => c.classList.toggle('selected', c.id === `rc-${id}`));
  document.querySelectorAll('.site-item').forEach(c => c.classList.toggle('active', c.id === `li-${id}`));
}

function renderVenueImage(site) {
  const vs = document.getElementById('venue-section');
  const img = document.getElementById('venue-image');
  const title = document.getElementById('venue-title');
  if (!vs || !img) return;

  vs.style.display = 'block';
  
  img.style.transform = 'scale(1.1)';
  setTimeout(() => img.style.transform = 'scale(1)', 50);

  const bType = getVal('business-type', 'restaurant');
  let url = '';
  
  if (bType.includes('restaurant')) url = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80';
  else if (bType.includes('fashion') || bType.includes('retail')) url = 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=800&q=80';
  else if (bType.includes('gym')) url = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80';
  else if (bType.includes('grocery')) url = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80';
  else url = 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80';

  img.src = url;
  if(title) title.textContent = `${site.zone} Concept`;
}

function renderMiniMap(site) {
  const section = document.getElementById('mini-map-section');
  const iframe = document.getElementById('mini-map-iframe');
  if (!section || !iframe) return;
  
  section.style.display = 'block';

  const url = `https://www.openstreetmap.org/export/embed.html?bbox=${site.lng-0.005},${site.lat-0.003},${site.lng+0.005},${site.lat+0.003}&layer=mapnik&marker=${site.lat},${site.lng}`;
  iframe.src = url;
}

function renderMap() {
  if (!state.sites.length) return;
  const msg = document.getElementById('map-empty-msg');
  if (msg) msg.style.display = 'none';

  const mapContainer = document.getElementById('real-map');
  if (!mapContainer) return;

  if (!state.map) {
    state.map = L.map('real-map', { 
      zoomControl: false,
      fadeAnimation: true,
      markerZoomAnimation: true
    }).setView([state.sites[0].lat, state.sites[0].lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);

    const drawnItems = new L.FeatureGroup();
    state.map.addLayer(drawnItems);
    const drawControl = new L.Control.Draw({
      edit: { featureGroup: drawnItems },
      draw: { marker: false, circlemarker: false, polyline: false }
    });
    state.map.addControl(drawControl);
    state.map.on(L.Draw.Event.CREATED, function (event) {
      drawnItems.addLayer(event.layer);
    });
  } else {

    state.map.setView([state.sites[0].lat, state.sites[0].lng]);
  }

  setTimeout(() => {
    state.map.invalidateSize();
  }, 100);

  state.mapLayers.forEach(layer => state.map.removeLayer(layer));
  state.mapLayers = [];

  const bounds = L.latLngBounds();

  state.sites.forEach(site => {
    const isSelected = site.id === state.selectedSiteId;
    const n = site.normalized || {};
    let color = '#64748b';
    let radius = 15;

    if (state.mapMode === 'score') {
      if (site.score >= 80) color = '#10b981';
      else if (site.score >= 65) color = '#06b6d4';
      else if (site.score >= 48) color = '#f59e0b';
      else color = '#f43f5e';
    } else if (state.mapMode === 'density') {
      const v = n.population ?? 0.5;
      color = `hsl(${195 + v * 60}, 80%, 50%)`;
    } else {
      const v = n.competition ?? 0.5;
      color = `hsl(${360 - v * 60}, 80%, 45%)`;
    }

    const marker = L.circleMarker([site.lat, site.lng], {
      radius: isSelected ? 18 : 12,
      fillColor: color,
      color: isSelected ? '#1e293b' : '#fff',
      weight: isSelected ? 3 : 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(state.map);

    marker.bindTooltip(`<strong>#${site.rank} ${site.zone}</strong><br>Score: ${site.score}`, {
      permanent: false,
      direction: 'top'
    });

    marker.on('click', () => selectSite(site.id));
    state.mapLayers.push(marker);
    bounds.extend([site.lat, site.lng]);
  });

  state.map.fitBounds(bounds, { padding: [50, 50] });
}

function updateMapSiteList() {
  const list   = document.getElementById('site-list');
  const selBox = document.getElementById('radar-site-select');
  
  if (list) list.innerHTML = '';
  if (selBox) selBox.innerHTML = '<option value="">— select zone —</option>';

  state.sites.forEach(site => {
    let color = '#f43f5e';
    if (site.score >= 80) color = '#10b981';
    else if (site.score >= 65) color = '#06b6d4';
    else if (site.score >= 48) color = '#f59e0b';

    const div = document.createElement('div');
    div.className = 'site-item';
    div.id        = `li-${site.id}`;
    div.innerHTML = `
      <div class="site-dot" style="background:${color}; box-shadow:0 0 6px ${color}44"></div>
      <span class="site-name">#${site.rank} ${site.zone}</span>
      <span class="site-score-sm" style="color:${color}">${site.score}</span>
    `;
    div.addEventListener('click', () => selectSite(site.id));
    if (list) list.appendChild(div);

    if (selBox) {
      const opt   = document.createElement('option');
      opt.value   = site.id;
      opt.textContent = `${site.zone} (${site.score})`;
      selBox.appendChild(opt);
    }
  });
}

function renderRadarChart(site) {
  if (!window.Chart) return;
  const ctx = document.getElementById('radar-canvas')?.getContext('2d');
  if (!ctx) return;

  const n    = site.normalized || {};
  const data = [
    Math.round((n.population   ?? 0) * 100),
    Math.round((n.supplyDemand ?? 0) * 100),
    Math.round((1 - (n.competition ?? 0)) * 100),
    Math.round((1 - (n.landCost    ?? 0)) * 100)
  ];

  if (state.chartInstances.radar) state.chartInstances.radar.destroy();

  state.chartInstances.radar = new Chart(ctx, {
    type : 'radar',
    data : {
      labels   : ['Pop Density', 'Demand Gap', 'Low Saturation', 'Cost Efficiency'],
      datasets : [{
        label                : site.zone,
        data,
        backgroundColor      : 'rgba(6,182,212,0.15)',
        borderColor          : '#06b6d4',
        pointBackgroundColor : '#6366f1',
        pointBorderColor     : '#fff',
        pointRadius          : 4,
        borderWidth          : 2
      }]
    },
    options : {
      responsive          : true,
      maintainAspectRatio : false,
      scales : {
        r : {
          suggestedMin  : 0,
          suggestedMax  : 100,
          angleLines    : { color: 'rgba(255,255,255,0.08)' },
          grid          : { color: 'rgba(255,255,255,0.05)' },
          pointLabels   : { color: '#94a3b8', font: { family: 'Inter', size: 11 } },
          ticks         : { display: false }
        }
      },
      plugins : {
        legend  : { display: false },
        tooltip : {
          backgroundColor : '#060a14ee',
          borderColor     : 'rgba(99,102,241,0.3)',
          borderWidth     : 1,
          titleFont       : { family: 'Space Grotesk' },
          bodyFont        : { family: 'Inter' },
          callbacks       : { label: c => ` ${c.parsed.r}%` }
        }
      }
    }
  });
}

function renderForecastChart(site) {
  if (!window.Chart || !site.forecast) return;
  const ctx = document.getElementById('forecast-canvas')?.getContext('2d');
  if (!ctx) return;

  const fc = site.forecast;

  const sumDiv = document.getElementById('forecast-summary');
  if (sumDiv) {
    sumDiv.innerHTML = `
      <div class="fs-item">
        <strong>₹${fc.currentCost.toLocaleString()}</strong>
        <span>Current Cost</span>
      </div>
      <div class="fs-item">
        <strong style="color:var(--indigo)">${fc.cagr}%</strong>
        <span>Est. CAGR</span>
      </div>
      <div class="fs-item">
        <strong style="color:var(--emerald)">${fc.confidenceScore}%</strong>
        <span>Confidence</span>
      </div>
    `;
  }

  if (state.chartInstances.forecast) state.chartInstances.forecast.destroy();

  state.chartInstances.forecast = new Chart(ctx, {
    type : 'line',
    data : {
      labels   : fc.labels,
      datasets : [
        {
          label           : 'Upper Band',
          data            : fc.upperBand,
          borderColor     : 'rgba(167,139,250,0.2)',
          backgroundColor : 'rgba(167,139,250,0.05)',
          borderWidth     : 1,
          borderDash      : [4, 4],
          fill            : false,
          pointRadius     : 0,
          tension         : 0.4
        },
        {
          label           : 'Projected (₹/mo)',
          data            : fc.projected,
          borderColor     : '#a78bfa',
          backgroundColor : 'rgba(167,139,250,0.12)',
          borderWidth     : 3,
          fill            : '+1',
          tension         : 0.4,
          pointBackgroundColor : '#a78bfa',
          pointBorderColor     : '#fff',
          pointRadius          : 4,
          pointHoverRadius     : 6
        },
        {
          label           : 'Lower Band',
          data            : fc.lowerBand,
          borderColor     : 'rgba(167,139,250,0.2)',
          backgroundColor : 'rgba(167,139,250,0.05)',
          borderWidth     : 1,
          borderDash      : [4, 4],
          fill            : false,
          pointRadius     : 0,
          tension         : 0.4
        }
      ]
    },
    options : {
      responsive          : true,
      maintainAspectRatio : false,
      interaction         : { mode: 'index', intersect: false },
      scales : {
        y : {
          grid  : { color: 'rgba(255,255,255,0.04)' },
          ticks : {
            color    : '#64748b',
            font     : { family: 'Inter', size: 10 },
            callback : v => '₹' + (v >= 1000000 ? (v/1000000).toFixed(1)+'L' : (v/1000).toFixed(0)+'k')
          }
        },
        x : {
          grid  : { display: false },
          ticks : { color: '#64748b', font: { family: 'Inter', size: 10 } }
        }
      },
      plugins : {
        legend  : { display: false },
        tooltip : {
          backgroundColor : '#060a14ee',
          borderColor     : 'rgba(167,139,250,0.3)',
          borderWidth     : 1,
          titleFont       : { family: 'Space Grotesk' },
          bodyFont        : { family: 'Inter' },
          callbacks       : {
            label : c => ` ${c.dataset.label}: ₹${c.parsed.y.toLocaleString()}`
          }
        }
      }
    }
  });

  const fdDiv = document.getElementById('forecast-details');
  if (fdDiv) {
    fdDiv.innerHTML = `
      <div class="fd-item">
        <strong>Forecast Stability</strong>
        <span>${fc.confidenceScore > 90 ? 'High' : fc.confidenceScore > 75 ? 'Moderate' : 'Volatile'} based on commercial density and market noise</span>
      </div>
      <div class="fd-item">
        <strong>CAGR Analysis</strong>
        <span>${fc.cagr}% Compound Growth (Standard MCDA Projection)</span>
      </div>
      <div class="fd-item">
        <strong>Projected Value (Yr ${fc.horizonYears})</strong>
        <span>₹${fc.projectedCost.toLocaleString()} per month estimated lease</span>
      </div>
      <div class="fd-item">
        <strong>Risk Margin</strong>
        <span>±${fc.riskBand}% variance at 95% confidence level</span>
      </div>
    `;
  }

  const metaEl = document.getElementById('forecast-meta');
  if (metaEl) metaEl.textContent = `Showing ${fc.horizonYears}-year outlook for ${site.zone}`;
}

function renderNarrative() {
  const section = document.getElementById('narrative-section');
  const body    = document.getElementById('narrative-body');
  if (!section || !body || !state.narrative?.length) return;

  section.style.display = 'block';
  body.innerHTML = state.narrative.map(sec => `
    <h4>${sec.heading}</h4>
    <p>${sec.body}</p>
  `).join('');
}

function initFactorTable() {
  const tbody = document.getElementById('factor-table-body');
  if (!tbody) return;
  tbody.innerHTML = FACTORS.map(f => `
    <tr>
      <td><strong>${f.icon} ${f.name}</strong></td>
      <td>${f.type === 'benefit' ? 'Measures positive potential for the site' : 'Measures cost or negative pressure'}</td>
      <td class="${f.type === 'benefit' ? 'ft-type-benefit' : 'ft-type-cost'}">${f.type === 'benefit' ? 'Benefit (+)' : 'Cost (-)'}</td>
      <td class="ft-weight">${f.default}%</td>
    </tr>
  `).join('');
}

function setLoading(on) {
  const btn     = document.getElementById('analyze-btn');
  const spinner = document.getElementById('analyze-spinner');
  const label   = document.getElementById('analyze-label');
  if (!btn) return;
  btn.style.pointerEvents  = on ? 'none' : 'auto';
  btn.style.opacity        = on ? '0.75' : '1';
  spinner?.classList.toggle('active', on);
  if (label) label.textContent = on ? 'Running Analysis…' : '⚡ Run Analysis';
}

function clearResults() {
  const rc = document.getElementById('ranked-results');
  if (rc) rc.innerHTML = '';
  const ns = document.getElementById('narrative-section');
  if (ns) ns.style.display = 'none';
  document.getElementById('map-legend').style.display = 'none';
}

function setStatus(id, msg, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || 'var(--text-3)';
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setConnBadge(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `conn-dot ${cls}`;
}

function getVal(id, fallback = '') {
  return document.getElementById(id)?.value || fallback;
}

function getNum(id, fallback = 0) {
  return parseFloat(document.getElementById(id)?.value) || fallback;
}

function exportToPDF() {
  if (!state.sites.length) return alert('Run analysis first to generate a report.');
  const element = document.body;
  const opt = {
    margin:       0.5,
    filename:     `GeoVenta_Report_${new Date().getTime()}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
  };
  html2pdf().set(opt).from(element).save();
}

function saveProject() {
  if (!state.sites.length) return alert('No analysis to save.');
  const projectName = prompt('Enter project name:', `Analysis ${new Date().toLocaleDateString()}`);
  if (!projectName) return;
  
  const projects = JSON.parse(localStorage.getItem('gv_projects') || '[]');
  projects.push({ name: projectName, state: { sites: state.sites, meta: state.meta, narrative: state.narrative } });
  localStorage.setItem('gv_projects', JSON.stringify(projects));
  alert(`Project "${projectName}" saved successfully!`);
}
