
(function authGuard() {
  const token = localStorage.getItem('gv_token') || sessionStorage.getItem('gv_token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }
  
  fetch('/api/auth/verify', { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => {
      if (!r.ok && token !== 'demo') window.location.href = '/login.html';
      else if (r.ok) r.json().then(d => injectUserGreeting(d.user));
    })
    .catch(() => {  });
})();

function injectUserGreeting(user) {
  if (!user) return;
  const nav = document.querySelector('.topnav');
  if (!nav) return;
  const greeting = document.createElement('div');
  greeting.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:10px;';
  greeting.innerHTML = `
    <span style="font-size:0.8rem;color:var(--text-3)">Hi, <strong style="color:var(--text-2)">${user.firstName || user.email}</strong></span>
    <button onclick="logout()" style="padding:5px 12px;border-radius:8px;background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.25);color:#f43f5e;font-size:0.78rem;font-weight:600;cursor:pointer;">Sign Out</button>
  `;
  nav.appendChild(greeting);
}

function logout() {
  localStorage.removeItem('gv_token');
  localStorage.removeItem('gv_user');
  sessionStorage.removeItem('gv_token');
  sessionStorage.removeItem('gv_user');
  window.location.href = '/login.html';
}

function authHeader() {
  const token = localStorage.getItem('gv_token') || sessionStorage.getItem('gv_token') || '';
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

const API_BASE = '/api';   

const state = {
  sites          : [],
  selectedSiteId : null,
  narrative      : null,
  meta           : {},
  mapMode        : 'score',
  serverOnline   : false,
  chartInstances : { radar: null, forecast: null }
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
        document.querySelectorAll('.map-ctrl-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`view-${mode}`).classList.add('active');
        state.mapMode = mode;
        drawMapCanvas();
        const lm = document.getElementById('legend-metric');
        if (lm) lm.textContent = mode.toUpperCase();
      });
  });

  
  document.getElementById('radar-site-select')
    ?.addEventListener('change', e => selectSite(e.target.value));
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
        headers : { 'Content-Type': 'application/json', ...authHeader() },
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
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

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
  setupMapCanvas();
  updateMapSiteList();
  renderNarrative();

  if (state.sites.length > 0) {
    selectSite(state.sites[0].id);
    document.getElementById('map-legend').style.display = 'flex';
  }
}

function renderRankings() {
  const container = document.getElementById('ranked-results');
  if (!container) return;
  container.innerHTML = '';

  state.sites.forEach(site => {
    const g = site.grade || gradeClient(site.score);
    const ringCircumference = 2 * Math.PI * 28;
    const ringOffset        = ringCircumference * (1 - site.score / 100);

    let ringColor = '#f43f5e';
    if (site.score >= 80) ringColor = '#10b981';
    else if (site.score >= 65) ringColor = '#06b6d4';
    else if (site.score >= 48) ringColor = '#f59e0b';

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

/* ── Site selection ──────────────────────────────────────────────────── */
function selectSite(siteId) {
  if (!siteId) return;
  state.selectedSiteId = siteId;
  const site = state.sites.find(s => s.id === siteId);
  if (!site) return;

  document.querySelectorAll('.result-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`rc-${siteId}`)?.classList.add('selected');
  document.querySelectorAll('.site-item').forEach(c => c.classList.remove('active'));
  document.getElementById(`li-${siteId}`)?.classList.add('active');

  const sel = document.getElementById('radar-site-select');
  if (sel) sel.value = siteId;

  drawMapCanvas();
  renderRadarChart(site);
  renderForecastChart(site);
}

function setupMapCanvas() {
  const stage = document.getElementById('map-stage');
  if (!stage) return;
  stage.innerHTML = '<canvas id="map-canvas" style="width:100%;height:100%;display:block;"></canvas>';
  const stage_r = stage.getBoundingClientRect();
  const canvas  = document.getElementById('map-canvas');
  const dpr     = window.devicePixelRatio || 1;
  canvas.width  = stage_r.width  * dpr;
  canvas.height = stage_r.height * dpr;
  canvas.style.width  = stage_r.width  + 'px';
  canvas.style.height = stage_r.height + 'px';
  drawMapCanvas();
}

function drawMapCanvas() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas || !state.sites.length) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.width;
  const H   = canvas.height;
  ctx.clearRect(0, 0, W, H);

  
  ctx.strokeStyle = 'rgba(99,102,241,0.06)';
  ctx.lineWidth   = 1;
  for (let x = 0; x < W; x += 40 * dpr) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40 * dpr) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  
  const lats = state.sites.map(s => s.lat);
  const lngs = state.sites.map(s => s.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pad = 0.12;

  function project(lat, lng) {
    const nx = (lng - minLng) / (maxLng - minLng || 1);
    const ny = (lat - minLat) / (maxLat - minLat || 1);
    return {
      x: (pad + nx * (1 - 2 * pad)) * W,
      y: ((1 - pad) - ny * (1 - 2 * pad)) * H
    };
  }

  
  ctx.strokeStyle = 'rgba(99,102,241,0.12)';
  ctx.lineWidth   = 1.5 * dpr;
  ctx.setLineDash([4 * dpr, 6 * dpr]);
  ctx.beginPath();
  state.sites.forEach((s, i) => {
    const p = project(s.lat, s.lng);
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  
  state.sites.forEach(site => {
    const p          = project(site.lat, site.lng);
    const isSelected = site.id === state.selectedSiteId;
    const n          = site.normalized || {};

    let color = '#64748b';
    let radius;

    if (state.mapMode === 'score') {
      radius = (7 + (site.score / 100) * 14) * dpr;
      if (site.score >= 80) color = '#10b981';
      else if (site.score >= 65) color = '#06b6d4';
      else if (site.score >= 48) color = '#f59e0b';
      else color = '#f43f5e';
    } else if (state.mapMode === 'density') {
      const v = n.population ?? 0.5;
      radius  = (6 + v * 16) * dpr;
      color   = `hsl(${195 + v * 60}, 80%, ${50 + v * 20}%)`;
    } else {
      const v = n.competition ?? 0.5;
      radius  = (6 + v * 16) * dpr;
      color   = `hsl(${360 - v * 60}, 80%, ${45 + v * 15}%)`;
    }

    if (isSelected) radius += 5 * dpr;

    
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 3);
    grad.addColorStop(0, color + '55');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 3, 0, Math.PI * 2);
    ctx.fill();

    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();

    
    if (isSelected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2.5 * dpr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 4 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }

    
    ctx.fillStyle   = '#f1f5f9';
    ctx.font        = `${isSelected ? 'bold ' : ''}${11 * dpr}px 'Inter', sans-serif`;
    ctx.textAlign   = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 4 * dpr;
    ctx.fillText(site.zone, p.x, p.y - radius - 7 * dpr);
    ctx.shadowBlur  = 0;

    
    if (state.mapMode === 'score') {
      ctx.fillStyle = color;
      ctx.font      = `bold ${10 * dpr}px 'Space Grotesk', sans-serif`;
      ctx.fillText(site.score, p.x, p.y + 3 * dpr);
    }
  });
}

function updateMapSiteList() {
  const list   = document.getElementById('site-list');
  const selBox = document.getElementById('radar-site-select');
  if (!list) return;
  list.innerHTML = '';
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
    list.appendChild(div);

    if (selBox) {
      const opt   = document.createElement('option');
      opt.value   = site.id;
      opt.textContent = `${site.zone} (${site.score})`;
      selBox.appendChild(opt);
    }
  });
}

/* ===========================================================
   RADAR CHART
   =========================================================== */
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

/* ===========================================================
   FORECAST CHART
   =========================================================== */
function renderForecastChart(site) {
  if (!window.Chart || !site.forecast) return;
  const ctx = document.getElementById('forecast-canvas')?.getContext('2d');
  if (!ctx) return;

  const fc = site.forecast;

  // Update summary tiles
  const sumDiv = document.getElementById('forecast-summary');
  if (sumDiv) {
    sumDiv.innerHTML = `
      <div class="fs-item">
        <strong>₹${fc.currentCost.toLocaleString()}</strong>
        <span>Current Cost / mo</span>
      </div>
      <div class="fs-item">
        <strong>${fc.cagr}%</strong>
        <span>Est. CAGR</span>
      </div>
      <div class="fs-item">
        <strong>₹${fc.projectedCost.toLocaleString()}</strong>
        <span>Yr ${fc.horizonYears} Projection</span>
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

  // Forecast details
  const fdDiv = document.getElementById('forecast-details');
  if (fdDiv) {
    fdDiv.innerHTML = `
      <div class="fd-item">
        <strong>Annual Growth Rate</strong>
        <span>${fc.annualGrowthRate}% blended (score + city base + demand pressure)</span>
      </div>
      <div class="fd-item">
        <strong>Total Return (${fc.horizonYears}yr)</strong>
        <span>${fc.totalReturn}% over the forecast period</span>
      </div>
      <div class="fd-item">
        <strong>Confidence Band</strong>
        <span>±${fc.riskBand}% at 95% confidence (volatility model)</span>
      </div>
      <div class="fd-item">
        <strong>Site Score Driver</strong>
        <span>Higher MCDA score (${site.score}/100) amplifies appreciation forecast</span>
      </div>
    `;
  }

  const metaEl = document.getElementById('forecast-meta');
  if (metaEl) metaEl.textContent = `Showing ${fc.horizonYears}-year outlook for ${site.zone}`;
}

/* ===========================================================
   NARRATIVE
   =========================================================== */
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

/* ===========================================================
   FACTOR TABLE
   =========================================================== */
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

/* ===========================================================
   UI HELPERS
   =========================================================== */
function setLoading(on) {
  const btn     = document.getElementById('analyze-btn');
  const spinner = document.getElementById('analyze-spinner');
  const label   = document.getElementById('analyze-label');
  if (!btn) return;
  btn.style.pointerEvents  = on ? 'none' : 'auto';
  btn.style.opacity        = on ? '0.75' : '1';
  spinner?.classList.toggle('active', on);
  if (label) label.textContent = on ? 'Running Analysis…' : '⚡ Analyze Best Locations';
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
  el.textContent = text;
  el.className   = `conn-badge ${cls}`;
}

function getVal(id, fallback = '') {
  return document.getElementById(id)?.value || fallback;
}

function getNum(id, fallback = 0) {
  return parseFloat(document.getElementById(id)?.value) || fallback;
}
