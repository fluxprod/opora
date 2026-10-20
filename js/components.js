/** components.js — повторно используемые части интерфейса. */
import { TYPE, TYPE_LABELS } from './core.js';
import { money, icon, escapeHtml, fmtDate, categoryIcon, ACCOUNT_ICONS, pct, currencySymbol } from './ui.js';

export function heroAmount(cents) {
  const full = money(cents, { bare: true });
  const sym = currencySymbol();
  // у доллара знак перед числом, у Br и ₽ — после
  if (sym === '$') return `<span class="hero__cur">${escapeHtml(sym)}</span>${escapeHtml(full)}`;
  return `${escapeHtml(full)}<span class="hero__cur">${escapeHtml(sym)}</span>`;
}

export function sectionHead(title, right = '', sub = '') {
  return `<div class="section-head">
    <div>
      <h2 class="section-head__title">${escapeHtml(title)}</h2>
      ${sub ? `<p class="section-head__sub">${sub}</p>` : ''}
    </div>
    ${right ? `<div class="section-head__right">${right}</div>` : ''}
  </div>`;
}

export function accountById(state, id) {
  return state.accounts.find((a) => a.id === id) || null;
}

export function categoryById(state, id) {
  return state.categories.find((c) => c.id === id) || null;
}

export function envelopeById(state, id) {
  return state.envelopes.find((e) => e.id === id) || null;
}

export function accountName(state, id) {
  return accountById(state, id)?.name || 'Счёт';
}

export function txTitle(state, tx) {
  const cat = categoryById(state, tx.categoryId);
  switch (tx.type) {
    case TYPE.INCOME:
      return cat ? cat.name : 'Доход';
    case TYPE.EXPENSE:
      return cat ? cat.name : 'Расход';
    case TYPE.REFUND:
      return cat ? `Возврат: ${cat.name}` : 'Возврат';
    case TYPE.TRANSFER:
      return `${accountName(state, tx.accountId)} → ${accountName(state, tx.toAccountId)}`;
    case TYPE.ENV_TRANSFER: {
      const a = envelopeById(state, tx.envelopeId);
      const b = envelopeById(state, tx.toEnvelopeId);
      return `${a ? a.name : 'Конверт'} → ${b ? b.name : 'Конверт'}`;
    }
    case TYPE.CRYPTO_BUY:
    case TYPE.CRYPTO_SELL:
    case TYPE.CRYPTO_SPEND: {
      const asset = (state.accounts.find((a) => a.id === 'acc_crypto')?.assets || []).find((x) => x.id === tx.assetId);
      return asset ? `${asset.symbol} · ${txTitleCrypto(tx.type)}` : TYPE_LABELS[tx.type];
    }
    case TYPE.TAX_PAYMENT:
      return 'Уплата налога';
    case TYPE.ADJUSTMENT:
      return 'Корректировка баланса';
    default:
      return TYPE_LABELS[tx.type] || 'Операция';
  }
}

function txTitleCrypto(type) {
  return type === TYPE.CRYPTO_BUY ? 'покупка' : type === TYPE.CRYPTO_SELL ? 'продажа' : 'трата';
}

export function txIcon(state, tx) {
  switch (tx.type) {
    case TYPE.INCOME:
      return categoryIcon(categoryById(state, tx.categoryId)) || 'in';
    case TYPE.EXPENSE:
    case TYPE.REFUND:
      return categoryIcon(categoryById(state, tx.categoryId)) || 'out';
    case TYPE.TRANSFER:
      return 'swap';
    case TYPE.ENV_TRANSFER:
      return 'wallet';
    case TYPE.CRYPTO_BUY:
    case TYPE.CRYPTO_SELL:
    case TYPE.CRYPTO_SPEND:
      return 'coins';
    case TYPE.TAX_PAYMENT:
      return 'percent';
    case TYPE.ADJUSTMENT:
      return 'edit';
    default:
      return 'dots';
  }
}

export function txTone(tx) {
  if (tx.type === TYPE.INCOME) return 'pos';
  if (tx.type === TYPE.REFUND) return 'pos';
  if (tx.type === TYPE.EXPENSE) return 'neg';
  if (tx.type === TYPE.CRYPTO_SPEND) return 'neg';
  return 'neutral';
}

export function txSub(state, tx) {
  const parts = [];
  if (tx.type === TYPE.TRANSFER) parts.push('Перевод');
  else if (tx.type === TYPE.ENV_TRANSFER) parts.push('Между конвертами');
  else parts.push(accountName(state, tx.accountId));
  if (tx.type === TYPE.CRYPTO_BUY || tx.type === TYPE.CRYPTO_SELL || tx.type === TYPE.CRYPTO_SPEND) {
    parts.push(`${Number(tx.qty)} шт.`);
  }
  if (tx.envelopeId && tx.type !== TYPE.ENV_TRANSFER) {
    const env = envelopeById(state, tx.envelopeId);
    if (env) parts.push(env.name);
  }
  const base = parts.filter(Boolean).join(', ');
  return tx.comment ? `${base} — ${tx.comment}` : base;
}

export function txAmountText(tx) {
  if (tx.type === TYPE.CRYPTO_BUY || tx.type === TYPE.CRYPTO_SELL || tx.type === TYPE.CRYPTO_SPEND) {
    return tx.amount ? money(tx.amount) : `${tx.qty} шт.`;
  }
  if (tx.type === TYPE.INCOME || tx.type === TYPE.REFUND) return `+${money(tx.amount)}`;
  if (tx.type === TYPE.EXPENSE || tx.type === TYPE.TAX_PAYMENT) return `−${money(tx.amount)}`;
  if (tx.type === TYPE.ADJUSTMENT) return money(tx.amount, { signed: true });
  return money(tx.amount);
}

export function txRow(state, tx, opts = {}) {
  const tone = txTone(tx);
  const reservedBadge =
    tx.type === TYPE.INCOME && tx.taxAccrued > 0
      ? `<span class="chip chip--tax" title="Налоговый резерв по этой операции">резерв ${escapeHtml(money(tx.taxAccrued, { bare: true }))}</span>`
      : '';

  return `<button class="tx" data-act="tx-open" data-id="${escapeHtml(tx.id)}">
    <span class="tx__icon tx__icon--${tone}">${icon(txIcon(state, tx), 18)}</span>
    <span class="tx__main">
      <span class="tx__title">${escapeHtml(txTitle(state, tx))}</span>
      <span class="tx__sub">${escapeHtml(txSub(state, tx))}</span>
    </span>
    <span class="tx__side">
      <span class="tx__amount tx__amount--${tone}">${escapeHtml(txAmountText(tx))}</span>
      ${opts.hideDate && !reservedBadge ? '' : `<span class="tx__date">${opts.hideDate ? '' : escapeHtml(opts.dateLabel || fmtDate(tx.date, 'full'))}${reservedBadge}</span>`}
    </span>
  </button>`;
}

export function accountCard(acc) {
  return `<button class="acc-card" data-act="account-open" data-id="${escapeHtml(acc.id)}">
    <span class="acc-card__icon">${icon(ACCOUNT_ICONS[acc.kind] || 'wallet', 18)}</span>
    <span class="acc-card__text">
      <span class="acc-card__name">${escapeHtml(acc.name)}</span>
    </span>
    <span class="acc-card__amount">${escapeHtml(money(acc.balance))}</span>
  </button>`;
}

export function envelopeRow(env, opts = {}) {
  const goal = env.goal || 0;
  const total = opts.total || 0;
  const ratio = goal > 0 ? Math.max(0, Math.min(1, env.balance / goal)) : total > 0 ? Math.max(0, Math.min(1, env.balance / total)) : 0;
  const share = env.share;
  return `<div class="env-row">
    <span class="env-row__icon" style="--env-color:${escapeHtml(env.color)}">${icon(env.icon || 'wallet', 16)}</span>
    <div class="env-row__body">
      <div class="env-row__top">
        <span class="env-row__name">${escapeHtml(env.name)}</span>
        <span class="env-row__amount">${escapeHtml(money(env.balance))}</span>
      </div>
      <div class="env-row__bar"><div class="env-row__fill" style="width:${(ratio * 100).toFixed(1)}%;background:${escapeHtml(env.color)}"></div></div>
      <div class="env-row__meta">
        <span>${share === null ? 'остаток дохода' : `доля ${pct(share, 2)}`}</span>
        ${goal > 0 ? `<span>цель ${escapeHtml(money(goal))} · ${pct(ratio * 100)}</span>` : `<span class="muted">часть всех конвертов · ${pct(ratio * 100)}</span>`}
      </div>
    </div>
  </div>`;
}

export function kpi(label, value, sub = '', tone = '') {
  return `<div class="kpi">
    <span class="kpi__label">${escapeHtml(label)}</span>
    <span class="kpi__value ${tone}">${escapeHtml(value)}</span>
    ${sub ? `<span class="kpi__sub">${sub}</span>` : ''}
  </div>`;
}

export function progressBar(value, total, color = '#4690FF') {
  const ratio = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return `<div class="progress"><div class="progress__fill" style="width:${(ratio * 100).toFixed(1)}%;background:${color}"></div></div>`;
}

export function timeAgo(iso) {
  if (!iso) return 'не обновлялась';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 30) return `${days} дн назад`;
  return fmtDate(iso.slice(0, 10), 'full');
}
