/** views/history.js — журнал операций с фильтрами и поиском. */
import { money, icon, escapeHtml, emptyState, fmtDate, openSheet, closeLayer, toast } from '../ui.js';
import { txRow, txTitle } from '../components.js';
import { TYPE, TYPE_LABELS, summarize } from '../core.js';
import { getPeriod, resolveRange, periodChips, setCustom } from '../period.js';

export const filters = { q: '', type: '', accountId: '', categoryId: '' };

export function resetFilters() {
  filters.q = '';
  filters.type = '';
  filters.accountId = '';
  filters.categoryId = '';
}

function matches(state, tx, range) {
  if (tx.date < range.from || tx.date > range.to) return false;
  if (filters.type && tx.type !== filters.type) return false;
  if (filters.accountId && tx.accountId !== filters.accountId && tx.toAccountId !== filters.accountId) return false;
  if (filters.categoryId && tx.categoryId !== filters.categoryId) return false;
  if (filters.q) {
    const q = filters.q.toLowerCase().trim();
    const hay = [
      txTitle(state, tx),
      tx.comment,
      money(tx.amount),
      state.accounts.find((a) => a.id === tx.accountId)?.name,
      state.categories.find((c) => c.id === tx.categoryId)?.name,
      tx.qty ? String(tx.qty) : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function activeFilterCount() {
  return [filters.type, filters.accountId, filters.categoryId].filter(Boolean).length;
}

export function renderHistory({ state }) {
  const period = getPeriod();
  const range = resolveRange(period);
  const list = state.transactions.filter((t) => matches(state, t, range)).sort((a, b) => (a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : a.date < b.date ? 1 : -1));
  const sum = summarize(state, list);

  const groups = new Map();
  for (const tx of list) {
    if (!groups.has(tx.date)) groups.set(tx.date, []);
    groups.get(tx.date).push(tx);
  }

  const badges = [];
  if (filters.type) badges.push({ key: 'type', label: TYPE_LABELS[filters.type] || filters.type });
  if (filters.accountId) badges.push({ key: 'accountId', label: state.accounts.find((a) => a.id === filters.accountId)?.name || 'Счёт' });
  if (filters.categoryId) badges.push({ key: 'categoryId', label: state.categories.find((c) => c.id === filters.categoryId)?.name || 'Категория' });

  return `<div class="page">
    <div class="toolbar">
      <div class="search-field">
        ${icon('search', 17)}
        <input type="search" data-role="search" placeholder="Поиск по операциям" value="${escapeHtml(filters.q)}" aria-label="Поиск по операциям" />
        ${filters.q ? `<button class="icon-btn icon-btn--sm" data-act="clear-search" aria-label="Очистить поиск">${icon('x', 14)}</button>` : ''}
      </div>
      <button class="btn btn--soft btn--icon" data-act="open-filters" aria-label="Фильтры">
        ${icon('filter', 17)}${activeFilterCount() ? `<span class="badge">${activeFilterCount()}</span>` : ''}
      </button>
    </div>

    <div class="chips-scroll">${periodChips(period.preset)}</div>

    ${badges.length ? `<div class="active-filters">${badges.map((b) => `<button class="chip chip--on" data-act="clear-filter" data-key="${b.key}">${escapeHtml(b.label)}${icon('x', 12)}</button>`).join('')}<button class="link-btn" data-act="clear-filters">Сбросить</button></div>` : ''}

    <div class="summary-strip">
      <div><span>Доходы</span><b class="pos">+${escapeHtml(money(sum.income))}</b></div>
      <div><span>Расходы</span><b>−${escapeHtml(money(sum.expenses))}</b></div>
      <div><span>Итог</span><b class="${sum.net >= 0 ? 'pos' : 'neg'}">${escapeHtml(money(sum.net, { signed: true }))}</b></div>
    </div>

    ${
      list.length
        ? [...groups.entries()]
            .map(([date, txs]) => {
              const daySum = txs.reduce((acc, t) => {
                if (t.type === TYPE.INCOME) return acc + t.amount;
                if (t.type === TYPE.EXPENSE) return acc - t.amount;
                if (t.type === TYPE.REFUND) return acc + t.amount;
                return acc;
              }, 0);
              return `<div class="tx-group">
                <div class="tx-group__head">
                  <span>${escapeHtml(fmtDate(date, 'dayhead'))}</span>
                  ${daySum !== 0 ? `<span class="${daySum > 0 ? 'pos' : 'muted'}">${escapeHtml(money(daySum, { signed: true }))}</span>` : ''}
                </div>
                <div class="card card--flush"><div class="tx-list">${txs.map((t) => txRow(state, t, { hideDate: true })).join('')}</div></div>
              </div>`;
            })
            .join('')
        : emptyState({
            iconName: 'search',
            title: 'Операции не найдены',
            text: 'Измените период или сбросьте фильтры. Новую операцию можно добавить кнопкой «+» внизу.',
            action: `<button class="btn btn--soft" data-act="clear-filters">Сбросить фильтры</button>`,
          })
    }
  </div>`;
}

export function openFilters() {
  const state = window.__latte?.store.get();
  const accounts = state.accounts.filter((a) => !a.archived);
  const cats = state.categories;

  const root = openSheet({
    title: 'Фильтры',
    body: `<div class="form">
      <label class="field">
        <span class="field__label">Тип операции</span>
        <select class="input" data-f="type">
          <option value="">Все типы</option>
          ${Object.values(TYPE).map((t) => `<option value="${t}" ${filters.type === t ? 'selected' : ''}>${TYPE_LABELS[t]}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span class="field__label">Счёт</span>
        <select class="input" data-f="accountId">
          <option value="">Все счёта</option>
          ${accounts.map((a) => `<option value="${a.id}" ${filters.accountId === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span class="field__label">Категория</span>
        <select class="input" data-f="categoryId">
          <option value="">Все категории</option>
          ${['income', 'expense']
            .map(
              (kind) => `<optgroup label="${kind === 'income' ? 'Доходы' : 'Расходы'}">
              ${cats.filter((c) => c.kind === kind).map((c) => `<option value="${c.id}" ${filters.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </optgroup>`,
            )
            .join('')}
        </select>
      </label>
      <div class="two-col">
        <label class="field"><span class="field__label">С даты</span><input class="input" type="date" data-f="from" value="${escapeHtml(getPeriod().from)}" /></label>
        <label class="field"><span class="field__label">По дату</span><input class="input" type="date" data-f="to" value="${escapeHtml(getPeriod().to)}" /></label>
      </div>
      <p class="hint">Даты применяются, если выбран период «Свой период» — иначе используется выбранный период.</p>
    </div>`,
    footer: `<div class="footer-actions">
      <button class="btn btn--ghost" data-reset>Сбросить</button>
      <button class="btn btn--primary" data-apply>Применить</button>
    </div>`,
  });

  root.querySelector('[data-apply]').addEventListener('click', () => {
    filters.type = root.querySelector('[data-f="type"]').value;
    filters.accountId = root.querySelector('[data-f="accountId"]').value;
    filters.categoryId = root.querySelector('[data-f="categoryId"]').value;
    const from = root.querySelector('[data-f="from"]').value;
    const to = root.querySelector('[data-f="to"]').value;
    if (from && to && (from !== getPeriod().from || to !== getPeriod().to)) setCustom(from, to);
    closeLayer();
    window.__latte?.render();
  });

  root.querySelector('[data-reset]').addEventListener('click', () => {
    resetFilters();
    closeLayer();
    window.__latte?.render();
    toast('Фильтры сброшены');
  });
}
