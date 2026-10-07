// Minimal SVG charts for the RO simulator: rendered at the container's real
// pixel width so text stays legible on phones. Single-series, one axis.
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function niceTicks(min, max, count = 5) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toPrecision(10));
  return ticks;
}

export function fmt(v, digits) {
  if (!Number.isFinite(v)) return '—';
  const d = digits ?? (Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
  return v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function frame(container, height) {
  container.textContent = '';
  container.classList.add('ro-chart');
  const width = Math.max(container.clientWidth, 260);
  const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
  const tip = document.createElement('div');
  tip.className = 'ro-tip';
  tip.hidden = true;
  container.append(svg, tip);
  return { svg, tip, width };
}

function showTip(tip, container, x, y, value, label) {
  tip.textContent = '';
  const v = document.createElement('strong');
  v.textContent = value;
  const l = document.createElement('span');
  l.textContent = label;
  tip.append(v, l);
  tip.hidden = false;
  const cw = container.clientWidth;
  const tw = tip.offsetWidth;
  tip.style.left = `${Math.min(Math.max(x - tw / 2, 0), cw - tw)}px`;
  tip.style.top = `${Math.max(y - tip.offsetHeight - 10, 0)}px`;
}

function axes(svg, { width, height, m, yTicks, yScale, yUnit }) {
  for (const t of yTicks) {
    const y = yScale(t);
    svg.append(svgEl('line', { x1: m.l, x2: width - m.r, y1: y, y2: y, class: 'ro-grid' }));
    const txt = svgEl('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end', class: 'ro-axis' });
    txt.textContent = fmt(t, Math.abs(yTicks[1] - yTicks[0]) < 1 ? (Math.abs(yTicks[1] - yTicks[0]) < 0.1 ? 2 : 1) : 0);
    svg.append(txt);
  }
  const u = svgEl('text', { x: m.l - 6, y: m.t - 10, 'text-anchor': 'end', class: 'ro-axis' });
  u.textContent = yUnit;
  svg.append(u);
}

// data: [{label, value, series?}], opts: {unit, digits, xTitle, legend: [{label, series}]}
export function barChart(container, data, opts = {}) {
  const height = 220;
  const { svg, tip, width } = frame(container, height);
  if (opts.legend) {
    const lg = document.createElement('div');
    lg.className = 'ro-legend';
    for (const item of opts.legend) {
      const span = document.createElement('span');
      const key = document.createElement('i');
      key.className = `ro-key ro-key-s${item.series}`;
      span.append(key, document.createTextNode(item.label));
      lg.append(span);
    }
    container.prepend(lg);
  }
  svg.setAttribute('aria-label', opts.ariaLabel || 'Bar chart');
  const m = { l: 48, r: 10, t: 26, b: 38 };
  const vals = data.map((d) => d.value);
  const yTicks = niceTicks(Math.min(0, ...vals), Math.max(...vals), 4);
  const y0 = yTicks[0], y1 = yTicks[yTicks.length - 1];
  const yScale = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (height - m.t - m.b);
  axes(svg, { width, height, m, yTicks, yScale, yUnit: opts.unit || '' });

  const band = (width - m.l - m.r) / data.length;
  const bw = Math.min(band - 2, 44);
  data.forEach((d, i) => {
    const cx = m.l + band * (i + 0.5);
    const top = yScale(Math.max(d.value, 0));
    const base = yScale(0);
    const h = Math.max(base - top, 0);
    const r = Math.min(4, h, bw / 2);
    // Rounded at the data end, square at the baseline.
    const x = cx - bw / 2;
    const path = `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${base} Z`;
    const bar = svgEl('path', { d: path, class: `ro-bar ro-bar-s${d.series || 1}` });
    svg.append(bar);
    const lbl = svgEl('text', { x: cx, y: height - m.b + 16, 'text-anchor': 'middle', class: 'ro-axis' });
    lbl.textContent = d.label;
    svg.append(lbl);
    const hit = svgEl('rect', { x: cx - band / 2, y: m.t, width: band, height: height - m.t - m.b, fill: 'transparent', tabindex: 0 });
    const on = () => {
      bar.classList.add('hover');
      showTip(tip, container, cx, top, `${fmt(d.value, opts.digits)} ${opts.unit || ''}`, d.tip || d.label);
    };
    const off = () => { bar.classList.remove('hover'); tip.hidden = true; };
    hit.addEventListener('pointerenter', on);
    hit.addEventListener('focus', on);
    hit.addEventListener('pointerleave', off);
    hit.addEventListener('blur', off);
    svg.append(hit);
  });
  if (opts.xTitle) {
    const t = svgEl('text', { x: m.l + (width - m.l - m.r) / 2, y: height - 4, 'text-anchor': 'middle', class: 'ro-axis' });
    t.textContent = opts.xTitle;
    svg.append(t);
  }
}

// points: [{x, y}], opts: {xUnit, yUnit, xDigits, yDigits, marker: {x, y}, xTitle}
export function lineChart(container, points, opts = {}) {
  const height = 240;
  const { svg, tip, width } = frame(container, height);
  svg.setAttribute('aria-label', opts.ariaLabel || 'Line chart');
  const m = { l: 52, r: 14, t: 26, b: 40 };
  const ys = points.map((p) => p.y).filter(Number.isFinite);
  if (opts.marker && Number.isFinite(opts.marker.y)) ys.push(opts.marker.y);
  let ymin = Math.min(...ys), ymax = Math.max(...ys);
  if (opts.zeroBase && ymin > 0) ymin = 0;
  const pad = (ymax - ymin) * 0.08 || Math.abs(ymax) * 0.05 || 1;
  const yTicks = niceTicks(opts.zeroBase ? ymin : ymin - pad, ymax + pad, 4);
  const y0 = yTicks[0], y1 = yTicks[yTicks.length - 1];
  const yScale = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (height - m.t - m.b);
  const x0 = points[0].x, x1 = points[points.length - 1].x;
  const xScale = (v) => m.l + (v - x0) / (x1 - x0) * (width - m.l - m.r);
  axes(svg, { width, height, m, yTicks, yScale, yUnit: opts.yUnit || '' });

  const xTicks = niceTicks(x0, x1, Math.max(4, Math.floor((width - m.l - m.r) / 60))).filter((t) => t >= x0 - 1e-9 && t <= x1 + 1e-9);
  const xStep = xTicks.length > 1 ? Math.abs(xTicks[1] - xTicks[0]) : 1;
  for (const t of xTicks) {
    const txt = svgEl('text', { x: xScale(t), y: height - m.b + 16, 'text-anchor': 'middle', class: 'ro-axis' });
    txt.textContent = fmt(t, xStep < 1 ? (xStep < 0.1 ? 2 : 1) : 0);
    svg.append(txt);
  }
  if (opts.xTitle) {
    const t = svgEl('text', { x: m.l + (width - m.l - m.r) / 2, y: height - 4, 'text-anchor': 'middle', class: 'ro-axis' });
    t.textContent = opts.xTitle;
    svg.append(t);
  }

  if (opts.limit && opts.limit.y >= y0 && opts.limit.y <= y1) {
    const y = yScale(opts.limit.y);
    svg.append(svgEl('line', { x1: m.l, x2: width - m.r, y1: y, y2: y, class: 'ro-limit' }));
    const t = svgEl('text', { x: width - m.r, y: y - 5, 'text-anchor': 'end', class: 'ro-axis' });
    t.textContent = opts.limit.label;
    svg.append(t);
  }

  const valid = points.filter((p) => Number.isFinite(p.y));
  const d = valid.map((p, i) => `${i ? 'L' : 'M'}${xScale(p.x).toFixed(1)},${yScale(p.y).toFixed(1)}`).join(' ');
  svg.append(svgEl('path', { d, class: 'ro-line' }));

  if (opts.marker) {
    const cx = xScale(opts.marker.x), cy = yScale(opts.marker.y);
    svg.append(svgEl('circle', { cx, cy, r: 5, class: 'ro-marker' }));
    const t = svgEl('text', { x: cx, y: cy - 12, 'text-anchor': cx > width - 80 ? 'end' : 'middle', class: 'ro-marker-label' });
    t.textContent = `now: ${fmt(opts.marker.y, opts.yDigits)}`;
    svg.append(t);
  }

  // Crosshair snapping to the nearest sweep point.
  const hair = svgEl('line', { y1: m.t, y2: height - m.b, class: 'ro-hair', visibility: 'hidden' });
  const dot = svgEl('circle', { r: 4, class: 'ro-hair-dot', visibility: 'hidden' });
  const hit = svgEl('rect', { x: m.l, y: m.t, width: width - m.l - m.r, height: height - m.t - m.b, fill: 'transparent' });
  svg.append(hair, dot, hit);
  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    let best = valid[0];
    for (const p of valid) if (Math.abs(xScale(p.x) - px) < Math.abs(xScale(best.x) - px)) best = p;
    const cx = xScale(best.x), cy = yScale(best.y);
    hair.setAttribute('x1', cx); hair.setAttribute('x2', cx);
    hair.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
    dot.setAttribute('visibility', 'visible');
    showTip(tip, container, cx, cy, `${fmt(best.y, opts.yDigits)} ${opts.yUnit || ''}`,
      `at ${fmt(best.x, opts.xDigits)} ${opts.xUnit || ''}`);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => {
    hair.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });
}
