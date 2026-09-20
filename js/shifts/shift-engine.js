// Pure rotation math: no DOM, no storage. Everything here is a function of a
// config object plus an override map, so the grid, the home card and the ICS
// builder all derive shifts the same way.

const MS_PER_DAY = 86400000;

// The default rotation: 2 mornings, 1 off, 2 nights, 3 off (8-day cycle).
export const DEFAULT_CYCLE = ['M', 'M', 'O', 'N', 'N', 'O', 'O', 'O'];

export const SHIFT_TYPES = {
  M: { code: 'M', label: 'Morning', badge: 'M', kind: 'timed', start: '06:00', end: '18:00' },
  N: { code: 'N', label: 'Night', badge: 'N', kind: 'timed', start: '18:00', end: '06:00' },
  O: { code: 'O', label: 'Off', badge: '', kind: 'none' },
  L: { code: 'L', label: 'Leave', badge: 'L', kind: 'allday' },
  T: { code: 'T', label: 'Training', badge: 'T', kind: 'allday' },
};

// Codes a day can be set to by hand, in tap-through order.
export const OVERRIDE_CODES = ['M', 'N', 'O', 'L', 'T'];

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad(n) {
  return String(n).padStart(2, '0');
}

/* ---------- date helpers (UTC-anchored so DST never shifts a day count) ---------- */

export function isoToUtcMs(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function utcMsToIso(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(iso, n) {
  return utcMsToIso(isoToUtcMs(iso) + n * MS_PER_DAY);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / MS_PER_DAY);
}

// ISO date of a JS Date read in the device's local timezone.
export function localIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 0 = Monday ... 6 = Sunday. The grid is Monday-first.
export function weekdayIndex(iso) {
  const js = new Date(isoToUtcMs(iso)).getUTCDay(); // 0 = Sunday
  return (js + 6) % 7;
}

export function monthBounds(year, month /* 1-12 */) {
  const start = `${year}-${pad(month)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start, end: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/* ---------- cycle resolution ---------- */

export function shiftType(code, config) {
  const base = SHIFT_TYPES[code] || SHIFT_TYPES.O;
  const custom = config && config.times && config.times[code];
  return custom ? { ...base, ...custom } : base;
}

// Position within the rotation for a date, given the anchor day and which slot
// of the cycle that anchor day sat in.
export function cycleIndexFor(iso, config) {
  const cycle = (config && config.cycle) || DEFAULT_CYCLE;
  const len = cycle.length;
  if (!len) return 0;
  const offset = daysBetween(config.anchorDate, iso) + (config.anchorIndex || 0);
  return ((offset % len) + len) % len;
}

export function patternCodeFor(iso, config) {
  const cycle = (config && config.cycle) || DEFAULT_CYCLE;
  return cycle[cycleIndexFor(iso, config)] || 'O';
}

export function shiftFor(iso, config, overrides) {
  const override = overrides ? overrides[iso] : null;
  const code = override ? override.code : patternCodeFor(iso, config);
  return {
    date: iso,
    code,
    type: shiftType(code, config),
    overridden: Boolean(override),
    note: (override && override.note) || '',
  };
}

export function shiftsInRange(startIso, endIso, config, overrides) {
  const out = [];
  const total = daysBetween(startIso, endIso);
  for (let i = 0; i <= total; i++) {
    out.push(shiftFor(addDays(startIso, i), config, overrides));
  }
  return out;
}

/* ---------- clock times ---------- */

function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

// Night shifts end past midnight, so an end at or before the start rolls over.
export function crossesMidnight(type) {
  return type.kind === 'timed' && minutesOf(type.end) <= minutesOf(type.start);
}

export function shiftHours(type) {
  if (type.kind !== 'timed') return 0;
  let mins = minutesOf(type.end) - minutesOf(type.start);
  if (mins <= 0) mins += 1440;
  return mins / 60;
}

// The calendar date a shift finishes on - the day after, for nights.
export function shiftEndDateIso(shift) {
  if (shift.type.kind === 'allday') return addDays(shift.date, 1);
  return crossesMidnight(shift.type) ? addDays(shift.date, 1) : shift.date;
}

function atLocal(iso, hhmm) {
  const [y, m, d] = iso.split('-').map(Number);
  const [hh, mm] = String(hhmm).split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

// Local-time Date objects. Local (not UTC) is deliberate: a 06:00 shift is
// 06:00 on the clock whatever DST is doing, and the gap between two local
// times is the real number of hours slept.
export function shiftStart(shift) {
  if (shift.type.kind === 'allday') return atLocal(shift.date, '00:00');
  return atLocal(shift.date, shift.type.start);
}

export function shiftEnd(shift) {
  if (shift.type.kind === 'allday') return atLocal(addDays(shift.date, 1), '00:00');
  return atLocal(shiftEndDateIso(shift), shift.type.end);
}

export function isWorking(shift) {
  return shift.type.kind !== 'none';
}

/* ---------- lookups ---------- */

// The shift currently in progress, if any. Checks the previous day too, so a
// note written at 02:00 lands on the night shift that started the evening before.
export function shiftAtInstant(instant, config, overrides) {
  const iso = localIso(instant);
  for (const day of [addDays(iso, -1), iso]) {
    const shift = shiftFor(day, config, overrides);
    if (shift.type.kind !== 'timed') continue;
    if (instant >= shiftStart(shift) && instant < shiftEnd(shift)) return shift;
  }
  return null;
}

export function nextShift(config, overrides, from = new Date(), lookaheadDays = 120) {
  const iso = localIso(from);
  for (let i = 0; i <= lookaheadDays; i++) {
    const shift = shiftFor(addDays(iso, i), config, overrides);
    if (!isWorking(shift)) continue;
    if (shiftStart(shift) > from) return shift;
  }
  return null;
}

export function summarize(shifts) {
  const counts = {};
  let hours = 0;
  for (const shift of shifts) {
    counts[shift.code] = (counts[shift.code] || 0) + 1;
    hours += shiftHours(shift.type);
  }
  return { counts, hours, working: shifts.filter(isWorking).length };
}

/* ---------- fatigue checks ---------- */

export const FATIGUE_DEFAULTS = { minRestHours: 11, maxConsecutive: 7 };

// Flags the two things overrides tend to create: too little rest between two
// shifts, and a run of shifts with no day off in it.
export function analyzeFatigue(shifts, opts = {}) {
  const { minRestHours, maxConsecutive } = { ...FATIGUE_DEFAULTS, ...opts };
  const worked = shifts.filter((s) => s.type.kind === 'timed');
  const warnings = [];

  for (let i = 1; i < worked.length; i++) {
    const prev = worked[i - 1];
    const curr = worked[i];
    const restHours = (shiftStart(curr) - shiftEnd(prev)) / 3600000;
    if (restHours < 0) {
      warnings.push({
        date: curr.date,
        message: `${curr.type.label} on ${curr.date} starts before the ${prev.type.label} on ${prev.date} has finished.`,
      });
    } else if (restHours < minRestHours) {
      warnings.push({
        date: curr.date,
        message: `Only ${restHours.toFixed(1)} h off between the ${prev.type.label} on ${prev.date} and the ${curr.type.label} on ${curr.date}.`,
      });
    }
  }

  let runStart = null;
  let runLength = 0;
  const flushRun = () => {
    if (runLength > maxConsecutive) {
      warnings.push({
        date: runStart,
        message: `${runLength} shifts in a row starting ${runStart} - no full day off in that block.`,
      });
    }
    runStart = null;
    runLength = 0;
  };

  for (const shift of shifts) {
    if (shift.type.kind === 'timed') {
      if (runLength === 0) runStart = shift.date;
      runLength += 1;
    } else {
      flushRun();
    }
  }
  flushRun();

  return warnings;
}
