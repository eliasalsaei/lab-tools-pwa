export function todayIso() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

export function formatDateTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: 'numeric', day: 'numeric', year: '2-digit',
    hour: 'numeric', minute: '2-digit',
  });
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function nl2brEscaped(str) {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

export function round(num, decimals = 2) {
  if (!Number.isFinite(num)) return num;
  const f = 10 ** decimals;
  return Math.round((num + Number.EPSILON) * f) / f;
}

export function parseNum(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : NaN;
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
