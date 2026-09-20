import { db } from '../db.js';
import { todayIso } from '../utils.js';
import { DEFAULT_CYCLE, SHIFT_TYPES } from './shift-engine.js';

const CONFIG_KEY = 'config';

export const DEFAULT_CONFIG = {
  key: CONFIG_KEY,
  configured: false,
  cycle: [...DEFAULT_CYCLE],
  anchorDate: todayIso(),
  anchorIndex: 0,
  times: {
    M: { start: SHIFT_TYPES.M.start, end: SHIFT_TYPES.M.end },
    N: { start: SHIFT_TYPES.N.start, end: SHIFT_TYPES.N.end },
  },
  calendarName: 'Lab Shifts',
  location: '',
  alarmMinutes: 60,
  nightAlarmMinutes: 90,
  exportMonths: 3,
  lastExportAt: 0,
};

export async function getConfig() {
  const stored = await db.get('shiftConfig', CONFIG_KEY);
  if (!stored) return { ...DEFAULT_CONFIG, times: { ...DEFAULT_CONFIG.times } };
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    times: { ...DEFAULT_CONFIG.times, ...(stored.times || {}) },
    cycle: Array.isArray(stored.cycle) && stored.cycle.length ? stored.cycle : [...DEFAULT_CYCLE],
  };
}

export async function saveConfig(patch) {
  const current = await getConfig();
  const next = { ...current, ...patch, key: CONFIG_KEY };
  await db.put('shiftConfig', next);
  return next;
}

/* ---------- per-day overrides (swaps, overtime, leave) ---------- */

export async function getOverrideMap() {
  const rows = await db.getAll('shiftOverrides');
  const map = {};
  for (const row of rows) map[row.date] = row;
  return map;
}

export async function setOverride(date, code, note = '') {
  return db.put('shiftOverrides', { date, code, note, updatedAt: Date.now() });
}

export async function clearOverride(date) {
  return db.delete('shiftOverrides', date);
}

export async function countOverrides() {
  const rows = await db.getAll('shiftOverrides');
  return rows.length;
}

/* ---------- export ledger ----------
   Remembers every event handed to Google Calendar, so a later export can bump
   SEQUENCE on a changed shift and issue a cancellation for one that is gone. */

export async function getLedgerMap() {
  const rows = await db.getAll('shiftExports');
  const map = {};
  for (const row of rows) map[row.uid] = row;
  return map;
}

export async function commitLedger(rows) {
  for (const row of rows) {
    await db.put('shiftExports', row);
  }
}

export async function clearLedger() {
  return db.clear('shiftExports');
}

export async function ledgerSize() {
  const rows = await db.getAll('shiftExports');
  return rows.filter((r) => !r.cancelled).length;
}
