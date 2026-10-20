/** app.js — оболочка, роутер, действия. */
import { store } from './store.js';
import { computeState, TYPE } from './core.js';
import { money, icon, setCurrency, toast, openSheet, closeLayer, escapeHtml, getLockedScroll } from './ui.js';
import { initDiag, diagTick } from './diag.js';
import { initTelegram, syncTelegramBack, haptic } from './tg.js';
import { mountCharts } from './charts.js';
import { openTxForm, openTxDetail } from './txform.js';
import { renderHome } from './views/home.js';
import { renderAccounts, renderAccount, openAccountForm, openAssetForm } from './views/accounts.js';
import { renderEnvelopes, openEnvelopeForm, mountEnvelopes } from './views/envelopes.js';
import { renderTax, mountTax } from './views/tax.js';
import { renderHistory, openFilters, filters, resetFilters } from './views/history.js';
import { renderStats } from './views/stats.js';
import { renderSettings, mountSettings, openCategoryForm, exportData } from './views/settings.js';
import { getPeriod, setPreset, setCustom } from './period.js';

const app = {
  route: { name: 'home', params: {} },
  derived: null,
  scroll: {},
  searchFocused: false,
  renderCount: 0,
  lastRenderMs: 0,
};

const NAV = [
  { id: 'home', label: 'Главная', icon: 'home', to: 'home' },
  { id: 'accounts', label: 'Счета', icon: 'wallet', to: 'accounts' },
  { id: 'envelopes', label: 'Конверты', icon: 'target', to: 'envelopes' },
  { id: 'tax', label: 'Налоговый резерв', icon: 'percent', to: 'tax' },
  { id: 'history', label: 'Операции', icon: 'list', to: 'history' },
  { id: 'stats', label: 'Статистика', icon: 'chart', to: 'stats' },
  { id: 'settings', label: 'Настройки', icon: 'settings', to: 'settings' },
];

const TITLES = {
  home: ['Главная', 'Ваши деньги в одном месте'],
  accounts: ['Счета', 'Где лежат деньги'],
  account: ['Счёт', 'История и операции'],
  envelopes: ['Конверты', 'На что распределены деньги'],
  tax: ['Налоговый резерв', 'Сколько сохранить на карте'],
  history: ['Операции', 'Журнал доходов, расходов и переводов'],
  stats: ['Статистика', 'Доходы, расходы и динамика'],
  settings: ['Настройки', 'Данные, категории и резервные копии'],
};

function buildShell() {
  return `<div class="shell">
    <aside class="rail">
      <a class="brand" href="#/" data-act="go" data-to="home" aria-label="На главную">
        <span class="brand__mark">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <rect x="2" y="6.5" width="22" height="15" rx="5" stroke="#4690FF" stroke-width="1.8"/>
            <path d="M2 11.5h22" stroke="#4690FF" stroke-width="1.8"/>
            <circle cx="19" cy="16.5" r="1.9" fill="#4690FF"/>
          </svg>
        </span>
        <span class="brand__name">Опора</span>
      </a>
      <nav class="rail__nav" aria-label="Разделы">
        ${NAV.map(
          (n) => `<button class="rail__item" data-act="go" data-to="${n.to}" data-nav="${n.id}">
            ${icon(n.icon, 18)}<span>${escapeHtml(n.label)}</span>
          </button>`,
        ).join('')}
      </nav>
      <div class="rail__foot">
        <button class="btn btn--primary btn--block" data-act="add">${icon('plus', 16)}Новая операция</button>
        <p class="rail__note">${icon('lock', 13)}Данные хранятся только на этом устройстве</p>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="icon-btn topbar__back" data-act="back" aria-label="Назад" hidden>${icon('back', 18)}</button>
        <div class="topbar__titles">
          <h1 id="pageTitle">Главная</h1>
          <p id="pageSub">Ваши деньги в одном месте</p>
        </div>
        <div class="topbar__actions">
          <button class="icon-btn" data-act="go" data-to="history" aria-label="История операций">${icon('search', 18)}</button>
          <button class="btn btn--primary btn--sm topbar__add" data-act="add">${icon('plus', 15)}<span>Добавить</span></button>
        </div>
      </header>
      <main id="view" class="view" aria-live="polite"></main>
    </div>
  </div>

  <!-- док — последний элемент флекс-колонки #app, а не fixed-слой:
       его положение задаёт раскладка, поэтому он не может «уехать» к концу
       контента (дефект, который воспроизводился только на iPhone) -->
  <div class="dock">
    <nav class="tabbar" aria-label="Основная навигация">
      ${navTab('home', 'home', 'Главная')}
      ${navTab('accounts', 'wallet', 'Счета')}
      ${navTab('stats', 'chart', 'Статистика')}
      ${navTab('more', 'dots', 'Ещё', 'more')}
    </nav>
    <button class="dock__add" data-act="add" aria-label="Новая операция">${icon('plus', 26)}</button>
  </div>`;
}

/** Кнопка вкладки: контурная иконка в покое, залитая — в активном состоянии. */
function navTab(nav, glyph, label, act = 'go') {
  return `<button class="tab" data-act="${act}" ${act === 'go' ? `data-to="${nav}"` : ''} data-nav="${nav}">
      <span class="tab__ico">${icon(glyph, 24)}</span>
      <span class="tab__ico tab__ico--fill">${icon(`${glyph}Fill`, 24)}</span>
      <span class="tab__label">${label}</span>
    </button>`;
}

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = hash.split('/').filter(Boolean);
  if (!name) return { name: 'home', params: {} };
  if (name === 'accounts' && rest[0]) return { name: 'account', params: { id: decodeURIComponent(rest[0]) } };
  if (NAV.some((n) => n.id === name)) return { name, params: {} };
  return { name: 'home', params: {} };
}

/**
 * Скроллер приложения — сам .view, а не документ.
 * Документ не прокручивается (html/body overflow: hidden), поэтому все
 * операции с прокруткой идут через element.scrollTop. Это и есть обход
 * класса багов, на которых «плыла» прежняя оболочка: window.scrollTo
 * вместе с заменой layout в одном задании валил композитные слои в чёрный кадр,
 * а position: fixed на iPhone считался не от экрана.
 */
const scroller = () => document.getElementById('view');

function scrollTopOf() {
  const view = scroller();
  return view ? view.scrollTop : 0;
}

function scrollToTop() {
  const view = scroller();
  if (view && view.scrollTop > 0) view.scrollTop = 0;
}

function navigate(to) {
  const target = String(to).startsWith('#') ? to : `#/${to}`;
  if (location.hash === target) {
    // повторный тап по активной вкладке: наверх, но без полной перерисовки
    scrollToTop();
    return;
  }
  haptic('light');
  location.hash = target;
}

function goBack() {
  if (history.length > 1) history.back();
  else navigate('accounts');
}

function renderView() {
  const view = document.getElementById('view');
  const state = store.get();
  const ctx = { state, derived: app.derived, params: app.route.params };
  switch (app.route.name) {
    case 'accounts':
      return renderAccounts(ctx);
    case 'account':
      return renderAccount(ctx);
    case 'envelopes':
      return renderEnvelopes(ctx);
    case 'tax':
      return renderTax(ctx);
    case 'history':
      return renderHistory(ctx);
    case 'stats':
      return renderStats(ctx);
    case 'settings':
      return renderSettings(ctx);
    default:
      return renderHome(ctx);
  }
}

/**
 * Перерисовка текущего экрана.
 * Раньше здесь же вызывалась страховка ensureDockAnchored(): она правила
 * position/bottom дока инлайном, потому что fixed на iPhone вставал по
 * статической позиции. Теперь док — элемент раскладки, страховка не нужна,
 * а привязку к низу проверяет e2e.
 */
function render(opts = {}) {
  const started = performance.now();
  const state = store.get();
  setCurrency(state.settings.currency);
  app.derived = computeState(state);
  window.__latte = { store, derived: app.derived, render, navigate, filters, lastRenderMs: app.lastRenderMs, renderCount: app.renderCount };

  const view = document.getElementById('view');
  // Позицию берём до перерисовки. Если открыта шторка, .view заблокирован —
  // тогда используем сохранённую позицию, чтобы render() её не сбросил.
  const lockedY = getLockedScroll();
  const currentY = lockedY !== null ? lockedY : scrollTopOf();

  const activeEl = document.activeElement;
  const wasSearch =
    (activeEl && activeEl.getAttribute && activeEl.getAttribute('data-role') === 'search') || app.searchFocused;
  app.searchFocused = false;

  // Одна атомарная замена содержимого
  view.innerHTML = `<div class="view__inner">${renderView()}</div>`;

  if (app.route.name === 'envelopes') mountEnvelopes(view);
  if (app.route.name === 'tax') mountTax(view);
  if (app.route.name === 'settings') mountSettings(view);

  mountCharts(view);

  const [title, sub] = TITLES[app.route.name] || TITLES.home;
  document.getElementById('pageTitle').textContent = app.route.name === 'account' ? accountTitle(state) : title;
  // подзаголовок показываем всегда: иначе высота шапки меняется между экранами
  // и страница «прыгает» в момент переключения вкладки
  document.getElementById('pageSub').textContent = app.route.name === 'account' ? 'История и операции' : sub;

  document.querySelectorAll('[data-nav]').forEach((el) => {
    const id = el.getAttribute('data-nav');
    const active = id !== 'more' && (app.route.name === id || (app.route.name === 'account' && id === 'accounts'));
    el.classList.toggle('is-active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  const isDetail = app.route.name === 'account';
  document.querySelector('.topbar__back').hidden = !isDetail;
  syncTelegramBack(app.route.name === 'home');

  // панель больше не позиционируется сама — она элемент раскладки (см. app.css)

  // Прокрутку возвращаем уже после замены содержимого и в том же кадре,
  // иначе браузер успевает показать страницу в промежуточном положении.
  // scrollTop у элемента — чистая раскладка: документ при этом не двигается.
  const targetY = typeof opts.scrollTop === 'number' ? opts.scrollTop : currentY;
  if (lockedY === null && Math.abs(view.scrollTop - targetY) > 0.5) {
    view.scrollTop = targetY;
  }

  if (wasSearch) {
    const input = view.querySelector('[data-role="search"]');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  app.renderCount += 1;
  app.lastRenderMs = Math.round((performance.now() - started) * 10) / 10;
  window.__latte.lastRenderMs = app.lastRenderMs;
  window.__latte.renderCount = app.renderCount;
  diagTick();
}

function accountTitle(state) {
  const acc = state.accounts.find((a) => a.id === app.route.params.id);
  return acc ? acc.name : 'Счёт';
}

/* ─────────────────────────── действия ─────────────────────────── */

function onActionClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  // действие отменяет отложенную перерисовку поиска — иначе будет два рендера
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  const act = el.getAttribute('data-act');
  const id = el.getAttribute('data-id');
  const state = store.get();

  switch (act) {
    case 'add':
      openTxForm({ preset: {} });
      break;
    case 'add-preset':
      openTxForm({
        preset: { type: el.getAttribute('data-type') || TYPE.EXPENSE, accountId: el.getAttribute('data-account') || undefined },
      });
      break;
    case 'go':
      navigate(el.getAttribute('data-to'));
      break;
    case 'back':
      goBack();
      break;
    case 'set-view':
      store.updateSettings({ balanceView: el.getAttribute('data-view') });
      break;
    case 'account-open':
      navigate(`accounts/${encodeURIComponent(id)}`);
      break;
    case 'account-new':
      openAccountForm();
      break;
    case 'account-edit':
      openAccountForm(id);
      break;
    case 'asset-new':
      openAssetForm();
      break;
    case 'asset-edit':
      openAssetForm(id);
      break;
    case 'tx-open':
      openTxDetail(id);
      break;
    case 'env-edit':
      openEnvelopeForm(id);
      break;
    case 'env-move':
      openTxForm({ preset: { type: TYPE.ENV_TRANSFER, envelopeId: id } });
      break;
    case 'tax-pay':
      openTxForm({ preset: { type: TYPE.TAX_PAYMENT } });
      break;
    case 'reserve-all':
      store.reserveAll();
      toast('Все начисления зарезервированы');
      break;
    case 'toggle-reserved': {
      const tx = state.transactions.find((t) => t.id === id);
      if (tx) store.setReserved(id, tx.reserved === false);
      break;
    }
    case 'period':
      setPreset(el.getAttribute('data-preset'));
      render();
      break;
    case 'open-filters':
      openFilters();
      break;
    case 'clear-filter':
      filters[el.getAttribute('data-key')] = '';
      render();
      break;
    case 'clear-filters':
      resetFilters();
      setPreset('month');
      render();
      toast('Фильтры сброшены');
      break;
    case 'clear-search':
      filters.q = '';
      render();
      break;
    case 'cat-new':
      openCategoryForm(null, el.getAttribute('data-kind') || 'expense');
      break;
    case 'cat-edit':
      openCategoryForm(id);
      break;
    case 'export':
      exportData();
      break;
    case 'more':
      openMoreMenu();
      break;
    default:
      break;
  }
}

function openMoreMenu() {
  const root = openSheet({
    title: 'Ещё',
    body: `<div class="more-menu">
      <button class="more-item" data-go="envelopes">${icon('target', 19)}<span><b>Конверты</b><em>Доли, цели и переводы между конвертами</em></span>${icon('chevron', 15)}</button>
      <button class="more-item" data-go="tax">${icon('percent', 19)}<span><b>Налоговый резерв</b><em>Начисления, резерв и уплаты</em></span>${icon('chevron', 15)}</button>
      <button class="more-item" data-go="history">${icon('chart', 19)}<span><b>История операций</b><em>Поиск и фильтры по журналу</em></span>${icon('chevron', 15)}</button>
      <button class="more-item" data-go="settings">${icon('settings', 19)}<span><b>Настройки</b><em>Валюта, категории, резервные копии</em></span>${icon('chevron', 15)}</button>
    </div>`,
  });
  root.querySelectorAll('[data-go]').forEach((btn) =>
    btn.addEventListener('click', () => {
      closeLayer();
      navigate(btn.getAttribute('data-go'));
    }),
  );
}

let searchTimer = null;

function onSearchInput(e) {
  const input = e.target.closest('[data-role="search"]');
  if (!input) return;
  if (filters.q === input.value) return;
  filters.q = input.value;
  app.searchFocused = true;
  // Не перерисовываем журнал на каждое нажатие: ждём паузу в наборе
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    render();
  }, 140);
}

/* ─────────────────────────── запуск ─────────────────────────── */

let resizeTimer = null;

function boot() {
  // Внутри Телеграма — сразу, до первой раскладки: высота и safe-area приходят
  // от мессенджера числами, поэтому оболочке не нужно угадывать их через dvh.
  initTelegram({ onBack: () => goBack() });

  document.getElementById('app').innerHTML = buildShell();
  app.route = parseRoute();
  render();

  // Прокруткой управляем сами: иначе Safari восстанавливает её по-своему
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  document.addEventListener('click', onActionClick);
  document.addEventListener('input', onSearchInput);
  window.addEventListener('hashchange', () => {
    app.route = parseRoute();
    // Новая страница открывается сверху. Скроллер — обычный элемент (.view),
    // поэтому scrollTop выставляется прямо в render(): window.scrollTo, который
    // в одном задании с заменой layout давал чёрный кадр в WebKit, не нужен,
    // а сама прокрутка документа больше нигде не участвует.
    render({ scrollTop: 0 });
  });
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      mountCharts(document.getElementById('view'));
      diagTick();
    }, 180);
  });
  store.subscribe(() => render());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLayer();
    if (e.key.toLowerCase() === 'n' && !/input|select|textarea/i.test(document.activeElement?.tagName || '') && !document.querySelector('.layer')) {
      openTxForm({});
    }
  });

  // ?diag=1 — оверлей с замерами для проверки на реальном устройстве
  initDiag();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

boot();
