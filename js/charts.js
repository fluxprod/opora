/**
 * charts.js — SVG-графики без зависимостей.
 * Каждый график рисуется по фактической ширине контейнера, поэтому текст остаётся чётким.
 */
import { money, monthLabel, escapeHtml } from './ui.js';

const TAU = Math.PI * 2;

/** Тема графиков: цвета берём из CSS-токенов, чтобы не дублировать hex в JS. */
let themeCache = null;
function theme() {
  if (themeCache) return themeCache;
  const style = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (style.getPropertyValue(name) || '').trim() || fallback;
  themeCache = {
    accent: v('--accent', '#4690ff'),
    surface: v('--bg', '#05070a'),
    grid: v('--chart-grid', 'rgba(255,255,255,.06)'),
  };
  return themeCache;
}

/** Палитра категорий и конвертов (--chart-1..6). */
let paletteCache = null;
export function chartPalette() {
  if (!paletteCache) {
    const style = getComputedStyle(document.documentElement);
    paletteCache = [1, 2, 3, 4, 5, 6].map((i) => (style.getPropertyValue(`--chart-${i}`) || '').trim() || '#4690ff');
  }
  return paletteCache;
}

function niceMax(value) {
  if (value <= 0) return 100;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const n = value / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * base;
}

function emptyChart(width, height, text) {
  return `<svg class="chart__svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(text)}">
    <line x1="0" y1="${height - 1}" x2="${width}" y2="${height - 1}" stroke="rgba(255,255,255,.08)" stroke-dasharray="3 5"/>
    <text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="chart__empty">${escapeHtml(text)}</text>
  </svg>`;
}

/* ── столбики: доходы/расходы по месяцам ── */
function bars(spec, width) {
  const height = spec.height || 190;
  const padTop = 16;
  const padBottom = 26;
  const padLeft = 46;
  const plotW = Math.max(40, width - padLeft);
  const plotH = height - padTop - padBottom;
  const items = spec.items;
  if (!items.length) return emptyChart(width, height, 'Нет данных');
  const max = niceMax(Math.max(...items.flatMap((i) => i.values.map((v) => v.value)), 1));
  const slot = plotW / items.length;
  const barW = Math.min(22, Math.max(6, slot / (spec.valuesPerItem + 1.6)));
  const gap = 5;
  const y = (v) => padTop + plotH - (v / max) * plotH;

  let grid = '';
  for (let i = 0; i <= 2; i++) {
    const val = (max / 2) * i;
    const yy = y(val);
    grid += `<line x1="${padLeft}" y1="${yy.toFixed(1)}" x2="${width}" y2="${yy.toFixed(1)}" stroke="rgba(255,255,255,${i === 0 ? '.16' : '.055'})"/>`;
    grid += `<text x="0" y="${(yy + 3).toFixed(1)}" class="chart__axis">${money(val, { compact: true, bare: true })}</text>`;
  }

  let shapes = '';
  items.forEach((item, idx) => {
    const cx = padLeft + slot * idx + slot / 2;
    const totalW = barW * item.values.length + gap * (item.values.length - 1);
    let x0 = cx - totalW / 2;
    item.values.forEach((v) => {
      const h = Math.max(v.value > 0 ? 2.5 : 0, (v.value / max) * plotH);
      const yy = padTop + plotH - h;
      shapes += `<rect x="${x0.toFixed(1)}" y="${yy.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="${Math.min(5, barW / 2)}" fill="${v.color}">
        <title>${escapeHtml(item.label)} · ${escapeHtml(v.name)}: ${escapeHtml(money(v.value))}</title></rect>`;
      x0 += barW + gap;
    });
    shapes += `<text x="${cx.toFixed(1)}" y="${height - 6}" text-anchor="middle" class="chart__label">${escapeHtml(item.label)}</text>`;
  });

  return `<svg class="chart__svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Доходы и расходы по месяцам">${grid}${shapes}</svg>`;
}

/* ── линия/площадь: динамика баланса ── */
function smooth(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function area(spec, width) {
  const height = spec.height || 200;
  const padTop = 18;
  const padBottom = 24;
  const points = spec.points;
  if (!points.length) return emptyChart(width, height, 'Нет данных');
  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const plotH = height - padTop - padBottom;
  const x = (i) => (points.length === 1 ? width / 2 : (i / (points.length - 1)) * width);
  const y = (v) => padTop + plotH - ((v - min) / span) * plotH;

  const coords = points.map((p, i) => [x(i), y(p.value)]);
  const line = smooth(coords);
  const areaPath = `${line} L ${x(points.length - 1).toFixed(1)} ${height - padBottom} L ${x(0).toFixed(1)} ${height - padBottom} Z`;
  const last = coords[coords.length - 1];

  const ticks = [0, 0.5, 1].map((t) => {
    const val = min + span * t;
    const yy = y(val);
    return `<line x1="0" y1="${yy.toFixed(1)}" x2="${width}" y2="${yy.toFixed(1)}" stroke="rgba(255,255,255,{.055})"/>`.replace('{.055}', t === 0 ? '.14' : '.05');
  }).join('');

  return `<svg class="chart__svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Динамика баланса">
    <defs>
      <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme().accent}" stop-opacity=".34"/>
        <stop offset="100%" stop-color="${theme().accent}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${ticks}
    <path d="${areaPath}" fill="url(#areaFill)"/>
    <path d="${line}" fill="none" stroke="${theme().accent}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.6" fill="${theme().surface}" stroke="${theme().accent}" stroke-width="2"/>
    <text x="${Math.min(last[0] + 8, width - 4).toFixed(1)}" y="${(last[1] - 10).toFixed(1)}" text-anchor="end" class="chart__label chart__label--strong">${escapeHtml(money(points[points.length - 1].value, { compact: true }))}</text>
  </svg>`;
}

/* ── пончик: расходы по категориям ── */
function donut(spec, width) {
  const size = Math.min(width, spec.size || 200);
  const stroke = spec.stroke || 18;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const total = spec.segments.reduce((s, x) => s + x.value, 0);
  if (!total) return emptyChart(width, size, 'Нет расходов за период');
  let angle = -Math.PI / 2;
  let paths = '';
  for (const seg of spec.segments) {
    const sweep = (seg.value / total) * TAU;
    if (sweep <= 0) continue;
    const x1 = c + r * Math.cos(angle);
    const y1 = c + r * Math.sin(angle);
    const x2 = c + r * Math.cos(angle + sweep);
    const y2 = c + r * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    paths += `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${seg.color}" stroke-width="${stroke}" stroke-linecap="butt">
      <title>${escapeHtml(seg.label)}: ${escapeHtml(money(seg.value))} (${Math.round((seg.value / total) * 100)}%)</title></path>`;
    angle += sweep;
  }
  return `<svg class="chart__svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Расходы по категориям">${paths}
    <text x="${c}" y="${c - 2}" text-anchor="middle" class="chart__label">Всего</text>
    <text x="${c}" y="${c + 18}" text-anchor="middle" class="chart__center">${escapeHtml(money(total, { compact: true }))}</text>
  </svg>`;
}

/* ── горизонтальная составная полоса: конверты ── */
function stack(spec, width) {
  const height = spec.height || 14;
  const parts = spec.segments.filter((s) => s.value > 0);
  const total = parts.reduce((s, x) => s + x.value, 0) || 1;
  let x = 0;
  let shapes = '';
  for (const seg of parts) {
    const w = (seg.value / total) * width;
    shapes += `<rect x="${x.toFixed(1)}" y="0" width="${Math.max(1, w - 2).toFixed(1)}" height="${height}" rx="4" fill="${seg.color}"><title>${escapeHtml(seg.label)}: ${escapeHtml(money(seg.value))}</title></rect>`;
    x += w;
  }
  return `<svg class="chart__svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" role="img" aria-label="Распределение по конвертам">${shapes}</svg>`;
}

/* ── спарклайн для главного экрана ── */
function spark(spec, width) {
  const height = spec.height || 44;
  const points = spec.points;
  if (points.length < 2) return '';
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points.map((p, i) => [(i / (points.length - 1)) * width, height - 3 - ((p.value - min) / span) * (height - 6)]);
  const line = smooth(coords);
  return `<svg class="chart__svg chart__svg--spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme().accent}" stop-opacity=".26"/>
        <stop offset="100%" stop-color="${theme().accent}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${line} L ${width} ${height} L 0 ${height} Z" fill="url(#sparkFill)"/>
    <path d="${line}" fill="none" stroke="${theme().accent}" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
}

function buildChart(spec, width) {
  switch (spec.type) {
    case 'bars':
      return bars(spec, width);
    case 'area':
      return area(spec, width);
    case 'donut':
      return donut(spec, width);
    case 'stack':
      return stack(spec, width);
    case 'spark':
      return spark(spec, width);
    default:
      return '';
  }
}

export function renderChart(el, spec) {
  const width = Math.max(160, Math.floor(el.clientWidth || 300));
  el.innerHTML = buildChart(spec, width);
}

/**
 * Рисует все графики, размеченные в DOM через data-chart (URI-encoded JSON).
 * Измерения и вставки разделены: иначе каждая вставка вызывает новую раскладку.
 */
export function mountCharts(root) {
  const targets = [];
  for (const el of root.querySelectorAll('[data-chart]')) {
    const raw = el.getAttribute('data-chart');
    if (!raw) continue;
    try {
      targets.push({ el, spec: JSON.parse(decodeURIComponent(raw)) });
    } catch (err) {
      console.warn('chart', err);
    }
  }
  if (!targets.length) return;
  const widths = targets.map((t) => Math.max(160, Math.floor(t.el.clientWidth || 300)));
  targets.forEach((t, i) => {
    t.el.innerHTML = buildChart(t.spec, widths[i]);
  });
}

export const chartAttr = (spec) => `data-chart="${encodeURIComponent(JSON.stringify(spec))}"`;
export { monthLabel };
