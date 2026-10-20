/** ui.js — форматирование, иконки, тосты, шторки, диалоги. */

const SYMBOLS = { RUB: '₽', USD: '$', EUR: '€', KZT: '₸', BYN: 'Br', GEL: '₾', UAH: '₴', TRY: '₺', AMD: '֏' };
let CURRENCY = 'RUB';
let LOCALE = 'ru-RU';

export function setCurrency(code) {
  CURRENCY = SYMBOLS[code] ? code : 'RUB';
}
export const currencySymbol = () => SYMBOLS[CURRENCY] || '₽';

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const nfSigned = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0, signDisplay: 'exceptZero' });

export const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Копейки -> «12 345,67 ₽» */
export function money(cents, opts = {}) {
  const value = (Number(cents) || 0) / 100;
  const abs = Math.abs(value);
  let num;
  if (opts.compact && abs >= 1000000) num = `${(value / 1000000).toFixed(1).replace('.', ',')} млн`;
  else if (opts.compact && abs >= 100000) num = `${Math.round(value / 1000)} тыс.`;
  else num = (opts.signed ? nfSigned : nf).format(value);
  num = num.replace('-', '−');
  if (opts.bare) return num;
  return `${num} ${opts.noSymbol ? '' : currencySymbol()}`.trim();
}

/** Число для поля ввода. */
export function amountInput(cents) {
  if (!cents) return '';
  const abs = Math.abs(cents);
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  return (cents < 0 ? '-' : '') + (kop ? `${rub},${String(kop).padStart(2, '0')}` : String(rub));
}

export function qtyFmt(qty) {
  const n = Number(qty) || 0;
  if (n === 0) return '0';
  if (Math.abs(n) >= 1) return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 }).format(n);
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 }).format(n);
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function fmtDate(iso, style = 'short') {
  if (!iso) return '';
  const d = parseISO(iso);
  const now = new Date();
  const isToday = iso === todayISO();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday = iso === `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  if (style === 'dayhead') {
    if (isToday) return 'Сегодня';
    if (isYesterday) return 'Вчера';
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  }
  if (style === 'full') {
    const sameYear = d.getFullYear() === now.getFullYear();
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
  }
  if (style === 'weekday') return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`;
}

export function monthLabel(key, style = 'long') {
  const [y, m] = String(key).split('-').map(Number);
  if (style === 'short') return `${MONTHS_SHORT[m - 1]}${y !== new Date().getFullYear() ? ` ${String(y).slice(2)}` : ''}`;
  return `${MONTHS_GEN[m - 1]} ${y}`;
}

export function monthLabelCap(key) {
  const s = monthLabel(key);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «октябрь 2026» — для фраз «за октябрь». */
export function monthNameNom(key) {
  const [y, m] = String(key).split('-').map(Number);
  return `${MONTHS_NOM[m - 1]} ${y}`;
}

/** «Сегодня» / «5 февраля» / ISO для input value */
export const humanDate = (iso) => (iso === todayISO() ? 'Сегодня' : fmtDate(iso, 'full'));

/* ─────────────────────────── иконки ─────────────────────────── */

const P = {
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9.5 20.5v-6h5v6"/>',
  card: '<rect x="2.5" y="5.5" width="19" height="13" rx="3"/><path d="M2.5 10.5h19"/><path d="M6.5 14.5h3"/>',
  cash: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 10v4M18 10v4"/>',
  coins: '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7.5" y="12" width="3" height="5" rx="1"/><rect x="13" y="8" width="3" height="9" rx="1"/><rect x="18" y="14" width="2.5" height="3" rx="1"/>',
  list: '<path d="M4 7h10M4 12h16M4 17h7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  in: '<path d="M17 7 7 17"/><path d="M7 10v7h7"/>',
  out: '<path d="M7 17 17 7"/><path d="M17 14V7h-7"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
  download: '<path d="M12 4v10"/><path d="m8 10.5 4 4 4-4"/><path d="M4.5 19.5h15"/>',
  upload: '<path d="M12 15V5"/><path d="m8 8.5 4-4 4 4"/><path d="M4.5 19.5h15"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9 7V5h6v2"/><path d="M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 6.5 17.5 10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M8 3.5v4M16 3.5v4M3.5 10.5h17"/>',
  wallet: '<path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h12.5A1.5 1.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19H6a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M3.5 9.5h13"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5"/>',
  shield: '<path d="M12 3.5 5 6.5v6c0 4.2 2.9 7 7 8.5 4.1-1.5 7-4.3 7-8.5v-6z"/><path d="m9 12 2 2 4-4"/>',
  gift: '<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9C10 9 8 8 8 6.2A2.2 2.2 0 0 1 12 5c2-2 4.5-1 4.5 1 0 1.9-2.5 3-4.5 3"/>',
  sparkles: '<path d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  cup: '<path d="M5 7h11v7a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z"/><path d="M16 9h2.5a2.5 2.5 0 0 1 0 5H16"/><path d="M4 21h13"/>',
  bus: '<rect x="4" y="4" width="16" height="12" rx="2.5"/><path d="M4 11h16"/><path d="M7.5 16v2.5M16.5 16v2.5"/><circle cx="8" cy="13.5" r=".8"/><circle cx="16" cy="13.5" r=".8"/>',
  heart: '<path d="M12 20s-7.5-4.4-7.5-9.2A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7.5 2.8C19.5 15.6 12 20 12 20z"/>',
  star: '<path d="m12 4 2.5 5.2 5.5.8-4 4 1 5.5-5-2.8-5 2.8 1-5.5-4-4 5.5-.8z"/>',
  repeat: '<path d="M6 8h11l-3-3M18 16H7l3 3"/>',
  dots: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',

  /* залитые варианты для выбранной вкладки — в духе SF Symbols */
  homeFill:
    '<path d="M11.1 3.6a1.4 1.4 0 0 1 1.8 0l7.6 6.3c.3.2.5.6.5 1v7.6a2 2 0 0 1-2 2h-4.4v-5.2h-4.2v5.2H5a2 2 0 0 1-2-2v-7.6c0-.4.2-.8.5-1z" fill="currentColor" stroke="none"/>',
  walletFill:
    '<path d="M4.5 6h15A2.5 2.5 0 0 1 22 8.5v1H2v-1A2.5 2.5 0 0 1 4.5 6z" fill="currentColor" stroke="none"/>' +
    '<path d="M2 11h20v4.5A2.5 2.5 0 0 1 19.5 18h-15A2.5 2.5 0 0 1 2 15.5z" fill="currentColor" stroke="none"/>',
  chartFill:
    '<rect x="4" y="11.5" width="4.2" height="8.5" rx="1.5" fill="currentColor" stroke="none"/>' +
    '<rect x="9.9" y="6" width="4.2" height="14" rx="1.5" fill="currentColor" stroke="none"/>' +
    '<rect x="15.8" y="13.5" width="4.2" height="6.5" rx="1.5" fill="currentColor" stroke="none"/>',
  dotsFill:
    '<circle cx="5.5" cy="12" r="1.9" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/>' +
    '<circle cx="18.5" cy="12" r="1.9" fill="currentColor" stroke="none"/>',
  briefcase: '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V5.5h6v2"/><path d="M3.5 12.5h17"/>',
  building: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M8.5 7.5h2M13.5 7.5h2M8.5 11.5h2M13.5 11.5h2M10 20.5v-4h4v4"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="0.6"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
};

export function icon(name, size = 20, cls = '') {
  const d = P[name] || P.dots;
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

export const ACCOUNT_ICONS = { card: 'card', cash: 'cash', crypto: 'coins' };

const CATEGORY_ICON_FALLBACK = { income: 'in', expense: 'out' };

export function categoryIcon(cat) {
  if (!cat) return 'dots';
  return P[cat.icon] ? cat.icon : CATEGORY_ICON_FALLBACK[cat.kind] || 'dots';
}

/* ─────────────────────────── тосты ─────────────────────────── */

let toastHost = null;

export function toast(message, kind = 'ok') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.innerHTML = `<span class="toast__icon">${icon(kind === 'error' ? 'info' : 'check', 16)}</span><span>${escapeHtml(message)}</span>`;
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 260);
  }, kind === 'error' ? 4200 : 2600);
}

/* ─────────────────────────── шторки и диалоги ─────────────────────────── */

let openLayer = null;

/**
 * Блокировка прокрутки фона во время шторки.
 * Документ больше не прокручивается: скроллер один — .view, поэтому блокировка
 * сводится к overflow: hidden на нём (класс body.no-scroll). Позиция прокрутки
 * у элемента при этом сохраняется сама, так что не нужно ни фиксировать body
 * через position: fixed + top, ни возвращать страницу через window.scrollTo —
 * именно эта пара на iPhone давала сброс позиции и мигание слоёв.
 * Счётчик нужен для вложенных слоёв: диалог подтверждения поверх карточки.
 */
const scrollLock = { y: 0, depth: 0 };

export function lockScroll() {
  if (scrollLock.depth === 0) {
    const view = document.getElementById('view');
    scrollLock.y = view ? Math.round(view.scrollTop) : 0;
    document.body.classList.add('no-scroll');
  }
  scrollLock.depth += 1;
}

export function unlockScroll() {
  if (scrollLock.depth === 0) return;
  scrollLock.depth -= 1;
  if (scrollLock.depth > 0) return;
  const y = scrollLock.y;
  document.body.classList.remove('no-scroll');
  // страховка: если WebKit всё же сбросил scrollTop у заблокированного скроллера
  const view = document.getElementById('view');
  if (view && Math.abs(view.scrollTop - y) > 0.5) view.scrollTop = y;
}

/** Позиция прокрутки, «замороженная» шторкой (или null, если блокировки нет). */
export const getLockedScroll = () => (scrollLock.depth > 0 ? scrollLock.y : null);

export function closeLayer() {
  if (!openLayer) return;
  const { root, onClose } = openLayer;
  openLayer = null;
  root.classList.remove('is-open');
  unlockScroll();
  setTimeout(() => root.remove(), 240);
  if (onClose) onClose();
}

export function openSheet({ title, subtitle = '', body, footer = '', onMount, variant = '' }) {
  closeLayer();
  const root = document.createElement('div');
  root.className = 'layer';
  root.innerHTML = `
    <div class="layer__backdrop" data-close></div>
    <div class="sheet ${variant}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="sheet__grip"></div>
      <header class="sheet__head">
        <div>
          <h2 class="sheet__title">${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="sheet__sub">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn" data-close aria-label="Закрыть">${icon('x', 18)}</button>
      </header>
      <div class="sheet__body">${body}</div>
      ${footer ? `<footer class="sheet__foot">${footer}</footer>` : ''}
    </div>`;
  document.body.appendChild(root);
  lockScroll();
  openLayer = { root, onClose: null };
  requestAnimationFrame(() => root.classList.add('is-open'));
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeLayer();
  });
  if (onMount) onMount(root);
  setTimeout(() => {
    const first = root.querySelector('[data-autofocus]');
    if (first && window.matchMedia('(min-width: 720px)').matches) first.focus();
  }, 80);
  return root;
}

export function confirmAction({ title, text = '', confirmLabel = 'Удалить', cancelLabel = 'Отмена', danger = true }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'layer layer--center';
    root.innerHTML = `
      <div class="layer__backdrop" data-cancel></div>
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h2 class="dialog__title">${escapeHtml(title)}</h2>
        ${text ? `<p class="dialog__text">${text}</p>` : ''}
        <div class="dialog__actions">
          <button class="btn btn--ghost" data-cancel>${escapeHtml(cancelLabel)}</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    lockScroll();
    requestAnimationFrame(() => root.classList.add('is-open'));
    const done = (value) => {
      root.classList.remove('is-open');
      unlockScroll();
      setTimeout(() => root.remove(), 200);
      resolve(value);
    };
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-confirm]')) done(true);
      else if (e.target.closest('[data-cancel]')) done(false);
    });
    setTimeout(() => root.querySelector('[data-confirm]')?.focus(), 60);
  });
}

export function field({ label, hint = '', control, className = '' }) {
  return `<label class="field ${className}">
    <span class="field__label">${escapeHtml(label)}</span>
    ${control}
    ${hint ? `<span class="field__hint">${hint}</span>` : ''}
  </label>`;
}

export function segmented(name, options, active) {
  return `<div class="seg" role="tablist">${options
    .map(
      (o) => `<button type="button" class="seg__item ${o.value === active ? 'is-active' : ''}" data-seg="${escapeHtml(name)}" data-value="${escapeHtml(o.value)}" role="tab" aria-selected="${o.value === active}">${escapeHtml(o.label)}</button>`,
    )
    .join('')}</div>`;
}

export function emptyState({ iconName = 'wallet', title, text, action = '' }) {
  return `<div class="empty">
    <div class="empty__art">${icon(iconName, 26)}</div>
    <h3 class="empty__title">${escapeHtml(title)}</h3>
    <p class="empty__text">${text}</p>
    ${action}
  </div>`;
}

export function pct(value, digits = 0) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(digits).replace('.', ',')}%`;
}
