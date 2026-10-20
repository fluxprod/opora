/** views/settings.js — настройки, категории, резервные копии. */
import { money, icon, escapeHtml, toast, openSheet, closeLayer, confirmAction, fmtDate, pct } from '../ui.js';
import { sectionHead } from '../components.js';
import { store } from '../store.js';
import { makeId } from '../schema.js';
import { TYPE, BUILD } from '../core.js';
import { toggleDiag } from '../diag.js';

const CURRENCIES = [
  { code: 'BYN', label: 'Белорусский рубль', symbol: 'Br' },
  { code: 'RUB', label: 'Российский рубль', symbol: '₽' },
  { code: 'USD', label: 'Доллар США', symbol: '$' },
];

export function storageSize() {
  try {
    return new Blob([JSON.stringify(store.get())]).size;
  } catch {
    return 0;
  }
}

function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2).replace('.', ',')} МБ`;
}

export function renderSettings({ state }) {
  const bytes = storageSize();
  const txCount = state.transactions.length;
  const incomeCats = state.categories.filter((c) => c.kind === 'income');
  const expenseCats = state.categories.filter((c) => c.kind === 'expense');

  return `<div class="page">
    <section class="card">
      ${sectionHead('Основное', '')}
      <div class="form">
        <label class="field">
          <span class="field__label">Основная валюта</span>
          <select class="input" data-currency>
            ${CURRENCIES.map((c) => `<option value="${c.code}" ${state.settings.currency === c.code ? 'selected' : ''}>${c.label} · ${c.symbol}</option>`).join('')}
          </select>
          <span class="field__hint">Меняется только символ отображения. Суммы не пересчитываются по курсу.</span>
        </label>
        <div class="field">
          <span class="field__label">Какой баланс показывать первым</span>
          <div class="seg" data-viewseg role="radiogroup" aria-label="Баланс по умолчанию">
            <button class="seg__item ${state.settings.balanceView !== 'total' ? 'is-active' : ''}" role="radio" aria-checked="${state.settings.balanceView !== 'total'}" data-view="fiat">Без крипты</button>
            <button class="seg__item ${state.settings.balanceView === 'total' ? 'is-active' : ''}" role="radio" aria-checked="${state.settings.balanceView === 'total'}" data-view="total">С криптой</button>
          </div>
        </div>
        <label class="switch">
          <input type="checkbox" data-hide-crypto ${state.settings.hideCrypto ? 'checked' : ''} />
          <span class="switch__track"><span class="switch__dot"></span></span>
          <span class="switch__text">Скрыть криптовалюту</span>
        </label>
        <p class="hint">Убирает криптосчёт, его стоимость и переключатель «С криптой» из главной и счетов. Операции и активы остаются на месте — вернуть можно здесь же.</p>
      </div>
    </section>

    <section class="card">
      ${sectionHead('Счета', `<button class="link-btn" data-act="account-new">${icon('plus', 14)}Добавить</button>`)}
      <div class="settings-list">
        ${state.accounts
          .map(
            (a) => `<button class="settings-row" data-act="account-edit" data-id="${escapeHtml(a.id)}">
              <span class="settings-row__icon">${icon(a.kind === 'card' ? 'card' : a.kind === 'cash' ? 'cash' : 'coins', 17)}</span>
              <span class="settings-row__main">
                <span class="settings-row__title">${escapeHtml(a.name)}</span>
                <span class="settings-row__sub">${a.kind === 'card' ? 'банковская карта' : a.kind === 'cash' ? 'наличные' : 'криптоактивы'}${a.archived ? ' · скрыт' : ''}</span>
              </span>
              ${icon('chevron', 15)}
            </button>`,
          )
          .join('')}
      </div>
    </section>

    <section class="card">
      ${sectionHead('Категории доходов', `<button class="link-btn" data-act="cat-new" data-kind="income">${icon('plus', 14)}Добавить</button>`)}
      <div class="cat-manage">
        ${incomeCats
          .map(
            (c) => `<div class="cat-manage__row">
              <span class="cat-manage__name">${escapeHtml(c.name)}</span>
              <label class="mini-switch" title="Учитывать в налоговом резерве">
                <input type="checkbox" data-cat-tax="${escapeHtml(c.id)}" ${c.taxable ? 'checked' : ''} />
                <span>резерв</span>
              </label>
              <button class="icon-btn icon-btn--sm" data-act="cat-edit" data-id="${escapeHtml(c.id)}" aria-label="Изменить категорию">${icon('edit', 14)}</button>
            </div>`,
          )
          .join('')}
      </div>
      <p class="hint">Отметка «резерв» определяет, с каких доходов считается налоговый резерв. Резерв не применяется к переводам и возвратам.</p>
    </section>

    <section class="card">
      ${sectionHead('Категории расходов', `<button class="link-btn" data-act="cat-new" data-kind="expense">${icon('plus', 14)}Добавить</button>`)}
      <div class="cat-manage">
        ${expenseCats
          .map(
            (c) => `<div class="cat-manage__row">
              <span class="cat-manage__name">${escapeHtml(c.name)}</span>
              <span></span>
              <button class="icon-btn icon-btn--sm" data-act="cat-edit" data-id="${escapeHtml(c.id)}" aria-label="Изменить категорию">${icon('edit', 14)}</button>
            </div>`,
          )
          .join('')}
      </div>
    </section>

    <section class="card">
      ${sectionHead('Налоговый резерв', `<button class="link-btn" data-act="go" data-to="tax">Подробнее${icon('chevron', 13)}</button>`)}
      <div class="form">
        <label class="field">
          <span class="field__label">Процент от доходов</span>
          <div class="input-suffix">
            <input class="input" type="number" min="0" max="100" step="0.1" data-rate value="${state.settings.taxRate}" />
            <span>%</span>
          </div>
        </label>
        <label class="switch">
          <input type="checkbox" data-tax-enabled ${state.settings.taxEnabled ? 'checked' : ''} />
          <span class="switch__track"><span class="switch__dot"></span></span>
          <span class="switch__text">Считать резерв для доходов</span>
        </label>
        <label class="switch">
          <input type="checkbox" data-auto-reserve ${state.settings.autoReserve ? 'checked' : ''} />
          <span class="switch__track"><span class="switch__dot"></span></span>
          <span class="switch__text">Сразу считать начисление зарезервированным</span>
        </label>
        <button class="btn btn--soft" data-tax-save>Сохранить</button>
      </div>
    </section>

    <section class="card">
      ${sectionHead('Данные', '')}
      <div class="data-block">
        <div class="data-row">
          <div>
            <b>Хранение</b>
            <span class="muted">Только в этом браузере на этом устройстве · ${humanBytes(bytes)} · ${txCount} операций</span>
          </div>
        </div>
        <p class="hint">Синхронизации между устройствами нет. Чтобы не потерять данные, делайте резервную копию: каждая копия — файл JSON со всеми счетами, операциями и настройками.</p>
        <div class="data-actions">
          <button class="btn btn--soft" data-export>${icon('download', 16)}Скачать копию</button>
          <button class="btn btn--soft" data-import>${icon('upload', 16)}Восстановить</button>
        </div>
        <input type="file" accept="application/json,.json" data-import-file hidden />
        <div class="data-danger">
          <div>
            <b>Сброс данных</b>
            <span class="muted">Удаляет все операции и настройки на этом устройстве</span>
          </div>
          <button class="btn btn--danger-ghost" data-reset>${icon('trash', 16)}Сбросить</button>
        </div>
      </div>
    </section>

    <section class="card">
      ${sectionHead('Приложение', '')}
      <div class="about">
        <div class="about__row"><span>Версия</span><b>1.0</b></div>
        <div class="about__row" data-build-row><span>Сборка</span><b>${escapeHtml(BUILD)}</b></div>
        <div class="about__row"><span>Схема данных</span><b>${state.version}</b></div>
        <div class="about__row"><span>Создано</span><b>${escapeHtml(fmtDate(String(state.createdAt).slice(0, 10), 'full'))}</b></div>
      </div>
      <p class="hint">Установите приложение на iPhone: «Поделиться» → «На экран „Домой“». После установки оно открывается без адресной строки и работает без интернета.</p>
    </section>
  </div>`;
}

export function mountSettings(root) {
  // Скрытый жест: пять тапов по строке сборки включают/выключают отладочный
  // оверлей. Нужен в standalone-режиме на iPhone — там нет адресной строки,
  // а именно в standalone видны дефекты оболочки (см. README, ?diag=1).
  const buildRow = root.querySelector('[data-build-row]');
  let taps = 0;
  let tapTimer = 0;
  buildRow?.addEventListener('click', () => {
    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      taps = 0;
    }, 1200);
    if (taps < 5) return;
    taps = 0;
    const on = toggleDiag();
    toast(on ? 'Диагностика включена — цифры в панели снизу' : 'Диагностика выключена');
  });

  const rateEl = root.querySelector('[data-rate]');
  const enabledEl = root.querySelector('[data-tax-enabled]');
  const autoEl = root.querySelector('[data-auto-reserve]');
  root.querySelector('[data-tax-save]')?.addEventListener('click', () => {
    const rate = Number(rateEl.value);
    if (!(rate >= 0 && rate <= 100)) return toast('Процент должен быть от 0 до 100', 'error');
    store.updateSettings({ taxRate: rate, taxEnabled: enabledEl.checked, autoReserve: autoEl.checked });
    toast('Настройки сохранены');
  });

  root.querySelector('[data-currency]')?.addEventListener('change', (e) => {
    store.updateSettings({ currency: e.target.value });
    toast('Валюта изменена');
  });

  root.querySelectorAll('[data-viewseg] [data-view]').forEach((btn) =>
    btn.addEventListener('click', () => {
      store.updateSettings({ balanceView: btn.getAttribute('data-view') });
    }),
  );

  root.querySelector('[data-hide-crypto]')?.addEventListener('change', (e) => {
    store.updateSettings({ hideCrypto: e.target.checked });
    toast(e.target.checked ? 'Криптовалюта скрыта' : 'Криптовалюта снова видна');
  });

  root.querySelectorAll('[data-cat-tax]').forEach((input) =>
    input.addEventListener('change', () => {
      const id = input.getAttribute('data-cat-tax');
      const cat = store.get().categories.find((c) => c.id === id);
      store.saveCategory({ ...cat, taxable: input.checked });
      toast(input.checked ? 'Доход учитывается в резерве' : 'Доход не учитывается в резерве');
    }),
  );

  root.querySelector('[data-export]')?.addEventListener('click', exportData);
  root.querySelector('[data-import]')?.addEventListener('click', () => root.querySelector('[data-import-file]').click());
  root.querySelector('[data-import-file]')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = await confirmAction({
      title: 'Заменить данные?',
      text: 'Текущие операции и настройки будут заменены содержимым файла. Сначала сохраните резервную копию, если сомневаетесь.',
      confirmLabel: 'Восстановить',
      danger: true,
    });
    if (!ok) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      store.importJSON(text);
      toast('Данные восстановлены из копии');
    } catch (err) {
      toast(err.message || 'Не удалось прочитать файл', 'error');
    }
    e.target.value = '';
  });

  root.querySelector('[data-reset]')?.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Сбросить все данные?',
      text: 'Будут удалены все операции, счета и настройки. Действие нельзя отменить — сделайте резервную копию заранее.',
      confirmLabel: 'Удалить всё',
    });
    if (!ok) return;
    store.reset();
    toast('Данные сброшены');
  });
}

export function exportData() {
  const json = store.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `latte-opora-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Резервная копия скачана');
}

export function openCategoryForm(categoryId = null, kind = 'expense') {
  const state = store.get();
  const cat = categoryId ? state.categories.find((c) => c.id === categoryId) : null;
  const isIncome = (cat?.kind || kind) === 'income';

  const root = openSheet({
    title: cat ? 'Категория' : 'Новая категория',
    body: `<div class="form">
      <label class="field"><span class="field__label">Название</span>
        <input class="input" data-f="name" value="${escapeHtml(cat?.name || '')}" maxlength="30" data-autofocus />
      </label>
      ${
        cat
          ? ''
          : `<div class="field"><span class="field__label">Тип</span>
              <div class="chip-row">
                <button type="button" class="chip ${!isIncome ? 'is-active' : ''}" data-kind="expense">Расход</button>
                <button type="button" class="chip ${isIncome ? 'is-active' : ''}" data-kind="income">Доход</button>
              </div>
            </div>`
      }
      <label class="switch">
        <input type="checkbox" data-f="taxable" ${cat?.taxable ? 'checked' : ''} ${isIncome ? '' : 'disabled'} />
        <span class="switch__track"><span class="switch__dot"></span></span>
        <span class="switch__text">Учитывать в налоговом резерве</span>
      </label>
    </div>`,
    footer: `<div class="footer-actions">
      ${cat ? `<button class="btn btn--danger-ghost" data-delete>${icon('trash', 16)}Удалить</button>` : `<span></span>`}
      <button class="btn btn--primary" data-save>Сохранить</button>
    </div>`,
  });

  let selectedKind = cat?.kind || kind;
  root.querySelectorAll('[data-kind]').forEach((btn) =>
    btn.addEventListener('click', () => {
      selectedKind = btn.getAttribute('data-kind');
      root.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('is-active', b === btn));
      root.querySelector('[data-f="taxable"]').disabled = selectedKind !== 'income';
    }),
  );

  root.querySelector('[data-save]').addEventListener('click', () => {
    const name = root.querySelector('[data-f="name"]').value.trim();
    if (!name) return toast('Введите название', 'error');
    try {
      store.saveCategory({
        id: cat?.id || makeId('cat'),
        kind: selectedKind,
        name,
        taxable: selectedKind === 'income' ? root.querySelector('[data-f="taxable"]').checked : false,
        icon: cat?.icon || (selectedKind === 'income' ? 'in' : 'out'),
      });
      closeLayer();
      toast(cat ? 'Категория обновлена' : 'Категория добавлена');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  root.querySelector('[data-delete]')?.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Удалить категорию?', text: 'Категорию можно удалить, только если по ней нет операций.', confirmLabel: 'Удалить' });
    if (!ok) return;
    try {
      store.deleteCategory(cat.id);
      closeLayer();
      toast('Категория удалена');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
