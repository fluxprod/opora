/** txform.js — быстрое добавление, правка и просмотр операции. */
import { TYPE, TYPE_LABELS, computeState, parseAmountToCents, validateTransaction } from './core.js';
import { prepareTransaction, previewAllocation } from './commands.js';
import { money, icon, escapeHtml, openSheet, closeLayer, confirmAction, toast, todayISO, amountInput, qtyFmt, monthLabel } from './ui.js';
import { txTitle, txSub, txIcon, accountName } from './components.js';
import { store } from './store.js';

const TYPE_ORDER = [
  TYPE.EXPENSE,
  TYPE.INCOME,
  TYPE.TRANSFER,
  TYPE.REFUND,
  TYPE.TAX_PAYMENT,
  TYPE.ENV_TRANSFER,
  TYPE.CRYPTO_BUY,
  TYPE.CRYPTO_SELL,
  TYPE.CRYPTO_SPEND,
  TYPE.ADJUSTMENT,
];

const TYPE_SHORT = {
  [TYPE.EXPENSE]: 'Расход',
  [TYPE.INCOME]: 'Доход',
  [TYPE.TRANSFER]: 'Перевод',
  [TYPE.REFUND]: 'Возврат',
  [TYPE.TAX_PAYMENT]: 'Налог',
  [TYPE.ENV_TRANSFER]: 'Конверты',
  [TYPE.CRYPTO_BUY]: 'Купить крипту',
  [TYPE.CRYPTO_SELL]: 'Продать крипту',
  [TYPE.CRYPTO_SPEND]: 'Трата крипты',
  [TYPE.ADJUSTMENT]: 'Корректировка',
};

const TYPE_ICON = {
  [TYPE.EXPENSE]: 'out',
  [TYPE.INCOME]: 'in',
  [TYPE.TRANSFER]: 'swap',
  [TYPE.REFUND]: 'repeat',
  [TYPE.TAX_PAYMENT]: 'percent',
  [TYPE.ENV_TRANSFER]: 'wallet',
  [TYPE.CRYPTO_BUY]: 'coins',
  [TYPE.CRYPTO_SELL]: 'coins',
  [TYPE.CRYPTO_SPEND]: 'coins',
  [TYPE.ADJUSTMENT]: 'edit',
};

const fiatAccounts = (state) => state.accounts.filter((a) => a.kind !== 'crypto' && !a.archived);
const cryptoAccount = (state) => state.accounts.find((a) => a.kind === 'crypto');
const cryptoAssetsOf = (state) => cryptoAccount(state)?.assets || [];

export function openTxForm({ tx = null, preset = {} } = {}) {
  const state = store.get();
  const accounts = fiatAccounts(state);
  const assets = cryptoAssetsOf(state);

  const model = {
    type: tx?.type || preset.type || TYPE.EXPENSE,
    amount: tx ? tx.amount : preset.amount || 0,
    qty: tx ? tx.qty : 0,
    accountId: tx?.accountId || preset.accountId || accounts[0]?.id || null,
    toAccountId: tx?.toAccountId || accounts[1]?.id || accounts[0]?.id || null,
    categoryId: tx ? tx.categoryId : preset.categoryId || null,
    envelopeId: tx ? tx.envelopeId : preset.envelopeId || null,
    toEnvelopeId: tx ? tx.toEnvelopeId : state.envelopes[1]?.id || null,
    assetId: tx?.assetId || assets[0]?.id || null,
    date: tx?.date || todayISO(),
    comment: tx?.comment || '',
    taxable: tx ? tx.taxable : null,
    reserved: tx ? tx.reserved : null,
  };

  if (!model.categoryId && (model.type === TYPE.EXPENSE || model.type === TYPE.INCOME || model.type === TYPE.REFUND)) {
    const pool = state.categories.filter((c) => c.kind === (model.type === TYPE.INCOME ? 'income' : 'expense'));
    model.categoryId = pool[0]?.id || null;
  }

  const isEdit = !!tx;

  const body = `
    <div class="txform">
      <div class="amount-block">
        <span class="amount-block__label" data-amount-label>Сумма</span>
        <div class="amount-input-wrap">
          <input class="amount-input" data-field="amount" data-autofocus inputmode="decimal" autocomplete="off"
            placeholder="0" value="${model.amount ? escapeHtml(amountInput(model.amount)) : ''}"
            aria-label="Сумма операции" />
          <span class="amount-input__cur">${escapeHtml(money(0).split(' ').pop())}</span>
        </div>
      </div>

      <div class="type-row" data-types role="radiogroup" aria-label="Тип операции">
        ${TYPE_ORDER.map((t) => typeBtn(t, model.type)).join('')}
      </div>

      <div class="form-dyn" data-dyn></div>

      <label class="field field--row">
        <span class="field__label">Дата</span>
        <input class="input input--plain" type="date" data-field="date" value="${escapeHtml(model.date)}" max="2100-12-31" />
      </label>

      <label class="field field--row">
        <span class="field__label">Комментарий</span>
        <input class="input input--plain" type="text" data-field="comment" maxlength="120" placeholder="необязательно" value="${escapeHtml(model.comment)}" />
      </label>

      <p class="form-error" data-error hidden></p>
    </div>`;

  const root = openSheet({
    title: isEdit ? 'Изменить операцию' : 'Новая операция',
    subtitle: isEdit ? escapeHtml(txTitle(state, tx)) : '',
    body,
    footer: `<button class="btn btn--primary btn--block" data-save>${isEdit ? 'Сохранить изменения' : 'Сохранить операцию'}</button>`,
  });

  const dyn = root.querySelector('[data-dyn]');
  const amountInputEl = root.querySelector('[data-field="amount"]');
  const amountLabel = root.querySelector('[data-amount-label]');
  const errorEl = root.querySelector('[data-error]');

  function renderDyn() {
    // сохраняем уже введённые значения динамических полей (только реальные input/select)
    for (const el of dyn.querySelectorAll('input[data-field], select[data-field], textarea[data-field]')) {
      const key = el.getAttribute('data-field');
      if (key === 'date' || key === 'comment' || key === 'amount') continue;
      if (['taxable', 'reserved'].includes(key)) model[key] = el.type === 'checkbox' ? el.checked : el.value === 'true';
      else if (el.type === 'checkbox') model[key] = el.checked;
      else model[key] = el.value === '' ? null : el.value;
    }
    dyn.innerHTML = dynHtml();
    wireDyn();
  }

  function dynHtml() {
    const t = model.type;
    const needFiat = [TYPE.EXPENSE, TYPE.INCOME, TYPE.REFUND, TYPE.TRANSFER, TYPE.TAX_PAYMENT, TYPE.ADJUSTMENT].includes(t);
    const parts = [];

    if (needFiat) {
      parts.push(`
        <div class="field">
          <span class="field__label">${t === TYPE.TRANSFER ? 'Со счёта' : 'Счёт'}</span>
          <div class="chip-row chip-row--accounts" data-field="accountId" role="radiogroup" aria-label="${t === TYPE.TRANSFER ? 'Со счёта' : 'Счёт'}">
            ${accounts.map((a) => accountChip(a, model.accountId, 'accountId')).join('')}
          </div>
        </div>`);
    }

    if (t === TYPE.TRANSFER) {
      parts.push(`
        <div class="field">
          <span class="field__label">На счёт</span>
          <div class="chip-row chip-row--accounts" data-field="toAccountId" role="radiogroup" aria-label="На счёт">
            ${accounts.map((a) => accountChip(a, model.toAccountId, 'toAccountId')).join('')}
          </div>
        </div>`);
    }

    if (t === TYPE.INCOME || t === TYPE.EXPENSE || t === TYPE.REFUND) {
      const kind = t === TYPE.INCOME ? 'income' : 'expense';
      const cats = state.categories.filter((c) => c.kind === kind);
      if (!cats.some((c) => c.id === model.categoryId)) model.categoryId = cats[0]?.id || null;
      parts.push(`
        <div class="field">
          <span class="field__label">Категория</span>
          <div class="chip-row" data-field="categoryId" role="radiogroup" aria-label="Категория">
            ${cats.map((c) => `<button type="button" class="chip ${c.id === model.categoryId ? 'is-active' : ''}" role="radio" aria-checked="${c.id === model.categoryId}" data-pick="categoryId" data-value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`).join('')}
          </div>
        </div>`);
      if (t !== TYPE.REFUND) {
        parts.push(`
          <div class="field">
            <span class="field__label">Конверт</span>
            <div class="chip-row" data-field="envelopeId" role="radiogroup" aria-label="Конверт">
              <button type="button" class="chip ${!model.envelopeId ? 'is-active' : ''}" role="radio" aria-checked="${!model.envelopeId}" data-pick="envelopeId" data-value="">Без конверта</button>
              ${state.envelopes.map((e) => `<button type="button" class="chip ${e.id === model.envelopeId ? 'is-active' : ''}" role="radio" aria-checked="${e.id === model.envelopeId}" data-pick="envelopeId" data-value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</button>`).join('')}
            </div>
          </div>`);
      }
    }

    if (t === TYPE.INCOME) {
      const cat = state.categories.find((c) => c.id === model.categoryId);
      const taxable = model.taxable === null ? !!cat?.taxable : !!model.taxable;
      const rate = state.settings.taxRate;
      parts.push(`
        <label class="switch">
          <input type="checkbox" data-field="taxable" ${taxable ? 'checked' : ''} ${state.settings.taxEnabled ? '' : 'disabled'} />
          <span class="switch__track"><span class="switch__dot"></span></span>
          <span class="switch__text">Налоговый резерв ${state.settings.taxEnabled ? `${rate}%` : 'выключен'}</span>
        </label>`);
      parts.push(`<div class="preview" data-preview></div>`);
    }

    if ([TYPE.CRYPTO_BUY, TYPE.CRYPTO_SELL, TYPE.CRYPTO_SPEND].includes(t)) {
      if (!assets.length) {
        parts.push(`<div class="note note--warn">${icon('info', 16)}<span>Сначала добавьте криптоактив в разделе «Счета» → «Криптовалюта».</span></div>`);
      } else {
        if (!assets.some((a) => a.id === model.assetId)) model.assetId = assets[0].id;
        const asset = assets.find((a) => a.id === model.assetId);
        parts.push(`
          <div class="field">
            <span class="field__label">Актив</span>
            <div class="chip-row" data-field="assetId" role="radiogroup">
              ${assets.map((a) => `<button type="button" class="chip ${a.id === model.assetId ? 'is-active' : ''}" data-pick="assetId" data-value="${escapeHtml(a.id)}">${escapeHtml(a.symbol)}</button>`).join('')}
            </div>
          </div>
          <div class="two-col">
            <label class="field">
              <span class="field__label">Количество</span>
              <input class="input" data-field="qty" inputmode="decimal" value="${model.qty ? escapeHtml(qtyFmt(model.qty)) : ''}" placeholder="0" />
            </label>
            <div class="field">
              <span class="field__label">Курс</span>
              <input class="input" value="${escapeHtml(money(asset?.price || 0, { bare: true }))}" readonly />
            </div>
          </div>
          <p class="hint">Стоимость подставляется по текущему курсу. Курс меняется в карточке актива.</p>`);
      }
    }

    if (t === TYPE.ENV_TRANSFER) {
      parts.push(`
        <div class="field">
          <span class="field__label">Из конверта</span>
          <div class="chip-row" data-field="envelopeId" role="radiogroup">
            ${state.envelopes.map((e) => `<button type="button" class="chip ${e.id === model.envelopeId ? 'is-active' : ''}" data-pick="envelopeId" data-value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <span class="field__label">В конверт</span>
          <div class="chip-row" data-field="toEnvelopeId" role="radiogroup">
            ${state.envelopes.map((e) => `<button type="button" class="chip ${e.id === model.toEnvelopeId ? 'is-active' : ''}" data-pick="toEnvelopeId" data-value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</button>`).join('')}
          </div>
        </div>`);
    }

    if (t === TYPE.TAX_PAYMENT) {
      const d = computeState(state);
      parts.push(`<div class="note">${icon('info', 16)}<span>Сумма спишется со счёта и закроет часть резерва. Осталось зарезервировано: <b>${escapeHtml(money(d.tax.reserveAvailable))}</b>.</span></div>`);
    }

    if (t === TYPE.ADJUSTMENT) {
      parts.push(`<p class="hint">Введите сумму со знаком: <b>500</b> — прибавить, <b>−500</b> — вычесть. Корректировка не считается доходом или расходом.</p>`);
    }

    return parts.join('');
  }

  function accountChip(acc, active, field) {
    return `<button type="button" class="chip ${acc.id === active ? 'is-active' : ''}" role="radio" aria-checked="${acc.id === active}" data-pick="${field}" data-value="${escapeHtml(acc.id)}">${escapeHtml(acc.name)}</button>`;
  }

  function wireDyn() {
    dyn.querySelectorAll('[data-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const field = btn.getAttribute('data-pick');
        const value = btn.getAttribute('data-value') || null;
        if (field === 'categoryId') model.taxable = null;
        model[field] = value;
        renderDyn();
        updatePreview();
      });
    });
    const taxableInput = dyn.querySelector('[data-field="taxable"]');
    if (taxableInput) {
      taxableInput.addEventListener('change', () => {
        model.taxable = taxableInput.checked;
        updatePreview();
      });
    }
    dyn.querySelectorAll('[data-field="qty"]').forEach((input) => {
      input.addEventListener('input', () => {
        model.qty = Number(String(input.value).replace(',', '.')) || 0;
        const asset = assets.find((a) => a.id === model.assetId);
        if (asset && model.qty > 0 && !amountInputEl.value.trim()) {
          const value = Math.round(model.qty * asset.price);
          amountInputEl.value = amountInput(value);
          model.amount = value;
        }
        updatePreview();
      });
    });
    updatePreview();
  }

  function updatePreview() {
    const preview = dyn.querySelector('[data-preview]');
    const amount = parseAmountToCents(amountInputEl.value) || 0;
    if (model.type === TYPE.INCOME && preview) {
      if (!amount) {
        preview.innerHTML = '';
      } else {
        const cat = state.categories.find((c) => c.id === model.categoryId);
        const taxable = model.taxable === null ? !!cat?.taxable : !!model.taxable;
        if (!state.settings.taxEnabled || !taxable) {
          preview.innerHTML = `<span class="preview__line">Резерв не применяется</span><span class="preview__line">В конверты: <b>${escapeHtml(money(amount))}</b></span>`;
        } else {
          const p = previewAllocation(state, amount, model.categoryId);
          preview.innerHTML = `
            <span class="preview__line">Налоговый резерв ${state.settings.taxRate}%: <b>${escapeHtml(money(p.tax))}</b></span>
            <span class="preview__line">В конверты: <b>${escapeHtml(money(p.base))}</b></span>`;
        }
      }
    }
    if ([TYPE.CRYPTO_BUY, TYPE.CRYPTO_SELL, TYPE.CRYPTO_SPEND].includes(model.type)) {
      const amount2 = parseAmountToCents(amountInputEl.value) || 0;
      const label = amountLabel;
      label.textContent = model.type === TYPE.CRYPTO_SPEND ? 'Стоимость траты' : 'Сумма в деньгах';
      if (amount2 >= 0) amountLabel.title = '';
    }
  }

  root.querySelector('[data-types]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    model.type = btn.getAttribute('data-type');
    root.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('is-active', b === btn));
    amountLabel.textContent = [TYPE.CRYPTO_BUY, TYPE.CRYPTO_SELL].includes(model.type) ? 'Сумма в деньгах' : model.type === TYPE.CRYPTO_SPEND ? 'Стоимость траты' : 'Сумма';
    if (model.type === TYPE.INCOME || model.type === TYPE.EXPENSE || model.type === TYPE.REFUND) {
      model.envelopeId = null;
      const kind = model.type === TYPE.INCOME ? 'income' : 'expense';
      const pool = state.categories.filter((c) => c.kind === kind);
      model.categoryId = pool[0]?.id || null;
      model.taxable = null;
    }
    renderDyn();
  });

  amountInputEl.addEventListener('input', updatePreview);

  const saveBtn = root.querySelector('[data-save]');
  saveBtn.addEventListener('click', () => {
    if (saveBtn.disabled) return;
    const draft = {
      type: model.type,
      date: root.querySelector('[data-field="date"]').value || todayISO(),
      amount: parseAmountToCents(amountInputEl.value) ?? -1,
      accountId: model.accountId,
      toAccountId: model.toAccountId,
      categoryId: model.categoryId,
      envelopeId: model.envelopeId,
      toEnvelopeId: model.toEnvelopeId,
      assetId: model.assetId,
      qty: model.qty,
      comment: root.querySelector('[data-field="comment"]').value,
      taxable: model.taxable,
      reserved: model.reserved,
    };

    if ([TYPE.CRYPTO_BUY, TYPE.CRYPTO_SELL, TYPE.CRYPTO_SPEND].includes(model.type)) {
      if (!draft.amount || draft.amount < 0) {
        const asset = assets.find((a) => a.id === model.assetId);
        draft.amount = asset ? Math.round((Number(draft.qty) || 0) * asset.price) : 0;
      }
    }
    if (model.type === TYPE.ENV_TRANSFER) draft.amount = parseAmountToCents(amountInputEl.value) ?? -1;

    const prepared = prepareTransaction(state, { ...draft, id: tx?.id || 'tmp' }, tx);
    const errors = validateTransaction(state, prepared);
    if (draft.amount < 0 && model.type !== TYPE.ADJUSTMENT) errors.unshift('Введите сумму');
    if (errors.length) {
      errorEl.hidden = false;
      errorEl.textContent = errors[0];
      return;
    }

    try {
      // защита от двойного тапа: пока идёт сохранение, кнопка недоступна
      saveBtn.disabled = true;
      if (isEdit) {
        store.updateTransaction(tx.id, draft);
        toast('Операция обновлена');
      } else {
        store.addTransaction(draft);
        toast('Операция сохранена');
      }
      closeLayer();
    } catch (err) {
      saveBtn.disabled = false;
      errorEl.hidden = false;
      errorEl.textContent = err.message || 'Не удалось сохранить операцию';
    }
  });

  renderDyn();
  if (!isEdit && window.matchMedia('(min-width: 720px)').matches) {
    amountInputEl.focus();
    amountInputEl.select();
  }
}

function typeBtn(type, active) {
  return `<button type="button" class="type-btn ${type === active ? 'is-active' : ''}" role="radio" aria-checked="${type === active}" data-type="${type}">
    ${icon(TYPE_ICON[type], 16)}<span>${escapeHtml(TYPE_SHORT[type])}</span>
  </button>`;
}

/* ─────────────────────────── просмотр операции ─────────────────────────── */

export function openTxDetail(id) {
  const state = store.get();
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;

  const rows = [];
  const add = (label, value) => rows.push(`<div class="detail-row"><span>${label}</span><b>${value}</b></div>`);

  add('Тип', escapeHtml(TYPE_LABELS[tx.type]));
  add('Сумма', escapeHtml(tx.type === TYPE.ADJUSTMENT ? money(tx.amount, { signed: true }) : money(tx.amount)));
  add('Дата', escapeHtml(tx.date.split('-').reverse().join('.')));
  if (tx.accountId) add('Счёт', escapeHtml(accountName(state, tx.accountId)));
  if (tx.toAccountId) add('На счёт', escapeHtml(accountName(state, tx.toAccountId)));
  if (tx.categoryId) add('Категория', escapeHtml(state.categories.find((c) => c.id === tx.categoryId)?.name || '—'));
  if (tx.envelopeId) add('Конверт', escapeHtml(state.envelopes.find((e) => e.id === tx.envelopeId)?.name || '—'));
  if (tx.toEnvelopeId) add('В конверт', escapeHtml(state.envelopes.find((e) => e.id === tx.toEnvelopeId)?.name || '—'));
  if (tx.qty) add('Количество', `${escapeHtml(qtyFmt(tx.qty))} шт.`);
  if (tx.type === TYPE.INCOME) {
    add('Налоговый резерв', tx.taxAccrued > 0 ? `${escapeHtml(money(tx.taxAccrued))}${tx.reserved ? ' · зарезервировано' : ' · ждёт подтверждения'}` : 'не применяется');
    if (tx.alloc) {
      add(
        'Распределение',
        escapeHtml(
          state.envelopes
            .filter((e) => tx.alloc[e.id] !== undefined)
            .map((e) => `${e.name}: ${money(tx.alloc[e.id], { bare: true })}`)
            .join(' · '),
        ),
      );
    }
  }
  if (tx.comment) add('Комментарий', escapeHtml(tx.comment));

  const root = openSheet({
    title: txTitle(state, tx),
    subtitle: escapeHtml(txSub(state, tx)),
    body: `<div class="detail">${rows.join('')}</div>`,
    footer: `<div class="footer-actions">
      <button class="btn btn--ghost" data-act-edit>${icon('edit', 16)}Изменить</button>
      <button class="btn btn--danger-ghost" data-act-delete>${icon('trash', 16)}Удалить</button>
    </div>`,
  });

  root.querySelector('[data-act-edit]').addEventListener('click', () => {
    closeLayer();
    setTimeout(() => openTxForm({ tx }), 120);
  });

  root.querySelector('[data-act-delete]').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Удалить операцию?',
      text: `${escapeHtml(txTitle(state, tx))} на ${escapeHtml(money(tx.amount))}. Балансы и конверты пересчитаются автоматически.`,
      confirmLabel: 'Удалить',
    });
    if (!ok) return;
    store.deleteTransaction(tx.id);
    closeLayer();
    toast('Операция удалена');
  });
}
