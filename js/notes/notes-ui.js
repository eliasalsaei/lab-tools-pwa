import { getView, navigate } from '../router.js';
import { qs, qsa, el, escapeHtml, nl2brEscaped, formatDate, formatDateTime, todayIso } from '../utils.js';
import {
  CATEGORIES, STATUSES, parseTags, listEntries, getEntry,
  createEntry, updateEntry, deleteEntry, searchEntries, filterByCategory,
} from './notes.js';

let listState = { query: '', category: '' };

function statusPill(status) {
  return `<span class="status-pill status-${status}">${escapeHtml(status)}</span>`;
}

export async function renderLogList() {
  const view = getView();
  let entries = await listEntries();
  entries = filterByCategory(entries, listState.category);
  entries = searchEntries(entries, listState.query);

  view.innerHTML = `
    <div class="search-box">
      <input id="log-search" type="search" placeholder="Search notes, tags..." value="${escapeHtml(listState.query)}" />
    </div>
    <div class="chip-row" id="log-cat-chips">
      <button class="chip ${listState.category === '' ? 'active' : ''}" data-cat="">All</button>
      ${CATEGORIES.map((c) => `<button class="chip ${listState.category === c ? 'active' : ''}" data-cat="${c}">${escapeHtml(c)}</button>`).join('')}
    </div>
    <button id="new-entry-btn" class="btn btn-primary btn-block">+ New Log Entry</button>
    <div class="section-title">${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</div>
    <div id="log-list">
      ${entries.length === 0 ? '<div class="empty-state">No log entries yet.</div>' : entries.map((e) => `
        <a class="card card-link" href="#/log/${e.id}">
          <div class="log-entry-meta">
            <span>${formatDate(e.date)} &middot; ${escapeHtml(e.category)}</span>
            ${statusPill(e.status)}
          </div>
          <h3>${escapeHtml(e.title) || '(untitled)'}</h3>
          <p>${escapeHtml((e.body || '').slice(0, 120))}${(e.body || '').length > 120 ? '…' : ''}</p>
        </a>
      `).join('')}
    </div>
  `;

  qs('#log-search', view).addEventListener('input', (ev) => {
    listState.query = ev.target.value;
    renderLogList();
    setTimeout(() => qs('#log-search', getView())?.focus(), 0);
  });

  qsa('#log-cat-chips .chip', view).forEach((btn) => {
    btn.addEventListener('click', () => {
      listState.category = btn.dataset.cat;
      renderLogList();
    });
  });

  qs('#new-entry-btn', view).addEventListener('click', () => navigate('/log/new'));
}

function entryForm(entry) {
  const isNew = !entry;
  const title = isNew ? '' : entry.title;
  const body = isNew ? '' : entry.body;
  const date = isNew ? todayIso() : entry.date;
  const category = isNew ? 'general' : entry.category;
  const status = isNew ? 'open' : entry.status;
  const tags = isNew ? '' : (entry.tags || []).join(', ');

  return `
    <a class="back-link" href="#/log">&larr; Back to Logbook</a>
    <h2>${isNew ? 'New Log Entry' : 'Edit Log Entry'}</h2>
    <form id="entry-form">
      <div class="field">
        <label for="f-title">Title</label>
        <input id="f-title" type="text" value="${escapeHtml(title)}" placeholder="Short summary" />
      </div>
      <div class="field">
        <label for="f-date">Date</label>
        <input id="f-date" type="date" value="${escapeHtml(date)}" />
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="f-category">Category</label>
          <select id="f-category">
            ${CATEGORIES.map((c) => `<option value="${c}" ${c === category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-status">Status</label>
          <select id="f-status">
            ${STATUSES.map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="f-tags">Tags (comma separated)</label>
        <input id="f-tags" type="text" value="${escapeHtml(tags)}" placeholder="boiler, calibration" />
      </div>
      <div class="field">
        <label for="f-body">${!isNew && entry.status === 'ongoing' ? 'Add update' : 'Notes'}</label>
        <textarea id="f-body" placeholder="What happened...">${!isNew && entry.status === 'ongoing' ? '' : escapeHtml(body)}</textarea>
      </div>
      <div class="btn-row">
        <button type="submit" class="btn btn-primary">${isNew ? 'Save Entry' : 'Save Changes'}</button>
        ${!isNew ? '<button type="button" id="delete-entry-btn" class="btn">Delete</button>' : ''}
      </div>
    </form>
    ${!isNew && (entry.edits || []).length ? `
      <div class="section-title">Update history</div>
      ${entry.edits.slice().reverse().map((ed) => `
        <div class="card">
          <div class="log-entry-meta"><span>${formatDateTime(ed.timestamp)}</span></div>
          <p>${nl2brEscaped(ed.note)}</p>
        </div>
      `).join('')}
    ` : ''}
  `;
}

export async function renderNewEntry() {
  const view = getView();
  view.innerHTML = entryForm(null);
  bindForm(null);
}

export async function renderEditEntry({ id }) {
  const view = getView();
  const entry = await getEntry(id);
  if (!entry) {
    view.innerHTML = '<div class="empty-state">Entry not found.</div><a class="back-link" href="#/log">&larr; Back to Logbook</a>';
    return;
  }
  view.innerHTML = entryForm(entry);
  bindForm(entry);
}

function bindForm(existingEntry) {
  const view = getView();
  const form = qs('#entry-form', view);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const title = qs('#f-title', form).value.trim();
    const date = qs('#f-date', form).value || todayIso();
    const category = qs('#f-category', form).value;
    const status = qs('#f-status', form).value;
    const tags = parseTags(qs('#f-tags', form).value);
    const bodyInput = qs('#f-body', form).value;

    if (!existingEntry) {
      await createEntry({ title, body: bodyInput, tags, category, status, date });
      navigate('/log');
      return;
    }

    if (existingEntry.status === 'ongoing' && bodyInput.trim()) {
      await updateEntry(existingEntry.id, { title, date, category, status }, { appendEdit: bodyInput.trim() });
    } else {
      await updateEntry(existingEntry.id, { title, date, category, status, body: bodyInput });
    }
    navigate('/log');
  });

  const delBtn = qs('#delete-entry-btn', form);
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (confirm('Delete this log entry? This cannot be undone.')) {
        await deleteEntry(existingEntry.id);
        navigate('/log');
      }
    });
  }
}
