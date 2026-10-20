/**
 * diag.js — диагностический оверлей для замеров на реальном устройстве.
 *
 * Включается только вручную: ?diag=1 (выключается ?diag=0). В standalone-режиме,
 * где адресной строки нет, — пять тапов по строке «Сборка» в настройках.
 * По умолчанию выключен и на обычный вид не влияет: overlay — position: fixed,
 * pointer-events: none, z-index выше дока, высота панели не участвует в раскладке.
 *
 * Зачем: дефекты «док уезжает» и «чёрный кадр при переключении вкладок»
 * воспроизводятся только на iPhone. Панель показывает числа, по которым
 * причина определяется однозначно:
 *   • dock.position != fixed  → CSS не применился (кэш/конфликт правил);
 *   • dock.cblock != вьюпорт  → fixed считается от предка (containing block);
 *   • dock.gap меняется от контента → панель позиционируется не от экрана;
 *   • gap = 8 + safe, а визуально не у края → visual viewport.
 */
import { BUILD } from './core.js';
import { toast } from './ui.js';

const LS_KEY = 'opora.diag';

const state = {
  root: null,
  pre: null,
  active: false,
  bound: false,
  frame: 0,
  timer: 0,
  probe: null,
  extremes: { gapMin: null, gapMax: null, minAt: '', maxAt: '', maxScroll: 0 },
};

function searchParams() {
  try {
    return new URL(window.location.href).searchParams;
  } catch {
    return new URLSearchParams('');
  }
}

/**
 * Включён ли режим. Флаг живёт в localStorage, поэтому переживает перезапуск:
 * приложение можно установить на главный экран и включить замеры там, где
 * адресную строку не открыть (а дефекты видны именно в standalone).
 * Выключить: ?diag=0 или пять тапов по строке сборки в настройках.
 */
export function diagEnabled() {
  const flag = searchParams().get('diag');
  try {
    if (flag === '1') {
      localStorage.setItem(LS_KEY, '1');
      return true;
    }
    if (flag === '0') {
      localStorage.removeItem(LS_KEY);
      return false;
    }
    return localStorage.getItem(LS_KEY) === '1';
  } catch {
    return flag === '1';
  }
}

const npm = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : '—');
const num1 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : '—');

/** Короткое имя узла: div#app.dock и т.п. */
function nameOf(el) {
  if (!el) return 'нет';
  const tag = el.tagName ? el.tagName.toLowerCase() : '?';
  const id = el.id ? `#${el.id}` : '';
  const cls =
    typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : '';
  return tag + id + cls;
}

/**
 * Ближайший предок, который сам становится containing block для position: fixed.
 * Если он есть, fixed считается не от окна, а от этого предка — панель тогда
 * физически привязана к контенту и «уезжает» вместе с ним.
 */
function fixedContainingBlock(el) {
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    const cs = getComputedStyle(node);
    if (cs.transform && cs.transform !== 'none') return { el: node, why: 'transform' };
    if (cs.perspective && cs.perspective !== 'none') return { el: node, why: 'perspective' };
    if (cs.filter && cs.filter !== 'none') return { el: node, why: 'filter' };
    if (cs.backdropFilter && cs.backdropFilter !== 'none') return { el: node, why: 'backdrop-filter' };
    if (cs.contain && /paint|layout|strict|content/.test(cs.contain)) return { el: node, why: `contain:${cs.contain}` };
    if (cs.willChange && /transform|perspective|filter/.test(cs.willChange)) {
      return { el: node, why: `will-change:${cs.willChange}` };
    }
    if (cs.containerType && cs.containerType !== 'normal') return { el: node, why: `container-type:${cs.containerType}` };
    node = node.parentElement;
  }
  return null;
}

/** Пробник единиц вьюпорта: показывает, совпадают ли dvh/svh/lvh с innerHeight. */
function probeHeights() {
  if (!state.probe) {
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;z-index:-1';
    document.body.appendChild(el);
    state.probe = el;
  }
  const read = (value) => {
    state.probe.style.height = value;
    return state.probe.getBoundingClientRect().height;
  };
  return { dvh: read('100dvh'), svh: read('100svh'), lvh: read('100lvh'), vh: read('100vh') };
}

/** Полный срез состояния. Используется и в оверлее, и как JSON для логов. */
export function snapshot() {
  const doc = document.documentElement;
  const body = document.body;
  const dock = document.querySelector('.dock');
  const view = document.getElementById('view');
  const tabbar = document.querySelector('.tabbar');
  const vv = window.visualViewport || null;
  const rect = dock ? dock.getBoundingClientRect() : null;
  const dockCS = dock ? getComputedStyle(dock) : null;
  const bodyCS = getComputedStyle(body);
  const htmlCS = getComputedStyle(doc);
  const viewCS = view ? getComputedStyle(view) : null;
  const tabRect = tabbar ? tabbar.getBoundingClientRect() : null;
  const cb = dock ? fixedContainingBlock(dock) : null;
  const heights = probeHeights();

  return {
    build: BUILD,
    route: window.location.hash || '#/',
    innerHeight: npm(window.innerHeight),
    innerWidth: npm(window.innerWidth),
    visualHeight: vv ? npm(vv.height) : null,
    visualOffsetTop: vv ? npm(vv.offsetTop) : null,
    visualScale: vv ? num1(vv.scale) : null,
    docClientHeight: npm(doc.clientHeight),
    docClientWidth: npm(doc.clientWidth),
    docScrollHeight: npm(doc.scrollHeight),
    dvh: npm(heights.dvh),
    svh: npm(heights.svh),
    lvh: npm(heights.lvh),
    vh: npm(heights.vh),
    scrollY: npm(window.scrollY),
    bodyOverflow: bodyCS.overflow,
    bodyPosition: bodyCS.position,
    bodyHeight: npm(body.getBoundingClientRect().height),
    htmlOverflow: htmlCS.overflow,
    htmlHeight: npm(doc.getBoundingClientRect().height),
    dockParent: dock ? nameOf(dock.parentElement) : 'нет',
    dockPosition: dockCS ? dockCS.position : 'нет',
    dockBottom: dockCS ? dockCS.bottom : 'нет',
    dockSafeBottom: dockCS ? dockCS.getPropertyValue('--safe-b').trim() : 'нет',
    dockRectTop: rect ? npm(rect.top) : null,
    dockRectBottom: rect ? npm(rect.bottom) : null,
    dockHeight: tabRect ? npm(tabRect.height) : null,
    dockGap: rect ? npm(window.innerHeight - rect.bottom) : null,
    dockContainingBlock: cb ? `${nameOf(cb.el)} (${cb.why})` : 'вьюпорт',
    dockInlineStyle: dock ? dock.getAttribute('style') || '' : '',
    viewScrollTop: view ? npm(view.scrollTop) : null,
    viewScrollHeight: view ? npm(view.scrollHeight) : null,
    viewClientHeight: view ? npm(view.clientHeight) : null,
    viewOverflowY: viewCS ? viewCS.overflowY : 'нет',
    activeTabbar: (() => {
      // кнопки таббара не имеют data-nav на «Ещё», поэтому считаем по aria-current
      const el = document.querySelector('.tab[aria-current="page"]');
      return el ? el.getAttribute('data-nav') || 'more' : '—';
    })(),
    mode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
    renders: (window.__latte && window.__latte.renderCount) || 0,
    renderMs: (window.__latte && window.__latte.lastRenderMs) || 0,
  };
}

function trackExtremes(snap) {
  const x = state.extremes;
  if (typeof snap.dockGap === 'number') {
    if (x.gapMin === null || snap.dockGap < x.gapMin) {
      x.gapMin = snap.dockGap;
      x.minAt = snap.route;
    }
    if (x.gapMax === null || snap.dockGap > x.gapMax) {
      x.gapMax = snap.dockGap;
      x.maxAt = snap.route;
    }
  }
  if (typeof snap.viewScrollTop === 'number' && snap.viewScrollTop > x.maxScroll) x.maxScroll = snap.viewScrollTop;
}

function renderText(snap) {
  const x = state.extremes;
  const drift = x.gapMin === null ? '' : x.gapMax - x.gapMin > 1 ? ' ДРЕЙФ' : ' ровно';
  const range = x.gapMin === null ? '' : ` [${x.gapMin}..${x.gapMax}]${drift}`;
  const visual =
    snap.visualHeight === null ? 'нет API' : `${snap.visualHeight} top${snap.visualOffsetTop} sc${snap.visualScale}`;
  const viewMax = snap.viewScrollHeight === null ? '—' : snap.viewScrollHeight - snap.viewClientHeight;
  // держим строки короткими: панель должна целиком влезать в скриншот телефона
  const lines = [
    `build           ${snap.build}`,
    `route           ${snap.route} tab ${snap.activeTabbar} r${snap.renders} ${num1(snap.renderMs)}ms`,
    `innerHeight     ${snap.innerHeight}x${snap.innerWidth}`,
    `visualHeight    ${visual}`,
    `docClientHeight ${snap.docClientHeight}x${snap.docClientWidth} h${snap.docScrollHeight}`,
    `dvh/svh/lvh     ${snap.dvh}/${snap.svh}/${snap.lvh} vh${snap.vh}`,
    `scrollY         ${snap.scrollY}`,
    `body            ov ${snap.bodyOverflow} pos ${snap.bodyPosition} h${snap.bodyHeight}`,
    `html            ov ${snap.htmlOverflow} h${snap.htmlHeight}`,
    `dock.parent     ${snap.dockParent}`,
    `dock.position   ${snap.dockPosition}`,
    `dock.bottom     ${snap.dockBottom} safe ${snap.dockSafeBottom || '—'}`,
    `dock.rect       ${snap.dockRectTop}..${snap.dockRectBottom} h${snap.dockHeight}`,
    `dock.gap        ${snap.dockGap}${range}`,
    `dock.cblock     ${snap.dockContainingBlock}`,
    `view            top ${snap.viewScrollTop}/${viewMax} ov ${snap.viewOverflowY} max${x.maxScroll}`,
    `mode            ${snap.mode}`,
  ];
  if (snap.dockInlineStyle) lines.push(`dock.style      ${snap.dockInlineStyle}`);
  return lines.join('\n');
}

function update() {
  if (!state.active || !state.pre) return;
  const snap = snapshot();
  trackExtremes(snap);
  state.pre.textContent = renderText(snap);
  placePanel();
  window.__oporaDiag.last = snap;
}

/** Панель висит над доком, где бы он ни оказался: так видно и числа, и саму панель. */
function placePanel() {
  const dock = document.querySelector('.dock');
  const root = state.root;
  if (!root) return;
  const h = root.getBoundingClientRect().height;
  let bottom = 8;
  if (dock) {
    const r = dock.getBoundingClientRect();
    if (r.top > 0) bottom = Math.round(window.innerHeight - r.top) + 6;
  }
  const maxBottom = Math.max(8, Math.round(window.innerHeight - h - 62));
  root.style.bottom = `${Math.min(bottom, maxBottom)}px`;
}

function schedule() {
  if (!state.active || state.frame) return;
  state.frame = requestAnimationFrame(() => {
    state.frame = 0;
    update();
  });
}

/** Полный срез для копирования: то же, что в панели, плюс окружение. */
function copyPayload() {
  const snap = snapshot();
  return JSON.stringify(
    {
      ts: new Date().toISOString(),
      ua: navigator.userAgent,
      platform: navigator.platform,
      screen: {
        w: window.screen.width,
        h: window.screen.height,
        availW: window.screen.availWidth,
        availH: window.screen.availHeight,
        dpr: window.devicePixelRatio,
      },
      dpr: window.devicePixelRatio,
      extremes: state.extremes,
      snap,
    },
    null,
    1,
  );
}

const COPY_ICON =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<rect x="5.4" y="5.4" width="8.4" height="8.4" rx="2" stroke="currentColor" stroke-width="1.3"/>' +
  '<path d="M10.6 3.4A2 2 0 0 0 8.6 1.4H4.2A2.8 2.8 0 0 0 1.4 4.2v4.4a2 2 0 0 0 2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
  '</svg>';

/** Копирование замера: буфер обмена, иначе textarea, иначе выделение в диалоге. */
async function copySnapshot() {
  const text = copyPayload();
  try {
    await navigator.clipboard.writeText(text);
    toast('Замер скопирован — вставьте в чат', 'ok');
    return;
  } catch {
    /* iOS без https не даёт clipboard API — пробуем execCommand */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  if (ok) {
    toast('Замер скопирован — вставьте в чат', 'ok');
    return;
  }
  showSnapshotDialog(text);
}

function showSnapshotDialog(text) {
  const root = document.createElement('div');
  root.className = 'layer layer--center is-open';
  root.style.zIndex = '300';
  root.innerHTML =
    '<div class="layer__backdrop" data-close></div><div class="dialog" role="dialog">' +
    '<h2 class="dialog__title">Замер для диагностики</h2>' +
    '<p class="dialog__text">Выделите текст и скопируйте в чат.</p>' +
    '<textarea class="diag__dump" readonly></textarea>' +
    '<div class="dialog__actions"><button class="btn btn--primary" data-close>Закрыть</button></div></div>';
  document.body.appendChild(root);
  const area = root.querySelector('textarea');
  area.value = text;
  area.focus();
  area.select();
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) root.remove();
  });
}

function buildOverlay() {
  const root = document.createElement('div');
  root.className = 'diag';
  root.setAttribute('role', 'status');
  const pre = document.createElement('pre');
  pre.className = 'diag__pre';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'diag__copy';
  copy.setAttribute('aria-label', 'Скопировать замер');
  copy.innerHTML = COPY_ICON;
  copy.addEventListener('click', (e) => {
    e.stopPropagation();
    copySnapshot();
  });
  root.append(pre, copy);
  document.body.appendChild(root);
  state.root = root;
  state.pre = pre;
}

function bindEvents() {
  if (state.bound) return;
  state.bound = true;
  const opts = { capture: true, passive: true };
  document.addEventListener('scroll', schedule, opts);
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('orientationchange', schedule);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedule);
    window.visualViewport.addEventListener('scroll', schedule);
  }
  // страховка: высота контента меняется и без событий (док после рендера)
  state.timer = setInterval(schedule, 500);
}

function unbindEvents() {
  state.bound = false;
  clearInterval(state.timer);
  state.timer = 0;
  if (state.frame) {
    cancelAnimationFrame(state.frame);
    state.frame = 0;
  }
}

/** Включить/выключить оверлей на месте (без перезагрузки) и запомнить выбор. */
export function setDiag(on) {
  try {
    if (on) localStorage.setItem(LS_KEY, '1');
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* приватный режим — переключаем только в памяти */
  }
  state.active = Boolean(on);
  if (state.active) {
    if (!state.root) buildOverlay();
    bindEvents();
    update();
  } else {
    unbindEvents();
    if (state.root) state.root.remove();
    state.root = null;
    state.pre = null;
  }
  return state.active;
}

/** Переключатель для скрытого жеста в настройках (нужен в standalone-режиме). */
export const toggleDiag = () => setDiag(!state.active);

/** Точка входа: вызывается из boot() один раз. */
export function initDiag() {
  window.__oporaDiag = {
    snapshot,
    text: () => (state.pre ? state.pre.textContent : ''),
    reset: () => {
      state.extremes = { gapMin: null, gapMax: null, minAt: '', maxAt: '', maxScroll: 0 };
      update();
    },
    enabled: () => state.active,
    toggle: toggleDiag,
    last: null,
  };
  if (diagEnabled()) setDiag(true);
}

/** Рендер закончился — обновить срез, не дожидаясь события. */
export function diagTick() {
  if (state.active) schedule();
}
