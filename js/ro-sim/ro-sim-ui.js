import { getView } from '../router.js';
import { qs, qsa, escapeHtml } from '../utils.js';
import { simulate, tdsToEc, ecToTds } from './engine.js';
import { MEMBRANES } from './membranes.js';
import { barChart, lineChart, fmt } from './charts.js';

const STORAGE_KEY = 'ro-sim-state';
const PLP_UI = 2; // LP feed pressure, matches the engine

const DEFAULTS = {
  mode: 'flow',
  membrane: 'TM820V-440',
  concUnit: 'tds',
  feedTds: 38000,
  feedEc: 53500,
  temp: 25,
  ph: 8.0,
  feedBoron: 5.0,
  elements: 7,
  vessels: 105,
  age: 0,
  fouling: 0,
  source: 'open',
  permTarget: 10000,
  recoveryTarget: 45,
  feedFlow: 22000,
  feedPressure: 62,
  permPressure: 0.5,
  split: 0,
  frontPermPressure: 0.5,
  pumpEff: 82,
  erd: 'isobaric',
  erdEff: 96,
  erdMixing: 5,
  erdLeak: 2,
};

const SOURCES = {
  open: { label: 'Open intake, conventional pretreatment', flux: 14 },
  uf: { label: 'Open intake, UF pretreatment', flux: 16 },
  well: { label: 'Beach well', flux: 17 },
};

// Numeric inputs. `modes` limits a slider to one operating mode, `conc` to one
// concentration unit, `erds` to some ERD types; `needsSplit` to split-permeate.
const NUMERIC = [
  { id: 'feedTds', group: 'feed', label: 'Feed TDS (salinity)', unit: 'mg/L', min: 20000, max: 50000, step: 500, digits: 0, conc: 'tds' },
  { id: 'feedEc', group: 'feed', label: 'Feed conductivity', unit: 'µS/cm', min: 30000, max: 70000, step: 250, digits: 0, conc: 'ec' },
  { id: 'temp', group: 'feed', label: 'Feed temperature', unit: '°C', min: 10, max: 40, step: 0.5, digits: 1 },
  { id: 'ph', group: 'feed', label: 'Feed pH', unit: '', min: 6, max: 10.5, step: 0.1, digits: 1 },
  { id: 'feedBoron', group: 'feed', label: 'Feed boron', unit: 'mg/L', min: 3, max: 7, step: 0.1, digits: 1 },
  { id: 'elements', group: 'membrane', label: 'Elements per vessel', unit: '', min: 1, max: 8, step: 1, digits: 0 },
  { id: 'vessels', group: 'membrane', label: 'Pressure vessels (parallel)', unit: '', min: 10, max: 300, step: 1, digits: 0 },
  { id: 'age', group: 'membrane', label: 'Membrane age', unit: 'years', min: 0, max: 7, step: 0.5, digits: 1 },
  { id: 'fouling', group: 'membrane', label: 'Fouling (permeability loss)', unit: '%', min: 0, max: 40, step: 1, digits: 0 },
  { id: 'permTarget', group: 'operation', label: 'Product flow target', unit: 'm³/d', min: 1000, max: 40000, step: 250, digits: 0, modes: ['flow'] },
  { id: 'recoveryTarget', group: 'operation', label: 'Recovery target', unit: '%', min: 25, max: 60, step: 0.5, digits: 1, modes: ['flow'] },
  { id: 'feedPressure', group: 'operation', label: 'Feed pressure', unit: 'bar', min: 35, max: 85, step: 0.5, digits: 1, modes: ['pressure'] },
  { id: 'feedFlow', group: 'operation', label: 'Feed flow', unit: 'm³/d', min: 2000, max: 90000, step: 250, digits: 0, modes: ['pressure'] },
  { id: 'split', group: 'permeate', label: 'Front permeate elements (0 = single permeate)', unit: '', min: 0, max: 7, step: 1, digits: 0 },
  { id: 'frontPermPressure', group: 'permeate', label: 'Front permeate back-pressure', unit: 'bar', min: 0, max: 5, step: 0.1, digits: 1, needsSplit: true },
  { id: 'permPressure', group: 'permeate', label: 'Rear / common permeate back-pressure', unit: 'bar', min: 0, max: 5, step: 0.1, digits: 1 },
  { id: 'pumpEff', group: 'energy', label: 'HP pump + motor efficiency', unit: '%', min: 60, max: 92, step: 1, digits: 0 },
  { id: 'erdEff', group: 'energy', label: 'ERD efficiency', unit: '%', min: 50, max: 98, step: 1, digits: 0, erds: ['isobaric', 'turbine'] },
  { id: 'erdMixing', group: 'energy', label: 'ERD volumetric mixing (brine into feed)', unit: '%', min: 0, max: 12, step: 0.5, digits: 1, erds: ['isobaric'] },
  { id: 'erdLeak', group: 'energy', label: 'ERD lubrication / leakage flow', unit: '%', min: 0, max: 6, step: 0.5, digits: 1, erds: ['isobaric'] },
];
const numeric = (id) => NUMERIC.find((n) => n.id === id);

function isVisible(n) {
  if (n.modes && !n.modes.includes(state.mode)) return false;
  if (n.conc && n.conc !== state.concUnit) return false;
  if (n.erds && !n.erds.includes(state.erd)) return false;
  if (n.needsSplit && !(state.split > 0)) return false;
  return true;
}

function refreshVisibility() {
  qsa('[data-wrap]').forEach((w) => { w.hidden = !isVisible(numeric(w.dataset.wrap)); });
}

// The TDS-based metric id, or its conductivity twin when showing conductivity.
const EC_TWIN = {
  permTds: 'permCond', concTds: 'concCond', feedTds: 'feedCond', membraneFeedTds: 'membraneFeedCond',
  frontTds: 'frontCond', rearTds: 'rearCond',
};
const cu = (id) => (state.concUnit === 'ec' && EC_TWIN[id]) || id;
const other = (id) => (state.concUnit === 'ec' ? id : EC_TWIN[id]);

// Output metrics. `better` drives the better/worse tag on deltas.
const METRICS = [
  { id: 'permTds', group: 'product', label: 'Permeate TDS', unit: 'mg/L', digits: 0, better: 'lower' },
  { id: 'permCond', group: 'product', label: 'Permeate conductivity', unit: 'µS/cm', digits: 0, better: 'lower' },
  { id: 'permCl', group: 'product', label: 'Permeate chloride', unit: 'mg/L', digits: 0, better: 'lower' },
  { id: 'permBoron', group: 'product', label: 'Permeate boron', unit: 'mg/L', digits: 2, better: 'lower' },
  { id: 'rejection', group: 'product', label: 'Salt rejection', unit: '%', digits: 2, better: 'higher', scale: 100 },
  { id: 'boronRejection', group: 'product', label: 'Boron rejection', unit: '%', digits: 1, better: 'higher', scale: 100 },
  { id: 'permFlow', group: 'production', label: 'Product flow', unit: 'm³/d', digits: 0, better: 'higher' },
  { id: 'recovery', group: 'production', label: 'Recovery', unit: '%', digits: 1, better: 'higher', scale: 100 },
  { id: 'feedPressure', group: 'production', label: 'Feed pressure', unit: 'bar', digits: 1, better: 'lower' },
  { id: 'sec', group: 'production', label: 'Specific energy', unit: 'kWh/m³', digits: 2, better: 'lower' },
  { id: 'avgFlux', group: 'production', label: 'Average flux', unit: 'LMH', digits: 1 },
  { id: 'concTds', group: 'production', label: 'Brine TDS', unit: 'mg/L', digits: 0 },
  { id: 'concCond', group: 'production', label: 'Brine conductivity', unit: 'µS/cm', digits: 0 },
  { id: 'feedCond', group: 'feed', label: 'Feed conductivity', unit: 'µS/cm', digits: 0 },
  { id: 'feedTds', group: 'feed', label: 'Feed TDS', unit: 'mg/L', digits: 0 },
  { id: 'membraneFeedTds', group: 'feed', label: 'Membrane feed TDS (after ERD)', unit: 'mg/L', digits: 0, better: 'lower' },
  { id: 'membraneFeedCond', group: 'feed', label: 'Membrane feed conductivity (after ERD)', unit: 'µS/cm', digits: 0, better: 'lower' },
  { id: 'salinityIncrease', group: 'feed', label: 'Feed salinity increase from ERD', unit: '%', digits: 2, better: 'lower', scale: 100 },
  { id: 'frontFlow', group: 'split', label: 'Front permeate flow', unit: 'm³/d', digits: 0 },
  { id: 'frontTds', group: 'split', label: 'Front permeate TDS', unit: 'mg/L', digits: 0, better: 'lower' },
  { id: 'frontCond', group: 'split', label: 'Front permeate conductivity', unit: 'µS/cm', digits: 0, better: 'lower' },
  { id: 'frontBoron', group: 'split', label: 'Front permeate boron', unit: 'mg/L', digits: 2, better: 'lower' },
  { id: 'rearFlow', group: 'split', label: 'Rear permeate flow', unit: 'm³/d', digits: 0 },
  { id: 'rearTds', group: 'split', label: 'Rear permeate TDS', unit: 'mg/L', digits: 0, better: 'lower' },
  { id: 'rearCond', group: 'split', label: 'Rear permeate conductivity', unit: 'µS/cm', digits: 0, better: 'lower' },
  { id: 'rearBoron', group: 'split', label: 'Rear permeate boron', unit: 'mg/L', digits: 2, better: 'lower' },
  { id: 'secNoErd', group: 'production', label: 'Specific energy without ERD', unit: 'kWh/m³', digits: 2, better: 'lower' },
  { id: 'feedFlow', group: 'production', label: 'Feed flow', unit: 'm³/d', digits: 0 },
  { id: 'pressureDrop', group: 'production', label: 'Vessel pressure drop', unit: 'bar', digits: 2, better: 'lower' },
  { id: 'totalKw', group: 'production', label: 'Total pump power', unit: 'kW', digits: 0, better: 'lower' },
  { id: 'leadFlux', group: 'production', label: 'Lead element flux', unit: 'LMH', digits: 1 },
];
const metric = (id) => METRICS.find((m) => m.id === id);
const metricValue = (res, id) => res[id] * (metric(id).scale || 1);

const PROFILE_METRICS = [
  { id: 'flux', label: 'Flux', unit: 'LMH', digits: 1 },
  { id: 'permTds', label: 'Permeate TDS', unit: 'mg/L', digits: 0, conc: 'tds' },
  { id: 'permEc', label: 'Permeate conductivity', unit: 'µS/cm', digits: 0, conc: 'ec' },
  { id: 'ndp', label: 'Net driving pressure', unit: 'bar', digits: 1 },
  { id: 'feedTds', label: 'Feed-side TDS', unit: 'mg/L', digits: 0, conc: 'tds' },
  { id: 'feedEc', label: 'Feed-side conductivity', unit: 'µS/cm', digits: 0, conc: 'ec' },
  { id: 'feedPressure', label: 'Feed pressure', unit: 'bar', digits: 1 },
  { id: 'beta', label: 'Polarisation β', unit: '', digits: 3 },
];

// Cause → effect explanations, keyed by input id.
const EXPLAIN = {
  feedTds: 'Saltier feed has a higher osmotic pressure (≈0.8 bar per 1 g/L). Less of the applied pressure is left as net driving pressure, so you need more pressure for the same flow. Salt passage rises because the membrane surface is saltier, and the brine gets close to the pressure limit sooner.',
  temp: 'Warmer water is less viscous, so the membrane passes ~3 % more water per °C — the required pressure drops. But salt and boron diffuse even faster (≈4–6 %/°C), so permeate quality gets worse. Cold water: lower salt passage, higher pressure and energy.',
  ph: 'pH barely changes salt rejection, but it controls boron. Boric acid (B(OH)₃) is small and uncharged, so it slips through the membrane. Above pH ~8.6 it converts to the borate ion B(OH)₄⁻, which is rejected like salt. Raising pH lowers permeate boron sharply, but raises CaCO₃/Mg(OH)₂ scaling risk.',
  feedEc: 'Conductivity is how most plants measure salinity online. Seawater TDS is about 0.70 × conductivity (54,000 µS/cm ≈ 38,000 mg/L). Higher conductivity means saltier feed: higher osmotic pressure, more pressure needed, and more salt passage.',
  concUnit: 'Conductivity and TDS describe the same salt. TDS (mg/L) is what the physics uses; conductivity (µS/cm) is what the online analysers read. The ratio is not constant: about 0.5 for dilute permeate, about 0.70 for seawater and about 0.75 for brine.',
  split: 'With a split-permeate vessel, a plug in the permeate tube separates the lead elements (front port) from the tail elements (rear port). The lead elements see the cleanest, lowest-osmotic feed and the highest driving pressure, so the front permeate is much cleaner. The rear permeate is saltier and higher in boron, and often goes to a second pass. Moving the plug back gives more front permeate, but it gets saltier.',
  frontPermPressure: 'Raising the front permeate back-pressure throttles the lead elements. They make less water, so the tail elements must make more, which evens out the flux along the vessel and slows lead-element fouling. The cost: front permeate gets slightly saltier and the feed pressure must rise to keep production.',
  erdMixing: 'In a pressure exchanger, brine and seawater meet in the same rotor ducts, so a little brine mixes into the seawater it pressurises. The membranes then see a saltier feed. That raises the osmotic pressure, so more feed pressure is needed and permeate quality gets slightly worse. Plants limit this with overflush (sending a bit more LP seawater through the ERD).',
  erdLeak: 'Lubrication flow leaks from the high-pressure side of the ERD to the low-pressure brine outlet. The HP pump has to make up that lost flow, so leakage costs energy directly.',
  feedBoron: 'Permeate boron is roughly proportional to feed boron at a fixed boron rejection. Typical seawater has 4–6 mg/L.',
  elements: 'More elements in series means more membrane area. Average flux falls, so less pressure is needed, but the tail elements see high salinity and little driving pressure. They add area without adding much water, and their permeate is saltier.',
  vessels: 'More vessels in parallel spread the same production over more membrane area. Flux and pressure fall, which saves energy and slows fouling. But at lower flux the salt (which passes at a roughly constant rate) is diluted in less water, so permeate TDS rises.',
  age: 'Over time membranes compact and degrade: permeability falls (~7 %/yr here), so more pressure is needed, and salt passage rises (~10 %/yr), so permeate quality gets worse.',
  fouling: 'Fouling coats the membrane and cuts water permeability, and it raises the channel pressure drop. To keep production, the plant must raise feed pressure, which means more energy. At fixed pressure, production falls instead.',
  source: 'Changing the intake type only changes the design flux guideline used for warnings. Better pretreatment tolerates higher flux before fouling becomes a problem.',
  permTarget: 'Asking for more product from the same membranes raises the flux. That needs more pressure. The permeate gets slightly cleaner because there is more water to dilute the salt that passes.',
  recoveryTarget: 'Higher recovery means less feed per m³ of product (smaller intake and pretreatment). But the brine gets saltier, so the osmotic pressure at the tail rises: feed pressure climbs, permeate quality gets worse and scaling risk grows. SEC often has a minimum around 40–50 %.',
  feedPressure: 'More pressure means more net driving pressure, so more permeate and higher recovery. Quality improves, because the salt flux stays almost constant while the water flux rises (the dilution effect). The limits: the brine osmotic pressure catches up, the element maximum pressure, and energy cost.',
  feedFlow: 'At a fixed pressure, more feed flow sweeps the membrane faster. That reduces concentration polarisation and keeps the brine less concentrated, so production rises slightly and recovery falls. Too much flow causes high pressure drop.',
  permPressure: 'Back-pressure on the permeate side subtracts directly from the net driving pressure. Every bar of back-pressure must be added to the feed pressure. In a split-permeate vessel this is the rear port pressure.',
  pumpEff: 'Pump efficiency doesn\'t change the water at all, only the electricity bill. SEC scales roughly with 1/efficiency.',
  erdEff: 'The energy-recovery device returns brine pressure energy to the feed. Better ERD efficiency means less work for the pumps.',
  erd: 'Without energy recovery, the ~55 % of the flow that leaves as brine throws away its pressure energy, which roughly doubles SEC. Isobaric pressure exchangers (~95–97 %) beat Pelton turbines (~85–90 %).',
  membrane: 'Toray membranes trade permeability against rejection. High-rejection grades (K/R) give the best salt and boron removal but need more pressure. Low-energy grades (E/L) produce more water per bar but pass more salt and boron.',
  mode: 'Fixed product flow & recovery is how most plants are operated: the operator holds production and lets feed pressure float. Fixed pressure & feed flow shows the raw physics: change something and watch production change.',
};

let state = loadState();
let baseline = null;
let lastChanged = null;
let prevResult = null;
let current = null;
let profileMetric = 'flux';
let sweepX = 'temp';
let sweepY = 'feedPressure';
let resizeObs = null;
let sweepTimer = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { ...DEFAULTS };
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function simInput(s = state) {
  const feedTds = s.concUnit === 'ec' ? ecToTds(s.feedEc) : s.feedTds;
  return { ...s, feedTds, fluxLimit: SOURCES[s.source].flux };
}

function sliderHtml(n) {
  const v = state[n.id];
  const hidden = !isVisible(n);
  const max = n.id === 'split' ? state.elements - 1 : n.max;
  return `
    <div class="ro-slider" data-wrap="${n.id}" ${hidden ? 'hidden' : ''}>
      <div class="ro-slider-head">
        <label for="ro-${n.id}">${escapeHtml(n.label)}</label>
        <span class="ro-slider-val"><input type="number" id="ro-${n.id}-num" data-num="${n.id}" value="${v}" step="${n.step}" min="${n.min}" max="${max}" inputmode="decimal" aria-label="${escapeHtml(n.label)} value" />${n.unit ? `<span class="ro-unit">${escapeHtml(n.unit)}</span>` : ''}</span>
      </div>
      <input type="range" id="ro-${n.id}" data-range="${n.id}" min="${n.min}" max="${max}" step="${n.step}" value="${v}" />
    </div>`;
}

function group(id) {
  return NUMERIC.filter((n) => n.group === id).map(sliderHtml).join('');
}

function selectHtml(id, label, options) {
  return `
    <div class="field">
      <label for="ro-${id}">${escapeHtml(label)}</label>
      <select id="ro-${id}" data-select="${id}">
        ${options.map((o) => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(state[id]) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
      </select>
    </div>`;
}

function shell() {
  return `
    <a class="back-link" href="#/">&larr; Home</a>
    <div class="section-title">SWRO Simulator · Toray TM800 elements</div>
    <div class="card">
      <h3>How to use it</h3>
      <p>Move one slider at a time and watch the <strong>Product</strong> (water quality) and <strong>Production</strong> (flow, pressure, energy) numbers. Tap <strong>Pin baseline</strong> first to see every change as a difference from where you started. The <em>What just happened</em> panel explains the physics of your last change.</p>
    </div>

    <div class="chip-row" role="group" aria-label="Operating mode">
      <button type="button" class="chip ${state.mode === 'flow' ? 'active' : ''}" data-mode="flow">Fixed product flow &amp; recovery</button>
      <button type="button" class="chip ${state.mode === 'pressure' ? 'active' : ''}" data-mode="pressure">Fixed feed pressure &amp; flow</button>
    </div>
    <div class="ro-unit-row" role="group" aria-label="Concentration units">
      <span>Concentration in</span>
      <button type="button" class="chip ${state.concUnit === 'tds' ? 'active' : ''}" data-conc="tds">TDS, mg/L</button>
      <button type="button" class="chip ${state.concUnit === 'ec' ? 'active' : ''}" data-conc="ec">Conductivity, µS/cm</button>
    </div>

    <div class="ro-mini" id="ro-mini" aria-live="polite"></div>
    <div id="ro-kpis"></div>
    <div class="btn-row ro-actions">
        <button type="button" class="btn" id="ro-pin">Pin baseline</button>
        <button type="button" class="btn" id="ro-clear-pin" hidden>Clear baseline</button>
      <button type="button" class="btn" id="ro-reset">Reset inputs</button>
    </div>
    <div id="ro-more"></div>

    <div id="ro-warnings"></div>
    <div id="ro-explain"></div>

    <details class="card ro-group" open>
      <summary>Feed water</summary>
      ${group('feed')}
      ${selectHtml('source', 'Intake / pretreatment (sets flux guideline)', Object.entries(SOURCES).map(([value, s]) => ({ value, label: `${s.label} (≤${s.flux} LMH)` })))}
    </details>

    <details class="card ro-group" open>
      <summary>Membranes &amp; array</summary>
      ${selectHtml('membrane', 'Toray element', MEMBRANES.map((m) => ({ value: m.id, label: m.label })))}
      <p class="ro-note" id="ro-membrane-note"></p>
      ${group('membrane')}
    </details>

    <details class="card ro-group" open>
      <summary>Operation</summary>
      ${group('operation')}
    </details>

    <details class="card ro-group" open>
      <summary>Permeate collection: front &amp; rear</summary>
      <p class="ro-note">Set how many lead elements drain to the front permeate port. The rest drain to the rear port.</p>
      ${group('permeate')}
      <div id="ro-ports"></div>
    </details>

    <details class="card ro-group" open>
      <summary>Energy recovery &amp; pumps</summary>
      ${selectHtml('erd', 'Energy-recovery device', [
        { value: 'isobaric', label: 'Isobaric pressure exchanger' },
        { value: 'turbine', label: 'Pelton / turbocharger' },
        { value: 'none', label: 'None (brine throttled)' },
      ])}
      ${group('energy')}
      <div id="ro-energy"></div>
      <div class="ro-subhead">Stream table</div>
      <div id="ro-streams"></div>
    </details>

    <div class="section-title">What-if sweep</div>
    <div class="card">
      <p>Sweeps one input across its whole range with everything else held at the current settings. The dot is where you are now.</p>
      <div class="grid-2 ro-sweep-controls">
        <div class="field">
          <label for="ro-sweep-x">Change this input</label>
          <select id="ro-sweep-x"></select>
        </div>
        <div class="field">
          <label for="ro-sweep-y">Watch this result</label>
          <select id="ro-sweep-y"></select>
        </div>
      </div>
      <div id="ro-sweep-chart"></div>
    </div>

    <div class="section-title">Inside the pressure vessel</div>
    <div class="card">
      <p>One vessel, feed enters element 1 and the brine leaves element <span id="ro-n-el"></span>. Water is pulled out at every step, so the feed gets saltier and the driving pressure falls along the vessel.</p>
      <div class="chip-row" id="ro-profile-chips" role="group" aria-label="Element profile metric">
        ${profileChips()}
      </div>
      <div id="ro-profile-chart"></div>
      <details class="ro-table-wrap">
        <summary>Element table</summary>
        <div id="ro-element-table"></div>
      </details>
    </div>

    <details class="card ro-group">
      <summary>Key relationships cheat-sheet</summary>
      <ul class="ro-learn">
        <li><strong>Water flux</strong> J<sub>w</sub> = A · (ΔP − Δπ). Only the <em>net driving pressure</em> makes water.</li>
        <li><strong>Salt flux</strong> J<sub>s</sub> = B · (C<sub>membrane</sub> − C<sub>permeate</sub>) does <em>not</em> depend on pressure. More water through the same salt flux means cleaner permeate.</li>
        <li><strong>Osmotic pressure</strong> ≈ 0.79 bar per g/L TDS. Seawater at 38 g/L is ~30 bar; brine at 45 % recovery is ~54 bar.</li>
        <li><strong>Concentration polarisation</strong> β = e<sup>J/k</sup>: salt piles up at the membrane wall, more so at high flux or low crossflow.</li>
        <li><strong>Temperature</strong>: +1 °C means ≈ +3 % water permeability and ≈ +4–6 % salt/boron passage.</li>
        <li><strong>Boron</strong>: boric acid pK<sub>a</sub> ≈ 8.6 in seawater. Above it, boron becomes a charged ion and is rejected well.</li>
        <li><strong>Conductivity ↔ TDS</strong>: TDS ≈ 0.70 × EC for seawater, ≈ 0.75 for brine, ≈ 0.5 for permeate.</li>
        <li><strong>Front / rear permeate</strong>: lead elements make the cleanest water. Splitting the permeate gives a low-TDS front product and a saltier rear stream for a second pass.</li>
        <li><strong>Isobaric ERD</strong>: the HP pump only supplies about the permeate flow. The ERD + booster supply the rest, so mixing and leakage matter.</li>
        <li><strong>SEC</strong> = pump power ÷ product flow. With an isobaric ERD, seawater RO typically runs at ~2.2–3.5 kWh/m³.</li>
      </ul>
    </details>

    <p class="disclaimer">This is a teaching model, not a design tool. Element specs are approximate public figures for Toray TM800-series 8″ elements (32,000 mg/L NaCl, 55.2 bar, 25 °C, 8 % recovery). Transport parameters are back-calculated from them. Use Toray's own design software (TorayDS) for real projections.</p>
  `;
}

function deltaHtml(id, value) {
  if (!baseline) return '';
  const base = metricValue(baseline, id);
  const m = metric(id);
  const diff = value - base;
  const rel = base !== 0 ? diff / Math.abs(base) : 0;
  if (Math.abs(diff) < 0.5 * 10 ** -m.digits || Math.abs(rel) < 0.0005) return '<div class="ro-delta">= baseline</div>';
  const arrow = diff > 0 ? '▲' : '▼';
  let tag = '';
  if (m.better) {
    const good = (m.better === 'higher') === (diff > 0);
    tag = `<span class="ro-tag ${good ? 'good' : 'bad'}">${good ? '✓ better' : '✕ worse'}</span>`;
  }
  return `<div class="ro-delta">${arrow} ${diff > 0 ? '+' : ''}${fmt(diff, m.digits)} (${rel > 0 ? '+' : ''}${(rel * 100).toFixed(1)} %) ${tag}</div>`;
}

function tile(res, id) {
  const m = metric(id);
  const v = metricValue(res, id);
  return `
    <div class="ro-kpi">
      <div class="ro-kpi-label">${escapeHtml(m.label)}</div>
      <div class="ro-kpi-value">${fmt(v, m.digits)}<span class="ro-unit">${escapeHtml(m.unit)}</span></div>
      ${deltaHtml(id, v)}
    </div>`;
}

function renderKpis(res) {
  qs('#ro-kpis').innerHTML = `
    <div class="ro-kpi-group">
      <div class="ro-kpi-title">Product · water quality</div>
      <div class="ro-kpi-grid">${[cu('permTds'), 'permBoron', other('permTds'), 'rejection'].map((id) => tile(res, id)).join('')}</div>
    </div>
    <div class="ro-kpi-group">
      <div class="ro-kpi-title">Production · quantity &amp; cost</div>
      <div class="ro-kpi-grid">${['permFlow', 'recovery', 'feedPressure', 'sec'].map((id) => tile(res, id)).join('')}</div>
    </div>`;
  const more = qs('#ro-more');
  const wasOpen = more.querySelector('details')?.open;
  more.innerHTML = `
    <details class="ro-more" ${wasOpen ? 'open' : ''}>
      <summary>More results</summary>
      <div class="ro-kpi-grid">${['permCl', 'boronRejection', 'avgFlux', 'leadFlux', cu('concTds'), cu('membraneFeedTds'), 'feedFlow', 'pressureDrop'].map((id) => tile(res, id)).join('')}</div>
      <div class="fact-table">
        <div class="fact-row"><span class="fact-key">Feed (intake)</span><span class="fact-val">${fmt(res.feedTds, 0)} mg/L · ${fmt(res.feedCond, 0)} µS/cm</span></div>
        <div class="fact-row"><span class="fact-key">Brine</span><span class="fact-val">${fmt(res.concTds, 0)} mg/L · ${fmt(res.concCond, 0)} µS/cm</span></div>
        <div class="fact-row"><span class="fact-key">Membrane feed osmotic pressure</span><span class="fact-val">${fmt(res.feedOsmotic, 1)} bar</span></div>
        <div class="fact-row"><span class="fact-key">Brine osmotic pressure</span><span class="fact-val">${fmt(res.concOsmotic, 1)} bar</span></div>
        <div class="fact-row"><span class="fact-key">Brine pressure leaving vessel</span><span class="fact-val">${fmt(res.concPressure, 1)} bar</span></div>
        <div class="fact-row"><span class="fact-key">Brine flow</span><span class="fact-val">${fmt(res.concFlow, 0)} m³/d</span></div>
        <div class="fact-row"><span class="fact-key">Feed flow per vessel</span><span class="fact-val">${fmt(res.feedPerVessel, 2)} m³/h</span></div>
        <div class="fact-row"><span class="fact-key">Max polarisation factor β</span><span class="fact-val">${fmt(res.maxBeta, 3)}</span></div>
        <div class="fact-row"><span class="fact-key">Boron present as borate ion</span><span class="fact-val">${fmt(res.borateFraction * 100, 1)} %</span></div>
        <div class="fact-row"><span class="fact-key">Total membrane area</span><span class="fact-val">${fmt(res.totalArea, 0)} m²</span></div>
      </div>
    </details>`;
}

// Compact always-visible strip so results stay in view while dragging sliders.
function renderMini(res) {
  const ids = state.mode === 'flow'
    ? [cu('permTds'), 'permBoron', 'feedPressure', 'sec']
    : [cu('permTds'), 'permFlow', 'recovery', 'sec'];
  const short = { permTds: 'TDS', permCond: 'Cond.', permBoron: 'Boron', feedPressure: 'Pressure', sec: 'SEC', permFlow: 'Flow', recovery: 'Recovery' };
  qs('#ro-mini').innerHTML = ids.map((id) => {
    const m = metric(id);
    const v = metricValue(res, id);
    let arrow = '';
    if (baseline) {
      const d = v - metricValue(baseline, id);
      if (Math.abs(d) >= 0.5 * 10 ** -m.digits) {
        const good = (m.better === 'higher') === (d > 0);
        arrow = `<span class="ro-tag ${good ? 'good' : 'bad'}" title="${good ? 'better' : 'worse'} than baseline">${d > 0 ? '▲' : '▼'}</span>`;
      }
    }
    return `<div><span class="ro-mini-label">${short[id]}</span><span class="ro-mini-val">${fmt(v, m.digits)}<span class="ro-unit">${escapeHtml(m.unit)}</span>${arrow}</span></div>`;
  }).join('');
}

function renderWarnings(res) {
  qs('#ro-warnings').innerHTML = res.warnings.length ? `
    <div class="card ro-warn">
      <h3>⚠ Operating limits</h3>
      <ul>${res.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
    </div>` : `<div class="card ro-ok"><p>✓ Within the typical operating envelope for these elements.</p></div>`;
}

function renderExplain(res) {
  const box = qs('#ro-explain');
  if (!lastChanged || !prevResult) { box.innerHTML = ''; return; }
  const label = numeric(lastChanged)?.label || {
    membrane: 'Membrane type', erd: 'Energy-recovery device', source: 'Intake type', mode: 'Operating mode', concUnit: 'Concentration units',
  }[lastChanged] || lastChanged;
  const ids = [cu('permTds'), 'permBoron', 'permFlow', 'recovery', 'feedPressure', 'sec'];
  if (res.split && prevResult.split) ids.push('frontFlow', cu('frontTds'), cu('rearTds'));
  if (state.erd === 'isobaric') ids.push(cu('membraneFeedTds'));
  const changes = ids.map((id) => {
    const a = metricValue(prevResult, id), b = metricValue(res, id);
    const m = metric(id);
    return { m, a, b, rel: a ? (b - a) / Math.abs(a) : 0 };
  }).filter((c) => Math.abs(c.rel) > 0.0005);
  box.innerHTML = `
    <div class="card ro-explain">
      <h3>What just happened: ${escapeHtml(label)}</h3>
      <p>${escapeHtml(EXPLAIN[lastChanged] || '')}</p>
      ${changes.length ? `<ul class="ro-changes">${changes.map((c) => `
        <li><span>${escapeHtml(c.m.label)}</span><span>${fmt(c.a, c.m.digits)} → <strong>${fmt(c.b, c.m.digits)}</strong> ${escapeHtml(c.m.unit)}</span></li>`).join('')}</ul>` : '<p>No significant change in the headline results.</p>'}
    </div>`;
}

function factRow(k, v) {
  return `<div class="fact-row"><span class="fact-key">${k}</span><span class="fact-val">${v}</span></div>`;
}

function renderEnergy(res) {
  const iso = state.erd === 'isobaric';
  const saving = 1 - res.sec / res.secNoErd;
  qs('#ro-energy').innerHTML = `
    <div class="fact-table">
      ${factRow('High-pressure pump', `${fmt(res.hpFlow, 0)} m³/h · +${fmt(res.hpDp, 1)} bar · ${fmt(res.hpKw, 0)} kW`)}
      ${iso ? factRow('ERD (pressure exchanger)', `${fmt(res.erdFlow, 0)} m³/h · ${fmt(PLP_UI, 0)} → ${fmt(res.erdOut, 1)} bar`) : ''}
      ${iso ? factRow('Booster pump', `${fmt(res.boosterFlow, 0)} m³/h · +${fmt(res.boosterDp, 1)} bar · ${fmt(res.boosterKw, 0)} kW`) : ''}
      ${iso ? factRow('Lubrication / leakage', `${fmt(res.leakFlow, 1)} m³/h`) : ''}
      ${iso ? factRow('Membrane feed salinity rise from mixing', `+${fmt(res.salinityIncrease * 100, 2)} %`) : ''}
      ${factRow('Feed (LP) pump, 2 bar', `${fmt(res.lpKw, 0)} kW`)}
      ${state.erd !== 'none' ? factRow('Energy recovered from brine', `${fmt(res.recoveredKw, 0)} kW`) : ''}
      ${factRow('Total', `${fmt(res.totalKw, 0)} kW · <strong>${fmt(res.sec, 2)} kWh/m³</strong>`)}
      ${state.erd !== 'none' ? factRow('Same plant without ERD', `${fmt(res.secNoErd, 2)} kWh/m³ (ERD saves ${fmt(saving * 100, 0)} %)`) : ''}
    </div>`;
}

// Plant stream table, train totals. Concentrations in the chosen unit.
function renderStreams(res) {
  const ec = state.concUnit === 'ec';
  const conc = (tds) => fmt(ec ? tdsToEc(tds) : tds, 0);
  const h = (d) => d / 24;
  const Qf = h(res.feedFlow), Qc = h(res.concFlow), Qp = h(res.permFlow);
  const raw = res.feedTds;
  const rows = [['Seawater from pretreatment', Qf, PLP_UI, raw]];
  if (state.erd === 'isobaric') {
    const mixC = raw + state.erdMixing / 100 * (res.concTds - raw);
    const L = res.leakFlow;
    const dischargeC = (Qc * res.concTds + (Qc - L) * (raw - mixC)) / Qc;
    rows.push(
      ['→ HP pump discharge', res.hpFlow, res.feedPressure, raw],
      ['→ ERD low-pressure inlet', res.erdFlow, PLP_UI, raw],
      ['ERD high-pressure outlet', res.erdFlow, res.erdOut, mixC],
      ['Booster discharge', res.boosterFlow, res.feedPressure, mixC],
      ['Membrane feed (combined)', Qf, res.feedPressure, res.membraneFeedTds],
    );
    pushPermeate(rows, res, Qp);
    rows.push(
      ['Brine to ERD', Qc, res.concPressure, res.concTds],
      ['Brine discharge (incl. leakage)', Qc, 0, dischargeC],
    );
  } else {
    rows.push(['Membrane feed (HP pump)', Qf, res.feedPressure, raw]);
    pushPermeate(rows, res, Qp);
    rows.push(
      [state.erd === 'turbine' ? 'Brine to turbine' : 'Brine to throttle valve', Qc, res.concPressure, res.concTds],
      ['Brine discharge', Qc, 0, res.concTds],
    );
  }
  qs('#ro-streams').innerHTML = `
    <div style="overflow-x:auto">
      <table class="ro-table ro-streams">
        <thead><tr><th>Stream</th><th>m³/h</th><th>bar</th><th>${ec ? 'µS/cm' : 'mg/L'}</th></tr></thead>
        <tbody>${rows.map(([n, q, p, c]) => `<tr><td>${escapeHtml(n)}</td><td>${fmt(q, 1)}</td><td>${fmt(p, 1)}</td><td>${conc(c)}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function pushPermeate(rows, res, Qp) {
  if (res.split) {
    rows.push(['Front permeate', res.frontFlow / 24, state.frontPermPressure, res.frontTds]);
    rows.push(['Rear permeate', res.rearFlow / 24, state.permPressure, res.rearTds]);
  }
  rows.push([res.split ? 'Total permeate (blended)' : 'Permeate', Qp, state.permPressure, res.permTds]);
}

function renderSplit(res) {
  const box = qs('#ro-ports');
  if (!res.split) {
    box.innerHTML = `<p class="ro-note">Single permeate: all ${res.elements.length} elements drain to one port. Raise the slider above to split the permeate.</p>`;
    return;
  }
  const n = state.split;
  const col = (label, flow, share, tds, ec, b) => `
    <div class="ro-port">
      <div class="ro-kpi-title">${label}</div>
      <div class="ro-kpi-value">${fmt(state.concUnit === 'ec' ? ec : tds, 0)}<span class="ro-unit">${state.concUnit === 'ec' ? 'µS/cm' : 'mg/L'}</span></div>
      <div class="ro-port-rows">
        <span>${fmt(state.concUnit === 'ec' ? tds : ec, 0)} ${state.concUnit === 'ec' ? 'mg/L' : 'µS/cm'}</span>
        <span>Boron ${fmt(b, 2)} mg/L</span>
        <span>${fmt(flow, 0)} m³/d · ${fmt(share * 100, 0)} %</span>
      </div>
    </div>`;
  box.innerHTML = `
    <div class="ro-ports">
      ${col(`Front · 1–${n}`, res.frontFlow, res.frontShare, res.frontTds, res.frontCond, res.frontBoron)}
      ${col(`Rear · ${n + 1}–${res.elements.length}`, res.rearFlow, res.rearShare, res.rearTds, res.rearCond, res.rearBoron)}
      ${col('Blended', res.permFlow, 1, res.permTds, res.permCond, res.permBoron)}
    </div>
    <p class="ro-note">Rear permeate is ${fmt(res.rearTds / res.frontTds, 1)}× saltier than front. Typical use: front permeate to product, rear permeate to a second pass or blending.</p>`;
}

function profileMetrics() {
  return PROFILE_METRICS.filter((p) => !p.conc || p.conc === state.concUnit);
}

function profileChips() {
  return profileMetrics().map((p) => `<button type="button" class="chip ${p.id === profileMetric ? 'active' : ''}" data-profile="${p.id}">${escapeHtml(p.label)}</button>`).join('');
}

function renderProfile(res) {
  const twin = { permTds: 'permEc', feedTds: 'feedEc', permEc: 'permTds', feedEc: 'feedTds' };
  if (!profileMetrics().find((p) => p.id === profileMetric)) {
    profileMetric = twin[profileMetric] || 'flux';
    qs('#ro-profile-chips').innerHTML = profileChips();
  }
  const pm = PROFILE_METRICS.find((p) => p.id === profileMetric);
  qs('#ro-n-el').textContent = res.elements.length;
  barChart(qs('#ro-profile-chart'), res.elements.map((e) => ({
    label: `#${e.index}`,
    tip: res.split ? `Element ${e.index} · ${e.port} permeate` : `Element ${e.index}`,
    value: e[pm.id],
    series: res.split && e.port === 'rear' ? 2 : 1,
  })), {
    unit: pm.unit, digits: pm.digits, xTitle: 'Element position (feed → brine)', ariaLabel: `${pm.label} by element position`,
    legend: res.split ? [{ label: 'Front permeate port', series: 1 }, { label: 'Rear permeate port', series: 2 }] : null,
  });
  const ec = state.concUnit === 'ec';

  qs('#ro-element-table').innerHTML = `
    <div style="overflow-x:auto">
      <table class="ro-table">
        <thead><tr><th>#</th>${res.split ? '<th>Port</th>' : ''}<th>Feed bar</th><th>Feed ${ec ? 'µS/cm' : 'mg/L'}</th><th>Feed m³/h</th><th>Perm m³/h</th><th>Flux LMH</th><th>Perm ${ec ? 'µS/cm' : 'mg/L'}</th><th>Perm B</th><th>NDP bar</th><th>β</th></tr></thead>
        <tbody>${res.elements.map((e) => `
          <tr><td>${e.index}</td>${res.split ? `<td>${e.port}</td>` : ''}<td>${fmt(e.feedPressure, 1)}</td><td>${fmt(ec ? e.feedEc : e.feedTds, 0)}</td><td>${fmt(e.feedFlow, 2)}</td><td>${fmt(e.permFlow, 2)}</td><td>${fmt(e.flux, 1)}</td><td>${fmt(ec ? e.permEc : e.permTds, 0)}</td><td>${fmt(e.permBoron, 2)}</td><td>${fmt(e.ndp, 1)}</td><td>${fmt(e.beta, 3)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function sweepOptions() {
  const opts = NUMERIC.filter(isVisible);
  if (!opts.find((n) => n.id === sweepX)) sweepX = { feedTds: 'feedEc', feedEc: 'feedTds' }[sweepX] || 'temp';
  qs('#ro-sweep-x').innerHTML = opts.map((n) => `<option value="${n.id}" ${n.id === sweepX ? 'selected' : ''}>${escapeHtml(n.label)}</option>`).join('');
}

function sweepYOptions() {
  const sel = qs('#ro-sweep-y');
  const ids = METRICS.map((m) => m.id).filter((id) => {
    if (metric(id).group === 'split' && !(state.split > 0)) return false;
    if (['membraneFeedTds', 'membraneFeedCond', 'salinityIncrease'].includes(id) && state.erd !== 'isobaric') return false;
    if (id === 'secNoErd' && state.erd === 'none') return false;
    return true;
  });
  if (!ids.includes(sweepY)) sweepY = EC_TWIN[sweepY] && ids.includes(EC_TWIN[sweepY]) ? EC_TWIN[sweepY] : 'feedPressure';
  sel.innerHTML = ids.map((id) => `<option value="${id}" ${id === sweepY ? 'selected' : ''}>${escapeHtml(metric(id).label)}</option>`).join('');
}

function renderSweep() {
  const xn = numeric(sweepX);
  const ym = metric(sweepY);
  const xmax = xn.id === 'split' ? state.elements - 1 : xn.max;
  if (xmax <= xn.min) { qs('#ro-sweep-chart').innerHTML = '<p class="ro-note">Needs at least 2 elements per vessel.</p>'; return; }
  const N = xn.step >= 1 && (xmax - xn.min) / xn.step <= 24 ? Math.round((xmax - xn.min) / xn.step) : 24;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const x = xn.min + (xmax - xn.min) * i / N;
    const r = simulate(simInput({ ...state, [sweepX]: x }));
    pts.push({ x, y: metricValue(r, sweepY) });
  }
  const limit = sweepY === 'feedPressure' ? { y: current.membrane.maxP, label: `max ${current.membrane.maxP} bar` }
    : sweepY === 'avgFlux' ? { y: SOURCES[state.source].flux, label: 'flux guideline' }
      : null;
  lineChart(qs('#ro-sweep-chart'), pts, {
    xUnit: xn.unit, yUnit: ym.unit, xDigits: xn.digits, yDigits: ym.digits,
    xTitle: `${xn.label}${xn.unit ? ` (${xn.unit})` : ''}`,
    marker: { x: state[sweepX], y: metricValue(current, sweepY) },
    limit,
    ariaLabel: `${ym.label} versus ${xn.label}`,
  });
}

function scheduleSweep() {
  clearTimeout(sweepTimer);
  sweepTimer = setTimeout(renderSweep, 60);
}

function update({ explain = true } = {}) {
  const res = simulate(simInput());
  if (explain) prevResult = current;
  current = res;
  const m = res.membrane;
  qs('#ro-membrane-note').textContent = `${m.area} m² · ${m.flow} m³/d · ${m.rejection} % salt rejection · ${m.boronRej} % boron rejection (at test conditions) · max ${m.maxP} bar`;
  renderKpis(res);
  renderMini(res);
  renderWarnings(res);
  renderExplain(res);
  renderEnergy(res);
  renderStreams(res);
  renderSplit(res);
  renderProfile(res);
  scheduleSweep();
  saveState();
}

function setValue(id, raw) {
  const n = numeric(id);
  let v = parseFloat(raw);
  if (!Number.isFinite(v)) return;
  v = Math.min(Math.max(v, n.min), id === 'split' ? state.elements - 1 : n.max);
  if (n.step >= 1) v = Math.round(v);
  if (state[id] === v) return;
  state[id] = v;
  lastChanged = id;
  if (id === 'elements') {
    // The split plug must sit inside the vessel.
    for (const sel of ['[data-range="split"]', '[data-num="split"]']) qs(sel).max = v - 1;
    if (state.split > v - 1) {
      state.split = v - 1;
      qs('[data-range="split"]').value = state.split;
      qs('[data-num="split"]').value = state.split;
    }
  }
  if (id === 'split') { refreshVisibility(); sweepOptions(); sweepYOptions(); }
  const r = qs(`[data-range="${id}"]`), num = qs(`[data-num="${id}"]`);
  if (r && r.value !== String(v)) r.value = v;
  if (num && document.activeElement !== num) num.value = v;
  update();
}

function setMode(mode) {
  if (mode === state.mode) return;
  // Carry the current operating point across so the switch is seamless.
  if (current) {
    if (mode === 'pressure') {
      state.feedPressure = Math.round(Math.min(current.feedPressure, 85) * 100) / 100;
      state.feedFlow = Math.round(current.feedFlow);
    } else {
      state.permTarget = Math.round(current.permFlow);
      state.recoveryTarget = Math.round(current.recovery * 1000) / 10;
    }
    for (const id of ['feedPressure', 'feedFlow', 'permTarget', 'recoveryTarget']) {
      const r = qs(`[data-range="${id}"]`), num = qs(`[data-num="${id}"]`);
      if (r) r.value = state[id];
      if (num) num.value = state[id];
    }
  }
  state.mode = mode;
  lastChanged = 'mode';
  qsa('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  refreshVisibility();
  sweepOptions();
  update();
}

function setConcUnit(unit) {
  if (unit === state.concUnit) return;
  // Keep the same water: convert the feed value across.
  if (unit === 'ec') state.feedEc = Math.round(tdsToEc(state.feedTds));
  else state.feedTds = Math.round(ecToTds(state.feedEc));
  for (const id of ['feedTds', 'feedEc']) {
    qs(`[data-range="${id}"]`).value = state[id];
    qs(`[data-num="${id}"]`).value = state[id];
  }
  state.concUnit = unit;
  lastChanged = 'concUnit';
  qsa('[data-conc]').forEach((b) => b.classList.toggle('active', b.dataset.conc === unit));
  refreshVisibility();
  sweepOptions();
  sweepYOptions();
  qs('#ro-profile-chips').innerHTML = profileChips();
  update();
}

function bind(view) {
  view.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.range) setValue(t.dataset.range, t.value);
    else if (t.dataset.num) setValue(t.dataset.num, t.value);
  });
  view.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.num) { t.value = state[t.dataset.num]; return; }
    if (t.dataset.select) {
      state[t.dataset.select] = t.value;
      lastChanged = t.dataset.select;
      if (t.dataset.select === 'erd') {
        state.erdEff = t.value === 'turbine' ? 88 : 96;
        qs('[data-range="erdEff"]').value = state.erdEff;
        qs('[data-num="erdEff"]').value = state.erdEff;
        refreshVisibility();
        sweepOptions();
        sweepYOptions();
      }
      update();
    }
    if (t.id === 'ro-sweep-x') { sweepX = t.value; renderSweep(); }
    if (t.id === 'ro-sweep-y') { sweepY = t.value; renderSweep(); }
  });
  view.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.mode) setMode(b.dataset.mode);
    if (b.dataset.conc) setConcUnit(b.dataset.conc);
    if (b.dataset.profile) {
      profileMetric = b.dataset.profile;
      qsa('[data-profile]').forEach((c) => c.classList.toggle('active', c === b));
      renderProfile(current);
    }
    if (b.id === 'ro-pin') {
      baseline = current;
      qs('#ro-clear-pin').hidden = false;
      b.textContent = 'Re-pin baseline';
      renderKpis(current);
      renderMini(current);
    }
    if (b.id === 'ro-clear-pin') {
      baseline = null;
      b.hidden = true;
      qs('#ro-pin').textContent = 'Pin baseline';
      renderKpis(current);
      renderMini(current);
    }
    if (b.id === 'ro-reset') {
      state = { ...DEFAULTS };
      lastChanged = null;
      prevResult = null;
      mount(view);
    }
  });
}

function mount(view) {
  view.innerHTML = shell();
  sweepOptions();
  sweepYOptions();
  current = null;
  update({ explain: false });
  if (resizeObs) resizeObs.disconnect();
  if ('ResizeObserver' in window) {
    let w = qs('#ro-profile-chart').clientWidth;
    resizeObs = new ResizeObserver(() => {
      const el = qs('#ro-profile-chart');
      if (!el) { resizeObs.disconnect(); return; }
      if (el.clientWidth !== w) { w = el.clientWidth; renderProfile(current); renderSweep(); }
    });
    resizeObs.observe(qs('#ro-profile-chart'));
  }
}

export function renderRoSim(_params, mountEl) {
  // A fresh wrapper per visit, so listeners from earlier visits go with it.
  const root = document.createElement('div');
  root.className = 'ro-sim';
  const host = mountEl || getView();
  host.textContent = '';
  host.append(root);
  bind(root);
  mount(root);
}
