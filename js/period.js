/** period.js — выбранный период для истории и статистики. */
import { isoToday, monthKey, monthRange, addMonths } from './core.js';
import { monthLabelCap, monthNameNom } from './ui.js';

const presets = ['month', 'prev', '3m', 'year', 'all', 'custom'];

const state = {
  preset: 'month',
  month: monthKey(isoToday()),
  from: monthRange(monthKey(isoToday())).from,
  to: isoToday(),
};

export function getPeriod() {
  return { ...state };
}

export function presetList() {
  const key = monthKey(isoToday());
  const cur = monthNameNom(key);
  return [
    { id: 'month', label: cur.charAt(0).toUpperCase() + cur.slice(1) },
    { id: 'prev', label: 'Прошлый месяц' },
    { id: '3m', label: '3 месяца' },
    { id: 'year', label: 'Год' },
    { id: 'all', label: 'Всё время' },
  ];
}

export function resolveRange(p = state) {
  const today = isoToday();
  const thisMonth = monthKey(today);
  const cur = monthNameNom(thisMonth);
  const cap = cur.charAt(0).toUpperCase() + cur.slice(1);
  switch (p.preset) {
    case 'month':
      return { ...monthRange(thisMonth), label: cap };
    case 'prev': {
      const k = addMonths(thisMonth, -1);
      const nm = monthNameNom(k);
      return { ...monthRange(k), label: nm.charAt(0).toUpperCase() + nm.slice(1) };
    }
    case '3m': {
      const start = addMonths(thisMonth, -2);
      return { from: monthRange(start).from, to: today, label: 'Последние 3 месяца' };
    }
    case 'year': {
      const year = today.slice(0, 4);
      return { from: `${year}-01-01`, to: today, label: `С начала ${year} года` };
    }
    case 'all':
      return { from: '1900-01-01', to: today, label: 'Всё время' };
    case 'custom':
      return { from: p.from, to: p.to, label: `${p.from.split('-').reverse().join('.')} — ${p.to.split('-').reverse().join('.')}` };
    default:
      return { ...monthRange(thisMonth), label: monthLabelCap(thisMonth) };
  }
}

export function setPreset(preset) {
  state.preset = presets.includes(preset) ? preset : 'month';
  if (preset === 'custom') {
    const r = resolveRange();
    state.from = r.from;
    state.to = r.to;
  }
}

export function setCustom(from, to) {
  state.preset = 'custom';
  state.from = from;
  state.to = to;
}

export function inPeriod(date, p = state) {
  const r = resolveRange(p);
  return date >= r.from && date <= r.to;
}

export function periodChips(activePreset) {
  return presetList()
    .map(
      (p) =>
        `<button class="chip ${p.id === activePreset ? 'is-active' : ''}" data-act="period" data-preset="${p.id}">${p.label}</button>`,
    )
    .join('');
}
