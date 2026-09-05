import { db, uuid } from '../db.js';
import { todayIso } from '../utils.js';

export const CATEGORIES = ['water', 'boiler', 'wastewater', 'maintenance', 'general'];
export const STATUSES = ['open', 'ongoing', 'closed'];

export function parseTags(raw) {
  return String(raw || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function listEntries() {
  const all = await db.getAll('logEntries');
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getEntry(id) {
  return db.get('logEntries', id);
}

export async function createEntry({ title, body, tags, category, status, date }) {
  const now = Date.now();
  const entry = {
    id: uuid(),
    date: date || todayIso(),
    createdAt: now,
    updatedAt: now,
    title: title || '',
    body: body || '',
    tags: tags || [],
    category: category || 'general',
    status: status || 'open',
    edits: [],
  };
  await db.put('logEntries', entry);
  return entry;
}

export async function updateEntry(id, changes, { appendEdit } = {}) {
  const existing = await getEntry(id);
  if (!existing) throw new Error('Entry not found');
  const updated = {
    ...existing,
    ...changes,
    updatedAt: Date.now(),
  };
  if (appendEdit) {
    updated.edits = [...(existing.edits || []), { timestamp: Date.now(), note: appendEdit }];
  }
  await db.put('logEntries', updated);
  return updated;
}

export async function deleteEntry(id) {
  return db.delete('logEntries', id);
}

export function searchEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => {
    const hay = [e.title, e.body, e.category, e.status, ...(e.tags || [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function filterByCategory(entries, category) {
  if (!category) return entries;
  return entries.filter((e) => e.category === category);
}
