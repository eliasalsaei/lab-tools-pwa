import { getView } from '../router.js';
import { qs, qsa, escapeHtml, parseNum, round, formatDateTime } from '../utils.js';
import { db, uuid } from '../db.js';
import { DOMAINS, getCalculator, calculatorsByDomain } from './registry.js';

function domainMeta(id) {
  return DOMAINS.find((d) => d.id === id) || { label: id, icon: '' };
}

export async function renderCalculatorsHome() {
  const view = getView();
  view.innerHTML = `
    <div class="section-title">Calculators</div>
    ${DOMAINS.map((d) => {
      const calcs = calculatorsByDomain(d.id);
      return `
        <a class="card card-link" href="#/calculators/domain/${d.id}">
          <h3>${d.icon} ${escapeHtml(d.label)}</h3>
          <p>${calcs.length} calculator${calcs.length === 1 ? '' : 's'}</p>
        </a>
      `;
    }).join('')}
  `;
}

export async function renderDomainList({ domain }) {
  const view = getView();
  const meta = domainMeta(domain);
  const calcs = calculatorsByDomain(domain);
  view.innerHTML = `
    <a class="back-link" href="#/calculators">&larr; All Calculators</a>
    <div class="section-title">${meta.icon} ${escapeHtml(meta.label)}</div>
    ${calcs.length === 0 ? '<div class="empty-state">No calculators yet in this section.</div>' : calcs.map((c) => `
      <a class="card card-link" href="#/calculators/calc/${c.id}">
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.subtitle || '')}</p>
      </a>
    `).join('')}
  `;
}

function renderInputField(input, savedValues) {
  const val = savedValues && savedValues[input.id] !== undefined ? savedValues[input.id] : input.default;

  if (input.type === 'select') {
    return `
      <div class="field">
        <label for="in-${input.id}">${escapeHtml(input.label)}</label>
        <select id="in-${input.id}" data-input="${input.id}">
          ${input.options.map((o) => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  return `
    <div class="field">
      <label for="in-${input.id}">${escapeHtml(input.label)}${input.unit ? ` (${escapeHtml(input.unit)})` : ''}</label>
      <input id="in-${input.id}" data-input="${input.id}" type="number" step="any" inputmode="decimal"
        value="${val !== undefined && val !== null ? val : ''}" placeholder="${escapeHtml(input.placeholder || '')}" />
    </div>
  `;
}

function renderRowsField(input, savedRows) {
  const rows = savedRows && savedRows.length ? savedRows : Array.from({ length: input.minRows || 3 }, () => ({}));
  return `
    <div class="field">
      <label>${escapeHtml(input.label)}</label>
      <div id="rows-${input.id}" data-rows="${input.id}" style="overflow-x:auto">
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr>${input.columns.map((c) => `<th style="text-align:left; font-size:0.78rem; color:var(--fg-muted); padding:4px;">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map((row, i) => `
              <tr data-row-index="${i}">
                ${input.columns.map((c) => `<td style="padding:2px;"><input type="number" step="any" inputmode="decimal" data-row="${input.id}" data-col="${c.id}" data-idx="${i}" value="${row[c.id] ?? ''}" style="min-height:40px; width:90px;" /></td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="btn-row" style="margin-top:8px;">
        <button type="button" class="btn" data-add-row="${input.id}">+ Add Row</button>
      </div>
    </div>
  `;
}

function readRows(view, input) {
  const container = qs(`[data-rows="${input.id}"]`, view);
  const trs = qsa('tbody tr', container);
  return trs.map((tr) => {
    const row = {};
    input.columns.forEach((c) => {
      const field = qs(`[data-col="${c.id}"]`, tr);
      row[c.id] = parseNum(field.value);
    });
    return row;
  });
}

export async function renderCalculatorDetail({ id }) {
  const view = getView();
  const calc = getCalculator(id);
  if (!calc) {
    view.innerHTML = '<div class="empty-state">Calculator not found.</div><a class="back-link" href="#/calculators">&larr; Back</a>';
    return;
  }

  const preset = (await db.getAllByIndex('calcPresets', 'calcId', calc.id))[0];
  const savedValues = preset ? preset.values : {};

  const scalarInputs = calc.inputs.filter((i) => i.type !== 'rows');
  const rowsInput = calc.inputs.find((i) => i.type === 'rows');

  view.innerHTML = `
    <a class="back-link" href="#/calculators/domain/${calc.domain}">&larr; ${escapeHtml(domainMeta(calc.domain).label)}</a>
    <h2>${escapeHtml(calc.title)}</h2>
    ${calc.description ? `<p>${escapeHtml(calc.description)}</p>` : ''}
    <form id="calc-form">
      ${scalarInputs.map((i) => renderInputField(i, savedValues)).join('')}
      ${rowsInput ? renderRowsField(rowsInput, savedValues && savedValues[rowsInput.id]) : ''}
      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Calculate</button>
        ${calc.procedureRef ? `<a class="btn" href="#/procedures/${calc.procedureRef}">View Procedure</a>` : ''}
      </div>
    </form>
    <div id="calc-result"></div>
    <p class="disclaimer">Standard formula — verify constants (e.g. titrant normality) against your facility's official method before relying on this operationally.</p>
    <div id="calc-history-section"></div>
  `;

  await renderHistorySection(view, calc);

  const form = qs('#calc-form', view);

  qsa('[data-add-row]', form).forEach((btn) => {
    btn.addEventListener('click', () => {
      const inputDef = calc.inputs.find((i) => i.id === btn.dataset.addRow);
      const container = qs(`[data-rows="${inputDef.id}"] tbody`, form);
      const idx = container.children.length;
      const tr = document.createElement('tr');
      tr.dataset.rowIndex = idx;
      tr.innerHTML = inputDef.columns.map((c) => `<td style="padding:2px;"><input type="number" step="any" inputmode="decimal" data-row="${inputDef.id}" data-col="${c.id}" data-idx="${idx}" style="min-height:40px; width:90px;" /></td>`).join('');
      container.appendChild(tr);
    });
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const values = {};
    scalarInputs.forEach((i) => {
      const field = qs(`[data-input="${i.id}"]`, form);
      values[i.id] = i.type === 'select' ? field.value : parseNum(field.value);
    });
    if (rowsInput) {
      values[rowsInput.id] = readRows(form, rowsInput);
    }

    let result;
    try {
      result = calc.compute(values);
    } catch (err) {
      qs('#calc-result', view).innerHTML = `<div class="result-box">Error: ${escapeHtml(err.message)}</div>`;
      return;
    }

    renderResult(view, result, calc, values);

    await db.put('calcPresets', {
      id: preset ? preset.id : uuid(),
      calcId: calc.id,
      presetName: 'default',
      values,
      isDefault: true,
    });
  });
}

function renderResult(view, result, calc, values) {
  const rows = Object.entries(result).map(([label, r]) => `
    <div class="result-row"><span>${escapeHtml(label)}</span><span class="result-value">${round(r.value, r.decimals ?? 2)} ${escapeHtml(r.unit || '')}</span></div>
  `).join('');

  qs('#calc-result', view).innerHTML = `
    <div class="result-box">${rows}</div>
    <div class="btn-row">
      <button type="button" id="save-history-btn" class="btn">Save to History</button>
    </div>
  `;

  qs('#save-history-btn', view).addEventListener('click', async () => {
    await db.put('calcHistory', {
      id: uuid(),
      calcId: calc.id,
      calcTitle: calc.title,
      domain: calc.domain,
      timestamp: Date.now(),
      inputs: values,
      result,
    });
    const btn = qs('#save-history-btn', view);
    btn.textContent = 'Saved ✓';
    btn.disabled = true;
    await renderHistorySection(view, calc);
  });
}

async function renderHistorySection(view, calc) {
  const container = qs('#calc-history-section', view);
  if (!container) return;

  const history = (await db.getAllByIndex('calcHistory', 'calcId', calc.id))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

  if (!history.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="section-title">Recent Saved Runs</div>
    ${history.map((h) => `
      <div class="card">
        <div class="log-entry-meta"><span>${formatDateTime(h.timestamp)}</span></div>
        ${Object.entries(h.result).map(([label, r]) => `
          <div class="result-row"><span>${escapeHtml(label)}</span><span class="result-value">${round(r.value, r.decimals ?? 2)} ${escapeHtml(r.unit || '')}</span></div>
        `).join('')}
      </div>
    `).join('')}
  `;
}
