import { getView, navigate } from '../router.js';
import { qs, escapeHtml, todayIso } from '../utils.js';
import {
  SHIFT_TYPES, OVERRIDE_CODES, WEEKDAY_LABELS,
  shiftFor, shiftsInRange, summarize,
  analyzeFatigue, nextShift, shiftAtInstant, shiftStart, shiftEnd,
  monthBounds, weekdayIndex, addDays, daysBetween, localIso,
} from './shift-engine.js';
import {
  getConfig, saveConfig, getOverrideMap, setOverride, clearOverride,
  getLedgerMap, commitLedger, clearLedger, ledgerSize,
} from './shifts-store.js';
import { buildCalendar, icsFilename } from './ics.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const now = new Date();
let gridState = { year: now.getFullYear(), month: now.getMonth() + 1, selected: null };

/* ---------- shared bits ---------- */

function codeClass(code) {
  return `is-${String(code).toLowerCase()}`;
}

function formatDuration(ms) {
  if (ms <= 0) return 'now';
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${rem} m`;
  return `${rem} m`;
}

function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAY_LABELS[weekdayIndex(iso)]} ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function timeRange(type) {
  return type.kind === 'timed' ? `${type.start} - ${type.end}` : type.label;
}

/**
 * The "next shift" card, also used on the Home screen.
 * Returns '' when shifts have not been set up yet.
 */
export async function nextShiftCardHtml() {
  const config = await getConfig();
  if (!config.configured) return '';
  const overrides = await getOverrideMap();
  const at = new Date();

  const current = shiftAtInstant(at, config, overrides);
  if (current) {
    const remaining = shiftEnd(current) - at;
    return `
      <a class="card card-link next-shift ${codeClass(current.code)}" href="#/shifts">
        <div class="log-entry-meta"><span>On shift now</span><span>${escapeHtml(timeRange(current.type))}</span></div>
        <h3>${escapeHtml(current.type.label)} shift &middot; ${formatDuration(remaining)} left</h3>
        <p>Started ${escapeHtml(prettyDate(current.date))}</p>
      </a>
    `;
  }

  const upcoming = nextShift(config, overrides, at);
  if (!upcoming) {
    return `<a class="card card-link" href="#/shifts"><h3>No shifts scheduled</h3><p>Check your rotation settings.</p></a>`;
  }

  const until = shiftStart(upcoming) - at;
  const offDays = daysBetween(localIso(at), upcoming.date);
  return `
    <a class="card card-link next-shift ${codeClass(upcoming.code)}" href="#/shifts">
      <div class="log-entry-meta"><span>Next shift</span><span>${escapeHtml(timeRange(upcoming.type))}</span></div>
      <h3>${escapeHtml(upcoming.type.label)} &middot; in ${formatDuration(until)}</h3>
      <p>${escapeHtml(prettyDate(upcoming.date))}${offDays > 0 ? ` &middot; ${offDays} day${offDays === 1 ? '' : 's'} off first` : ''}</p>
    </a>
  `;
}

/* ---------- month grid ---------- */

function setupPrompt() {
  return `
    <div class="card">
      <h3>Set up your rotation</h3>
      <p>Tell Lab Tools your cycle and which date it starts on, and it will lay out every shift from here on and build a calendar file for Google Calendar.</p>
      <a class="btn btn-primary btn-block" href="#/shifts/setup" style="margin-top:12px;">Set up shifts</a>
    </div>
  `;
}

function monthGridHtml(shifts, config) {
  const first = shifts[0].date;
  const lead = weekdayIndex(first);
  const today = todayIso();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="shift-cell is-blank"></div>');

  for (const shift of shifts) {
    const day = Number(shift.date.slice(8, 10));
    const classes = [
      'shift-cell',
      codeClass(shift.code),
      shift.date === today ? 'is-today' : '',
      shift.date === gridState.selected ? 'is-selected' : '',
      shift.overridden ? 'is-overridden' : '',
    ].filter(Boolean).join(' ');

    cells.push(`
      <button type="button" class="${classes}" data-date="${shift.date}"
              aria-label="${escapeHtml(`${prettyDate(shift.date)}: ${shift.type.label}`)}">
        <span class="shift-daynum">${day}</span>
        <span class="shift-badge">${shift.type.badge ? escapeHtml(shift.type.badge) : '&middot;'}</span>
      </button>
    `);
  }

  return `
    <div class="shift-grid" id="shift-grid">
      ${WEEKDAY_LABELS.map((w) => `<div class="shift-weekday">${w}</div>`).join('')}
      ${cells.join('')}
    </div>
  `;
}

function dayPanelHtml(shift) {
  const source = shift.overridden ? 'Changed by hand' : 'From your rotation';
  return `
    <div class="card day-panel">
      <div class="log-entry-meta">
        <span>${escapeHtml(prettyDate(shift.date))}</span>
        <span>${escapeHtml(source)}</span>
      </div>
      <h3>${escapeHtml(shift.type.label)}${shift.type.kind === 'timed' ? ` &middot; ${escapeHtml(timeRange(shift.type))}` : ''}</h3>
      <div class="chip-row" id="day-codes" style="margin-top:10px;">
        ${OVERRIDE_CODES.map((code) => `
          <button type="button" class="chip ${code === shift.code ? 'active' : ''}" data-code="${code}">
            ${escapeHtml(SHIFT_TYPES[code].label)}
          </button>
        `).join('')}
      </div>
      <div class="field">
        <label for="day-note">Note (appears in the calendar event)</label>
        <input id="day-note" type="text" value="${escapeHtml(shift.note)}" placeholder="Swapped with Sam, overtime, ..." />
      </div>
      <div class="btn-row">
        <button type="button" id="day-save-note" class="btn">Save note</button>
        ${shift.overridden ? '<button type="button" id="day-reset" class="btn">Back to rotation</button>' : ''}
      </div>
    </div>
  `;
}

export async function renderShifts() {
  const view = getView();
  const config = await getConfig();

  if (!config.configured) {
    view.innerHTML = `<div class="section-title">Shifts</div>${setupPrompt()}`;
    return;
  }

  const overrides = await getOverrideMap();
  const { year, month } = gridState;
  const bounds = monthBounds(year, month);
  const shifts = shiftsInRange(bounds.start, bounds.end, config, overrides);
  const stats = summarize(shifts);
  const warnings = analyzeFatigue(
    // Include the neighbouring days so a warning spanning a month boundary is caught.
    shiftsInRange(addDays(bounds.start, -1), addDays(bounds.end, 1), config, overrides),
  ).filter((w) => daysBetween(bounds.start, w.date) >= 0 && daysBetween(w.date, bounds.end) >= 0);

  const selected = gridState.selected
    ? shiftFor(gridState.selected, config, overrides)
    : null;

  view.innerHTML = `
    ${await nextShiftCardHtml()}

    <div class="month-nav">
      <button type="button" class="icon-btn" id="month-prev" aria-label="Previous month">&#8249;</button>
      <div class="month-label">${MONTH_NAMES[month - 1]} ${year}</div>
      <button type="button" class="icon-btn" id="month-next" aria-label="Next month">&#8250;</button>
    </div>

    ${monthGridHtml(shifts, config)}

    <div class="shift-legend">
      ${['M', 'N', 'O', 'L', 'T'].map((c) => `
        <span class="legend-item"><i class="legend-dot ${codeClass(c)}"></i>${escapeHtml(SHIFT_TYPES[c].label)}</span>
      `).join('')}
    </div>

    ${selected ? dayPanelHtml(selected) : '<p class="disclaimer">Tap any day to change it - swaps, overtime, leave and training all override the rotation for that date only.</p>'}

    <div class="fact-table">
      <div class="fact-row"><span class="fact-key">Shifts this month</span><span class="fact-val">${stats.working}</span></div>
      <div class="fact-row"><span class="fact-key">Mornings / Nights</span><span class="fact-val">${stats.counts.M || 0} / ${stats.counts.N || 0}</span></div>
      <div class="fact-row"><span class="fact-key">Hours</span><span class="fact-val">${stats.hours}</span></div>
      <div class="fact-row"><span class="fact-key">Days off</span><span class="fact-val">${shifts.length - stats.working}</span></div>
    </div>

    ${warnings.length ? `
      <div class="section-title">Rest check</div>
      <ul class="warn-list">
        ${warnings.map((w) => `<li>${escapeHtml(w.message)}</li>`).join('')}
      </ul>
    ` : ''}

    <div class="btn-row" style="margin-top:16px;">
      <a class="btn btn-primary" href="#/shifts/export" style="flex:1;">Send to Google Calendar</a>
      <a class="btn" href="#/shifts/setup">Rotation</a>
    </div>
    ${gridState.year !== now.getFullYear() || gridState.month !== now.getMonth() + 1
      ? '<button type="button" id="month-today" class="btn btn-block" style="margin-top:12px;">Back to this month</button>'
      : ''}
  `;

  bindGrid();
}

function bindGrid() {
  const view = getView();

  const step = (delta) => {
    let m = gridState.month + delta;
    let y = gridState.year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    gridState = { year: y, month: m, selected: null };
    renderShifts();
  };

  qs('#month-prev', view).addEventListener('click', () => step(-1));
  qs('#month-next', view).addEventListener('click', () => step(1));
  qs('#month-today', view)?.addEventListener('click', () => {
    const t = new Date();
    gridState = { year: t.getFullYear(), month: t.getMonth() + 1, selected: null };
    renderShifts();
  });

  qs('#shift-grid', view).addEventListener('click', (ev) => {
    const cell = ev.target.closest('.shift-cell[data-date]');
    if (!cell) return;
    const date = cell.dataset.date;
    gridState.selected = gridState.selected === date ? null : date;
    renderShifts();
  });

  const codes = qs('#day-codes', view);
  if (codes) {
    codes.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('.chip[data-code]');
      if (!btn) return;
      const note = qs('#day-note', view).value.trim();
      await setOverride(gridState.selected, btn.dataset.code, note);
      renderShifts();
    });
  }

  qs('#day-save-note', view)?.addEventListener('click', async () => {
    const config = await getConfig();
    const overrides = await getOverrideMap();
    const shift = shiftFor(gridState.selected, config, overrides);
    await setOverride(gridState.selected, shift.code, qs('#day-note', view).value.trim());
    renderShifts();
  });

  qs('#day-reset', view)?.addEventListener('click', async () => {
    await clearOverride(gridState.selected);
    renderShifts();
  });
}

/* ---------- setup ---------- */

export async function renderShiftSetup() {
  const view = getView();
  const config = await getConfig();

  const previewFrom = config.anchorDate;
  const preview = shiftsInRange(previewFrom, addDays(previewFrom, 13), config, {});

  view.innerHTML = `
    <a class="back-link" href="#/shifts">&larr; Shifts</a>
    <div class="section-title">Your rotation</div>

    <div class="card">
      <h3>Cycle pattern</h3>
      <p>Tap a day to change it. The pattern repeats forever from the start date below.</p>
      <div class="cycle-strip" id="cycle-strip">
        ${config.cycle.map((code, i) => `
          <button type="button" class="cycle-slot ${codeClass(code)}" data-slot="${i}">
            <span class="cycle-slot-num">${i + 1}</span>
            <span class="cycle-slot-code">${escapeHtml(SHIFT_TYPES[code] ? SHIFT_TYPES[code].badge || '-' : '-')}</span>
          </button>
        `).join('')}
      </div>
      <div class="btn-row" style="margin-top:10px;">
        <button type="button" id="cycle-shorter" class="btn">&minus; Day</button>
        <button type="button" id="cycle-longer" class="btn">+ Day</button>
        <button type="button" id="cycle-reset" class="btn">Reset to 2M-1-2N-3</button>
      </div>
      <p class="disclaimer">Cycle length: ${config.cycle.length} days.</p>
    </div>

    <div class="card">
      <h3>Where the cycle starts</h3>
      <p>Pick a date you know you worked day 1 of the pattern. Check the preview below and nudge the date until it matches your real roster.</p>
      <div class="field">
        <label for="anchor-date">Day 1 of the cycle falls on</label>
        <input id="anchor-date" type="date" value="${escapeHtml(config.anchorDate)}" />
      </div>
      <div class="preview-strip">
        ${preview.map((s) => `
          <div class="preview-day ${codeClass(s.code)}">
            <span>${WEEKDAY_LABELS[weekdayIndex(s.date)].slice(0, 2)}</span>
            <strong>${Number(s.date.slice(8, 10))}</strong>
            <span>${escapeHtml(s.type.badge || '-')}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <h3>Shift times</h3>
      <div class="grid-2">
        <div class="field">
          <label for="m-start">Morning starts</label>
          <input id="m-start" type="time" value="${escapeHtml(config.times.M.start)}" />
        </div>
        <div class="field">
          <label for="m-end">Morning ends</label>
          <input id="m-end" type="time" value="${escapeHtml(config.times.M.end)}" />
        </div>
        <div class="field">
          <label for="n-start">Night starts</label>
          <input id="n-start" type="time" value="${escapeHtml(config.times.N.start)}" />
        </div>
        <div class="field">
          <label for="n-end">Night ends</label>
          <input id="n-end" type="time" value="${escapeHtml(config.times.N.end)}" />
        </div>
      </div>
      <p class="disclaimer">A night ending at or before its start time is treated as finishing the next morning.</p>
    </div>

    <div class="card">
      <h3>Calendar</h3>
      <div class="field">
        <label for="cal-name">Calendar name</label>
        <input id="cal-name" type="text" value="${escapeHtml(config.calendarName)}" placeholder="Lab Shifts" />
      </div>
      <div class="field">
        <label for="cal-location">Location (optional)</label>
        <input id="cal-location" type="text" value="${escapeHtml(config.location)}" placeholder="Plant lab" />
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="alarm-m">Morning reminder (min before)</label>
          <input id="alarm-m" type="number" min="0" step="5" value="${Number(config.alarmMinutes)}" />
        </div>
        <div class="field">
          <label for="alarm-n">Night reminder (min before)</label>
          <input id="alarm-n" type="number" min="0" step="5" value="${Number(config.nightAlarmMinutes)}" />
        </div>
      </div>
      <p class="disclaimer">Set a reminder to 0 to leave it off.</p>
    </div>

    <button type="button" id="setup-save" class="btn btn-primary btn-block">Save rotation</button>
    <p id="setup-status" class="disclaimer"></p>
  `;

  bindSetup(config);
}

function bindSetup(config) {
  const view = getView();
  let cycle = [...config.cycle];

  // Whatever is currently typed into the form. Edits to the cycle strip or the
  // start date re-render the page, so unsaved field values are carried across.
  const collectForm = () => {
    const num = (sel, fallback) => {
      const v = Number(qs(sel, view).value);
      return Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback;
    };
    return {
      times: {
        M: { start: qs('#m-start', view).value || '06:00', end: qs('#m-end', view).value || '18:00' },
        N: { start: qs('#n-start', view).value || '18:00', end: qs('#n-end', view).value || '06:00' },
      },
      calendarName: qs('#cal-name', view).value.trim() || 'Lab Shifts',
      location: qs('#cal-location', view).value.trim(),
      alarmMinutes: num('#alarm-m', 60),
      nightAlarmMinutes: num('#alarm-n', 90),
    };
  };

  const rerenderFromState = async (patch) => {
    await saveConfig({ ...collectForm(), ...patch, cycle });
    renderShiftSetup();
  };

  qs('#cycle-strip', view).addEventListener('click', (ev) => {
    const slot = ev.target.closest('.cycle-slot[data-slot]');
    if (!slot) return;
    const i = Number(slot.dataset.slot);
    const order = ['M', 'N', 'O', 'L', 'T'];
    const next = order[(order.indexOf(cycle[i]) + 1) % order.length];
    cycle[i] = next;
    rerenderFromState({});
  });

  qs('#cycle-longer', view).addEventListener('click', () => {
    cycle = [...cycle, 'O'];
    rerenderFromState({});
  });

  qs('#cycle-shorter', view).addEventListener('click', () => {
    if (cycle.length <= 1) return;
    cycle = cycle.slice(0, -1);
    rerenderFromState({});
  });

  qs('#cycle-reset', view).addEventListener('click', () => {
    cycle = ['M', 'M', 'O', 'N', 'N', 'O', 'O', 'O'];
    rerenderFromState({});
  });

  qs('#anchor-date', view).addEventListener('change', (ev) => {
    if (!ev.target.value) return;
    rerenderFromState({ anchorDate: ev.target.value });
  });

  qs('#setup-save', view).addEventListener('click', async () => {
    await saveConfig({
      ...collectForm(),
      configured: true,
      cycle,
      anchorDate: qs('#anchor-date', view).value || config.anchorDate,
      anchorIndex: 0,
    });
    navigate('/shifts');
  });
}

/* ---------- export ---------- */

const RANGE_OPTIONS = [
  { id: 'month', label: 'This month', months: 1 },
  { id: 'm3', label: 'Next 3 months', months: 3 },
  { id: 'm6', label: 'Next 6 months', months: 6 },
  { id: 'm12', label: 'Next 12 months', months: 12 },
];

let exportState = { rangeId: 'm3' };

function rangeFor(rangeId) {
  const option = RANGE_OPTIONS.find((o) => o.id === rangeId) || RANGE_OPTIONS[1];
  const today = new Date();
  const start = monthBounds(today.getFullYear(), today.getMonth() + 1).start;
  // Let Date roll the month over rather than doing the wrap arithmetic by hand.
  const last = new Date(today.getFullYear(), today.getMonth() + option.months - 1, 1);
  const end = monthBounds(last.getFullYear(), last.getMonth() + 1).end;
  return { start, end };
}

export async function renderShiftExport() {
  const view = getView();
  const config = await getConfig();

  if (!config.configured) {
    view.innerHTML = `<a class="back-link" href="#/shifts">&larr; Shifts</a>${setupPrompt()}`;
    return;
  }

  const overrides = await getOverrideMap();
  const ledger = await getLedgerMap();
  const range = rangeFor(exportState.rangeId);
  const shifts = shiftsInRange(range.start, range.end, config, overrides);
  const preview = buildCalendar({ shifts, config, ledger, range });
  const stats = preview.stats;
  const tracked = await ledgerSize();

  view.innerHTML = `
    <a class="back-link" href="#/shifts">&larr; Shifts</a>
    <div class="section-title">Send to Google Calendar</div>

    <div class="chip-row" id="range-chips">
      ${RANGE_OPTIONS.map((o) => `
        <button type="button" class="chip ${o.id === exportState.rangeId ? 'active' : ''}" data-range="${o.id}">${escapeHtml(o.label)}</button>
      `).join('')}
    </div>

    <div class="fact-table">
      <div class="fact-row"><span class="fact-key">Covering</span><span class="fact-val">${range.start} to ${range.end}</span></div>
      <div class="fact-row"><span class="fact-key">Shifts in file</span><span class="fact-val">${stats.created + stats.updated + stats.unchanged}</span></div>
      <div class="fact-row"><span class="fact-key">New</span><span class="fact-val">${stats.created}</span></div>
      <div class="fact-row"><span class="fact-key">Changed since last export</span><span class="fact-val">${stats.updated}</span></div>
      <div class="fact-row"><span class="fact-key">Cancellations</span><span class="fact-val">${stats.cancelled}</span></div>
      <div class="fact-row"><span class="fact-key">Already in your calendar</span><span class="fact-val">${tracked}</span></div>
    </div>

    <div class="btn-row">
      <button type="button" id="export-share" class="btn btn-primary" style="flex:1;" hidden>Share</button>
      <button type="button" id="export-download" class="btn btn-primary" style="flex:1;">Download .ics</button>
    </div>
    <p id="export-status" class="disclaimer"></p>

    <div class="card">
      <h3>Importing it</h3>
      <p><strong>On a phone:</strong> tap Share and pick Google Calendar or Drive.</p>
      <p style="margin-top:8px;"><strong>On a computer:</strong> Google Calendar &rarr; Settings &rarr; Import &amp; export &rarr; Import, choose the file, pick the calendar.</p>
      <p style="margin-top:8px;">Export again any time you change a shift. Each event keeps the same identity, so Google updates the shift you already have rather than adding a duplicate, and a shift you removed comes through as a cancellation.</p>
      <p style="margin-top:8px;">Times are written as plain clock times, so a 06:00 shift stays 06:00 through daylight-saving changes. Import into a calendar set to the timezone you work in.</p>
    </div>

    <div class="card">
      <h3>Start over</h3>
      <p>Forget what has been exported. The next file will contain every shift as new - useful if you deleted the calendar and want to import it fresh.</p>
      <button type="button" id="export-reset" class="btn btn-block" style="margin-top:10px;">Reset export history</button>
    </div>
  `;

  bindExport(config, overrides);
}

async function deliverIcs(text, filename, mode) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });

  if (mode === 'share') {
    try {
      const file = new File([blob], filename, { type: 'text/calendar' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Lab shifts' });
        return 'shared';
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // Anything else: fall through to a normal download.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

function bindExport(config, overrides) {
  const view = getView();
  const status = qs('#export-status', view);

  qs('#range-chips', view).addEventListener('click', (ev) => {
    const btn = ev.target.closest('.chip[data-range]');
    if (!btn) return;
    exportState.rangeId = btn.dataset.range;
    renderShiftExport();
  });

  const shareBtn = qs('#export-share', view);
  if (navigator.canShare && navigator.share) {
    try {
      const probe = new File(['BEGIN:VCALENDAR'], 'probe.ics', { type: 'text/calendar' });
      if (navigator.canShare({ files: [probe] })) shareBtn.hidden = false;
    } catch { /* File constructor unavailable - keep the button hidden */ }
  }

  const run = async (mode) => {
    status.textContent = 'Building calendar...';
    const range = rangeFor(exportState.rangeId);
    const ledger = await getLedgerMap();
    const shifts = shiftsInRange(range.start, range.end, config, overrides);
    const { ics, ledgerRows, stats } = buildCalendar({ shifts, config, ledger, range });

    const result = await deliverIcs(ics, icsFilename(range), mode);
    if (result === 'cancelled') {
      status.textContent = 'Cancelled - nothing was recorded.';
      return;
    }

    // Only remember the export once the file actually left the app, so a
    // cancelled share does not silently advance the sequence numbers.
    await commitLedger(ledgerRows);
    await saveConfig({ lastExportAt: Date.now() });
    status.textContent = `${result === 'shared' ? 'Shared' : 'Downloaded'}: `
      + `${stats.created} new, ${stats.updated} updated, ${stats.unchanged} unchanged`
      + `${stats.cancelled ? `, ${stats.cancelled} cancelled` : ''}. Import it into Google Calendar.`;
  };

  qs('#export-download', view).addEventListener('click', () => run('download'));
  shareBtn.addEventListener('click', () => run('share'));

  qs('#export-reset', view).addEventListener('click', async () => {
    if (!confirm('Forget the export history? The next file will treat every shift as new.')) return;
    await clearLedger();
    renderShiftExport();
  });
}
