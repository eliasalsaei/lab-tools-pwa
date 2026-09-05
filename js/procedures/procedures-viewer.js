import { getView } from '../router.js';
import { qs, qsa, escapeHtml } from '../utils.js';
import { DOMAINS } from '../calculators/registry.js';

let cache = null;
let listState = { query: '', domain: '' };

async function loadProcedures() {
  if (cache) return cache;
  const files = ['./data/procedures/water.json', './data/procedures/boiler.json', './data/procedures/wastewater.json'];
  const results = await Promise.all(files.map((f) => fetch(f).then((r) => r.json())));
  cache = results.flat();
  return cache;
}

function domainMeta(id) {
  return DOMAINS.find((d) => d.id === id) || { label: id, icon: '' };
}

function searchProcedures(list, query) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((p) => {
    const hay = [p.title, p.methodRef, ...(p.aliases || []), ...(p.steps || [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export async function renderProceduresList() {
  const view = getView();
  view.innerHTML = '<div class="empty-state">Loading procedures…</div>';
  const all = await loadProcedures();

  let filtered = listState.domain ? all.filter((p) => p.domain === listState.domain) : all;
  filtered = searchProcedures(filtered, listState.query);

  view.innerHTML = `
    <div class="search-box">
      <input id="proc-search" type="search" placeholder="Search procedures..." value="${escapeHtml(listState.query)}" />
    </div>
    <div class="chip-row" id="proc-domain-chips">
      <button class="chip ${listState.domain === '' ? 'active' : ''}" data-domain="">All</button>
      ${DOMAINS.map((d) => `<button class="chip ${listState.domain === d.id ? 'active' : ''}" data-domain="${d.id}">${d.icon} ${escapeHtml(d.label)}</button>`).join('')}
    </div>
    <div class="section-title">${filtered.length} procedure${filtered.length === 1 ? '' : 's'}</div>
    ${filtered.length === 0 ? '<div class="empty-state">No procedures match.</div>' : filtered.map((p) => `
      <a class="card card-link" href="#/procedures/${p.id}">
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.methodRef || '')}</p>
      </a>
    `).join('')}
  `;

  qs('#proc-search', view).addEventListener('input', (ev) => {
    listState.query = ev.target.value;
    renderProceduresList();
    setTimeout(() => qs('#proc-search', getView())?.focus(), 0);
  });

  qsa('#proc-domain-chips .chip', view).forEach((btn) => {
    btn.addEventListener('click', () => {
      listState.domain = btn.dataset.domain;
      renderProceduresList();
    });
  });
}

export async function renderProcedureDetail({ id }) {
  const view = getView();
  const all = await loadProcedures();
  const proc = all.find((p) => p.id === id);

  if (!proc) {
    view.innerHTML = '<div class="empty-state">Procedure not found.</div><a class="back-link" href="#/procedures">&larr; Back</a>';
    return;
  }

  const meta = domainMeta(proc.domain);
  view.innerHTML = `
    <a class="back-link" href="#/procedures">&larr; All Procedures</a>
    <div class="section-title">${meta.icon} ${escapeHtml(meta.label)}</div>
    <h2>${escapeHtml(proc.title)}</h2>
    <p>${escapeHtml(proc.methodRef || '')}</p>

    ${proc.equipment && proc.equipment.length ? `
      <div class="section-title">Equipment</div>
      <div class="kv-list">${proc.equipment.map((e) => `<span>${escapeHtml(e)}</span>`).join('')}</div>
    ` : ''}

    ${proc.reagents && proc.reagents.length ? `
      <div class="section-title">Reagents</div>
      <div class="kv-list">${proc.reagents.map((r) => `<span>${escapeHtml(r)}</span>`).join('')}</div>
    ` : ''}

    <div class="section-title">Procedure</div>
    <ol class="procedure-step-list">${(proc.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>

    ${proc.safetyNotes && proc.safetyNotes.length ? `
      <div class="section-title">Safety Notes</div>
      <ul class="procedure-step-list">${proc.safetyNotes.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
    ` : ''}

    ${proc.calcRef ? `<a class="btn btn-primary btn-block" href="#/calculators/calc/${proc.calcRef}">Open Calculator</a>` : ''}
  `;
}
