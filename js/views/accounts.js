/** views/accounts.js — счета, детали счёта, криптоактивы. */
import { money, icon, escapeHtml, emptyState, openSheet, closeLayer, confirmAction, toast, amountInput, qtyFmt, fmtDate } from '../ui.js';
import { txRow, accountCard, sectionHead, timeAgo, progressBar } from '../components.js';
import { TYPE, summarize, monthKey, monthRange, isoToday, parseAmountToCents } from '../core.js';
import { store } from '../store.js';
import { makeId } from '../schema.js';

function monthStats(state, accountId) {
  const range = monthRange(monthKey(isoToday()));
  const list = state.transactions.filter((t) => t.date >= range.from && t.date <= range.to && (t.accountId === accountId || t.toAccountId === accountId));
  const sum = summarize(state, list);
  let inflow = sum.income;
  let outflow = sum.expenses;
  for (const t of list) {
    if (t.type === TYPE.TRANSFER) {
      if (t.toAccountId === accountId) inflow += t.amount;
      if (t.accountId === accountId) outflow += t.amount;
    }
    if (t.type === TYPE.CRYPTO_SELL && t.accountId === accountId) inflow += t.amount;
    if (t.type === TYPE.CRYPTO_BUY && t.accountId === accountId) outflow += t.amount;
    if (t.type === TYPE.TAX_PAYMENT && t.accountId === accountId) outflow += t.amount;
  }
  return { inflow, outflow };
}

export function renderAccounts({ state, derived }) {
  const hideCrypto = Boolean(state.settings.hideCrypto);
  const active = derived.accounts.filter((a) => !a.archived && !(hideCrypto && a.isCrypto));
  const archived = derived.accounts.filter((a) => a.archived && !(hideCrypto && a.isCrypto));
  const crypto = hideCrypto ? null : derived.accounts.find((a) => a.isCrypto);

  return `<div class="page">
    <section class="card card--summary">
      <div class="summary-line">
        <div>
          <span class="summary-line__label">Деньги на карте и в наличных</span>
          <b class="summary-line__value">${escapeHtml(money(derived.fiatTotal))}</b>
        </div>
        ${
          hideCrypto
            ? ''
            : `<div class="summary-line__crypto">
          <span>Криптовалюта</span>
          <b>${escapeHtml(money(derived.cryptoValue))}</b>
        </div>`
        }
      </div>
      <div class="summary-line__foot">
        <span>${hideCrypto ? 'Всего' : 'Всего с криптой'}</span>
        <b>${escapeHtml(money(hideCrypto ? derived.fiatTotal : derived.total))}</b>
      </div>
    </section>

    ${sectionHead(
      'Счета',
      `<button class="btn btn--soft btn--sm" data-act="account-new">${icon('plus', 15)}Добавить</button>`,
    )}
    <div class="acc-list">
      ${active
        .map((a) => {
          const st = a.isCrypto ? null : monthStats(state, a.id);
          const assetsCount = a.isCrypto ? derived.cryptoAssets.filter((x) => x.accountId === a.id && x.qty > 0).length : 0;
          const word = assetsCount === 1 ? 'актив' : assetsCount > 1 && assetsCount < 5 ? 'актива' : 'активов';
          return `<button class="acc-row" data-act="account-open" data-id="${escapeHtml(a.id)}">
          <span class="acc-row__icon">${icon(a.kind === 'card' ? 'card' : a.kind === 'cash' ? 'cash' : 'coins', 20)}</span>
          <span class="acc-row__main">
            <span class="acc-row__name">${escapeHtml(a.name)}</span>
            <span class="acc-row__meta">${
              a.isCrypto
                ? `${assetsCount} ${word}`
                : st
                  ? `+${escapeHtml(money(st.inflow, { bare: true }))} / −${escapeHtml(money(st.outflow, { bare: true }))} за месяц`
                  : ''
            }</span>
          </span>
          <span class="acc-row__side">
            <span class="acc-row__amount">${escapeHtml(money(a.balance))}</span>
            <span class="acc-row__open">${icon('chevron', 14)}</span>
          </span>
        </button>`;
        })
        .join('')}
    </div>

    ${archived.length ? `<div class="note note--soft">${icon('info', 16)}<span>Скрытые счёта: ${archived.map((a) => escapeHtml(a.name)).join(', ')}. Их операции учитываются в статистике.</span></div>` : ''}

    <div class="note note--soft">${icon('lock', 16)}<span>Данные хранятся только в этом браузере. Резервная копия — в настройках.</span></div>
  </div>`;
}

export function renderAccount({ state, derived, params }) {
  const acc = derived.accounts.find((a) => a.id === params.id);
  if (!acc) return emptyState({ title: 'Счёт не найден', text: 'Возможно, он был удалён.', action: `<button class="btn btn--soft" data-act="go" data-to="accounts">К счетам</button>` });

  if (acc.isCrypto) return renderCryptoAccount({ state, derived, acc });

  const stats = monthStats(state, acc.id);
  const txs = state.transactions.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id).sort((a, b) => (a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : a.date < b.date ? 1 : -1));
  const groups = new Map();
  for (const t of txs) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }

  return `<div class="page">
    <button class="back-link" data-act="go" data-to="accounts">${icon('back', 15)}Все счета</button>

    <section class="card card--account">
      <div class="acc-detail__head">
        <span class="acc-detail__icon">${icon(acc.kind === 'card' ? 'card' : 'cash', 20)}</span>
        <div>
          <span class="acc-detail__label">${acc.kind === 'card' ? 'Банковская карта' : 'Наличные'}</span>
          <h2 class="acc-detail__name">${escapeHtml(acc.name)}</h2>
        </div>
        <button class="icon-btn" data-act="account-edit" data-id="${escapeHtml(acc.id)}" aria-label="Настройки счёта">${icon('settings', 17)}</button>
      </div>
      <div class="acc-detail__balance">${escapeHtml(money(acc.balance))}</div>
      <div class="acc-detail__stats">
        <div><span>Получено за месяц</span><b class="pos">+${escapeHtml(money(stats.inflow, { bare: true }))}</b></div>
        <div><span>Потрачено за месяц</span><b>−${escapeHtml(money(stats.outflow, { bare: true }))}</b></div>
        <div><span>Операций всего</span><b>${txs.length}</b></div>
      </div>
      <div class="acc-actions">
        <button class="quick-act" data-act="add-preset" data-type="expense" data-account="${escapeHtml(acc.id)}">${icon('out', 16)}Расход</button>
        <button class="quick-act" data-act="add-preset" data-type="income" data-account="${escapeHtml(acc.id)}">${icon('in', 16)}Доход</button>
        <button class="quick-act" data-act="add-preset" data-type="transfer" data-account="${escapeHtml(acc.id)}">${icon('swap', 16)}Перевод</button>
        <button class="quick-act" data-act="add-preset" data-type="adjustment" data-account="${escapeHtml(acc.id)}">${icon('edit', 16)}Корректировка</button>
      </div>
    </section>

    ${sectionHead('История счёта', txs.length ? `<span class="muted small">${txs.length} операций</span>` : '')}
    ${
      txs.length
        ? [...groups.entries()]
            .map(
              ([date, list]) => `<div class="tx-group">
                <div class="tx-group__head"><span>${escapeHtml(fmtDate(date, 'dayhead'))}</span></div>
                <div class="card card--flush"><div class="tx-list">${list.map((t) => txRow(state, t)).join('')}</div></div>
              </div>`,
            )
            .join('')
        : emptyState({ iconName: 'wallet', title: 'Операций пока нет', text: 'Добавьте доход или расход — история появится здесь.', action: `<button class="btn btn--primary" data-act="add">${icon('plus', 16)}Добавить</button>` })
    }
  </div>`;
}

function renderCryptoAccount({ state, derived, acc }) {
  const assets = derived.cryptoAssets.filter((a) => a.accountId === acc.id);
  const priceMissing = assets.filter((a) => a.qty > 0 && !a.price);
  const txs = state.transactions.filter((t) => ['crypto_buy', 'crypto_sell', 'crypto_spend'].includes(t.type)).sort((a, b) => (a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : a.date < b.date ? 1 : -1));

  return `<div class="page">
    <button class="back-link" data-act="go" data-to="accounts">${icon('back', 15)}Все счета</button>

    <section class="card card--account">
      <div class="acc-detail__head">
        <span class="acc-detail__icon acc-detail__icon--crypto">${icon('coins', 20)}</span>
        <div>
          <span class="acc-detail__label">Криптосчёт</span>
          <h2 class="acc-detail__name">${escapeHtml(acc.name)}</h2>
        </div>
        <button class="icon-btn" data-act="account-edit" data-id="${escapeHtml(acc.id)}" aria-label="Настройки счёта">${icon('settings', 17)}</button>
      </div>
      <div class="acc-detail__balance">${escapeHtml(money(acc.balance))}</div>
      <p class="card__hint">Стоимость считается по курсу, который вы указали вручную. Курсы не загружаются автоматически и не требуют платных сервисов.</p>
      <div class="acc-actions">
        <button class="quick-act" data-act="add-preset" data-type="crypto_buy">${icon('in', 16)}Доход</button>
        <button class="quick-act" data-act="add-preset" data-type="crypto_spend">${icon('out', 16)}Расход</button>
        <button class="quick-act" data-act="add-preset" data-type="adjustment">${icon('swap', 16)}Корректировка</button>
        <button class="quick-act" data-act="asset-new">${icon('plus', 16)}Актив</button>
      </div>
    </section>

    ${priceMissing.length ? `<div class="note note--warn">${icon('info', 16)}<span>У активов ${priceMissing.map((a) => a.symbol).join(', ')} не указан курс — они не влияют на общую стоимость.</span></div>` : ''}

    ${sectionHead('Активы', `<span class="muted small">${assets.length}</span>`)}
    ${
      assets.length
        ? `<div class="asset-list">
          ${assets
            .map(
              (a) => `<div class="asset">
              <div class="asset__top">
                <span class="asset__badge">${escapeHtml(a.symbol.slice(0, 4))}</span>
                <div class="asset__names">
                  <span class="asset__symbol">${escapeHtml(a.symbol)}</span>
                  <span class="asset__name">${escapeHtml(a.name)}</span>
                </div>
                <div class="asset__value">
                  <b>${escapeHtml(money(a.value))}</b>
                  <span>${escapeHtml(qtyFmt(a.qty))} × ${escapeHtml(money(a.price))}</span>
                </div>
              </div>
              <div class="asset__foot">
                <span class="muted">Курс обновлён: ${escapeHtml(timeAgo(a.updatedAt))}</span>
                <button class="link-btn" data-act="asset-edit" data-id="${escapeHtml(a.id)}">Изменить${icon('chevron', 13)}</button>
              </div>
            </div>`,
            )
            .join('')}
        </div>`
        : emptyState({
            iconName: 'coins',
            title: 'Активов пока нет',
            text: 'Добавьте монету, укажите количество и текущий курс — приложение посчитает стоимость в основной валюте.',
            action: `<button class="btn btn--primary" data-act="asset-new">${icon('plus', 16)}Добавить актив</button>`,
          })
    }

    ${sectionHead('Операции с криптой', `<span class="muted small">не входят в обычные расходы</span>`)}
    ${
      txs.length
        ? `<div class="card card--flush"><div class="tx-list">${txs.map((t) => txRow(state, t)).join('')}</div></div>`
        : `<div class="chart-empty">Покупки, продажи и траты крипты будут здесь. Они не смешиваются с расходами с карты и наличными.</div>`
    }
  </div>`;
}

/* ─────────────────────────── формы ─────────────────────────── */

export function openAccountForm(accountId = null) {
  const state = store.get();
  const acc = accountId ? state.accounts.find((a) => a.id === accountId) : null;
  const isNew = !acc;
  const isCrypto = acc?.kind === 'crypto';
  const used = acc ? state.transactions.some((t) => t.accountId === acc.id || t.toAccountId === acc.id) : false;

  const root = openSheet({
    title: isNew ? 'Новый счёт' : 'Счёт',
    subtitle: isNew ? 'Карта, наличные или крипто-портфель' : undefined,
    body: `<div class="form">
      <label class="field"><span class="field__label">Название</span>
        <input class="input" data-f="name" value="${escapeHtml(acc?.name || '')}" placeholder="Например, Карта Тинькофф" data-autofocus maxlength="40" />
      </label>
      ${
        isNew
          ? `<div class="field"><span class="field__label">Тип</span>
              <div class="chip-row" data-kind-row>
                <button type="button" class="chip is-active" data-kind="card">Карта</button>
                <button type="button" class="chip" data-kind="cash">Наличные</button>
                <button type="button" class="chip" data-kind="crypto">Криптовалюта</button>
              </div>
            </div>`
          : ''
      }
      ${
        isCrypto
          ? `<p class="hint">Стоимость криптосчёта складывается из активов и их курсов.</p>`
          : `<label class="field"><span class="field__label">Стартовый баланс</span>
              <input class="input" data-f="opening" inputmode="decimal" value="${acc ? escapeHtml(amountInput(acc.opening)) : ''}" placeholder="0" />
              <span class="field__hint">Деньги, которые уже были на счёте до начала учёта.</span>
            </label>`
      }
      ${
        acc
          ? `<label class="switch">
              <input type="checkbox" data-f="archived" ${acc.archived ? 'checked' : ''} />
              <span class="switch__track"><span class="switch__dot"></span></span>
              <span class="switch__text">Скрыть счёт из списка</span>
            </label>`
          : ''
      }
    </div>`,
    footer: `<div class="footer-actions">
      ${acc && !used ? `<button class="btn btn--danger-ghost" data-delete>${icon('trash', 16)}Удалить</button>` : `<span></span>`}
      <button class="btn btn--primary" data-save>Сохранить</button>
    </div>`,
  });

  let kind = acc?.kind || 'card';
  root.querySelectorAll('[data-kind]').forEach((btn) => btn.addEventListener('click', () => {
    kind = btn.getAttribute('data-kind');
    root.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('is-active', b === btn));
  }));

  root.querySelector('[data-save]').addEventListener('click', () => {
    const name = root.querySelector('[data-f="name"]').value.trim();
    if (!name) return toast('Введите название счёта', 'error');
    const opening = acc ? parseAmountToCents(root.querySelector('[data-f="opening"]').value) ?? 0 : 0;
    try {
      store.saveAccount({
        id: acc?.id || makeId('acc'),
        kind: acc?.kind || kind,
        name,
        opening,
        archived: acc ? root.querySelector('[data-f="archived"]').checked : false,
        assets: acc?.assets || [],
        color: acc?.color,
      });
      closeLayer();
      toast(isNew ? 'Счёт добавлен' : 'Счёт обновлён');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  const del = root.querySelector('[data-delete]');
  if (del) del.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Удалить счёт?', text: 'Операций по этому счёту нет, поэтому удаление безопасно.', confirmLabel: 'Удалить' });
    if (!ok) return;
    try {
      store.deleteAccount(acc.id);
      closeLayer();
      window.__latte?.navigate('accounts');
      toast('Счёт удалён');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

export function openAssetForm(assetId = null, accountId = 'acc_crypto') {
  const state = store.get();
  const derived = window.__latte?.derived;
  const acc = state.accounts.find((a) => a.id === accountId);
  const asset = assetId ? (acc?.assets || []).find((a) => a.id === assetId) : null;
  const currentQty = asset ? (derived?.cryptoAssets.find((a) => a.id === asset.id)?.qty ?? asset.initialQty) : 0;
  const used = asset ? state.transactions.some((t) => t.assetId === asset.id) : false;

  const root = openSheet({
    title: asset ? 'Актив' : 'Новый актив',
    subtitle: asset ? escapeHtml(asset.name) : 'Монета или токен',
    body: `<div class="form">
      <div class="two-col">
        <label class="field"><span class="field__label">Тикер</span>
          <input class="input" data-f="symbol" value="${escapeHtml(asset?.symbol || '')}" placeholder="BTC" maxlength="12" data-autofocus style="text-transform:uppercase" />
        </label>
        <label class="field"><span class="field__label">Название</span>
          <input class="input" data-f="name" value="${escapeHtml(asset?.name || '')}" placeholder="Bitcoin" maxlength="40" />
        </label>
      </div>
      <label class="field"><span class="field__label">Количество</span>
        <input class="input" data-f="qty" inputmode="decimal" value="${currentQty ? escapeHtml(qtyFmt(currentQty)) : ''}" placeholder="0" />
        ${used ? `<span class="field__hint">Сейчас в наличии. Если поправить — скорректируется начальное количество, операции останутся в истории.</span>` : ''}
      </label>
      <label class="field"><span class="field__label">Курс за 1 единицу</span>
        <input class="input" data-f="price" inputmode="decimal" value="${asset ? escapeHtml(amountInput(asset.price)) : ''}" placeholder="0" />
        <span class="field__hint">Укажите вручную в основной валюте. Автозагрузка курсов не подключена.</span>
      </label>
      <p class="asset-preview" data-preview></p>
    </div>`,
    footer: `<div class="footer-actions">
      ${asset && !used ? `<button class="btn btn--danger-ghost" data-delete>${icon('trash', 16)}Удалить</button>` : `<span></span>`}
      <button class="btn btn--primary" data-save>Сохранить</button>
    </div>`,
  });

  const qtyEl = root.querySelector('[data-f="qty"]');
  const priceEl = root.querySelector('[data-f="price"]');
  const preview = root.querySelector('[data-preview]');
  const updatePreview = () => {
    const q = Number(String(qtyEl.value).replace(',', '.')) || 0;
    const p = parseAmountToCents(priceEl.value) || 0;
    preview.textContent = q && p ? `Стоимость: ${money(Math.round(q * p))}` : '';
  };
  qtyEl.addEventListener('input', updatePreview);
  priceEl.addEventListener('input', updatePreview);
  updatePreview();

  root.querySelector('[data-save]').addEventListener('click', () => {
    const symbol = root.querySelector('[data-f="symbol"]').value.trim().toUpperCase();
    const name = root.querySelector('[data-f="name"]').value.trim();
    if (!symbol) return toast('Укажите тикер, например BTC', 'error');
    const qty = Number(String(qtyEl.value).replace(',', '.')) || 0;
    const price = parseAmountToCents(priceEl.value) || 0;
    const initialQty = asset ? (asset.initialQty || 0) + (qty - currentQty) : qty;
    try {
      store.saveAsset(accountId, {
        id: asset?.id || makeId('asset'),
        symbol,
        name: name || symbol,
        price,
        initialQty,
      });
      closeLayer();
      toast(asset ? 'Актив обновлён' : 'Актив добавлен');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  const del = root.querySelector('[data-delete]');
  if (del) del.addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'Удалить актив?', text: 'Операции по активу отсутствуют, удаление безопасно.', confirmLabel: 'Удалить' });
    if (!ok) return;
    store.deleteAsset(accountId, asset.id);
    closeLayer();
    toast('Актив удалён');
  });
}
