import { registerRoute, setNotFound, initRouter } from './router.js';
import { qs, escapeHtml, formatDate } from './utils.js';
import { renderLogList, renderNewEntry, renderEditEntry } from './notes/notes-ui.js';
import { renderCalculatorsHome, renderDomainList, renderCalculatorDetail } from './calculators/calculator-shell.js';
import { renderProceduresList, renderProcedureDetail } from './procedures/procedures-viewer.js';
import { renderSettings } from './settings/settings-ui.js';
import { renderRoSim } from './ro-sim/ro-sim-ui.js';
import { listEntries } from './notes/notes.js';
import { DOMAINS, calculatorsByDomain } from './calculators/registry.js';

async function renderHome() {
  const entries = (await listEntries()).slice(0, 3);
  return `
    <div class="section-title">Quick Links</div>
    <div class="grid-2">
      <a class="card card-link" href="#/log/new"><h3>+ New Log Entry</h3><p>Record today's activity</p></a>
      <a class="card card-link" href="#/calculators"><h3>Calculators</h3><p>${DOMAINS.reduce((n, d) => n + calculatorsByDomain(d.id).length, 0)} tools</p></a>
    </div>
    <a class="card card-link" href="#/ro-sim"><h3>\u{1F30A} SWRO Simulator</h3><p>Seawater RO with Toray elements: change a variable, see the effect on product quality and production</p></a>

    <div class="section-title">Recent Log Entries</div>
    ${entries.length === 0 ? '<div class="empty-state">No log entries yet. Start your first one above.</div>' : entries.map((e) => `
      <a class="card card-link" href="#/log/${e.id}">
        <div class="log-entry-meta"><span>${formatDate(e.date)} &middot; ${escapeHtml(e.category)}</span></div>
        <h3>${escapeHtml(e.title) || '(untitled)'}</h3>
      </a>
    `).join('')}
    <a class="back-link" href="#/log">View all log entries &rarr;</a>

    <div class="section-title">Lab Sections</div>
    ${DOMAINS.map((d) => `
      <a class="card card-link" href="#/calculators/domain/${d.id}">
        <h3>${d.icon} ${escapeHtml(d.label)}</h3>
        <p>${calculatorsByDomain(d.id).length} calculators</p>
      </a>
    `).join('')}

    <a class="back-link" href="#/settings">Data &amp; Backup &rarr;</a>

    <p class="disclaimer">Calculations use standard textbook / Standard Methods formulas. Verify constants (titrant normality, conversion factors, etc.) against your facility's official method sheets before relying on results operationally.</p>
  `;
}

function initTheme() {
  const stored = localStorage.getItem('lt-theme');
  if (stored) document.documentElement.setAttribute('data-theme', stored);

  const cycle = ['', 'dark', 'contrast'];
  qs('#theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || '';
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    if (next) {
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('lt-theme', next);
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('lt-theme');
    }
  });
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js');

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  });
}

function showUpdateBanner(worker) {
  const banner = qs('#update-banner');
  banner.hidden = false;
  qs('#update-refresh-btn', banner).onclick = () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') location.reload();
    });
  };
}

function initRoutes() {
  registerRoute('/', renderHome);
  registerRoute('/calculators', renderCalculatorsHome);
  registerRoute('/calculators/domain/:domain', renderDomainList);
  registerRoute('/calculators/calc/:id', renderCalculatorDetail);
  registerRoute('/procedures', renderProceduresList);
  registerRoute('/procedures/:id', renderProcedureDetail);
  registerRoute('/log', renderLogList);
  registerRoute('/log/new', renderNewEntry);
  registerRoute('/log/:id', renderEditEntry);
  registerRoute('/settings', renderSettings);
  registerRoute('/ro-sim', renderRoSim);
  setNotFound(() => '<div class="empty-state">Page not found.</div>');
  initRouter(qs('#view'));
}

initTheme();
initServiceWorker();
initRoutes();
