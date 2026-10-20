/** views/tax.js — налоговый резерв. */
import { money, icon, escapeHtml, emptyState, toast, fmtDate, pct, monthLabel, monthLabelCap } from '../ui.js';
import { sectionHead } from '../components.js';
import { TYPE, addMonths, monthKey, isoToday } from '../core.js';
import { store } from '../store.js';
import { chartAttr } from '../charts.js';

/** Цвет из CSS-токена: в атрибутах SVG var() не работает, нужно значение. */
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v || '').trim() || fallback;
}

export function renderTax({ state, derived }) {
  const tax = derived.tax;
  const accruals = state.transactions
    .filter((t) => t.type === TYPE.INCOME && t.taxAccrued > 0)
    .sort((a, b) => (a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : a.date < b.date ? 1 : -1));
  const payments = state.transactions.filter((t) => t.type === TYPE.TAX_PAYMENT).sort((a, b) => (a.date < b.date ? 1 : -1));

  const months = [];
  const thisMonth = monthKey(isoToday());
  for (let i = 5; i >= 0; i--) months.push(addMonths(thisMonth, -i));
  const monthRows = months.map((m) => {
    const accrued = accruals.filter((t) => monthKey(t.date) === m).reduce((s, t) => s + t.taxAccrued, 0);
    const paid = payments.filter((t) => monthKey(t.date) === m).reduce((s, t) => s + t.amount, 0);
    return { month: m, accrued, paid };
  });
  const maxMonth = Math.max(...monthRows.map((r) => Math.max(r.accrued, r.paid)), 1);

  const progress = tax.accrued > 0 ? Math.min(100, (tax.paid / tax.accrued) * 100) : 0;

  return `<div class="page">
    <section class="card card--tax">
      <header class="tax-head">
        <div>
          <span class="tax-head__label">Налоговый резерв</span>
          <h2 class="tax-head__value">${escapeHtml(money(tax.reserveAvailable))}</h2>
          <p class="tax-head__sub">Столько стоит сохранить на карте из уже начисленного</p>
        </div>
        <span class="chip chip--rate">${state.settings.taxEnabled ? `${state.settings.taxRate}%` : 'выкл'}</span>
      </header>

      <div class="tax-grid">
        <div><span>Начислено</span><b>${escapeHtml(money(tax.accrued))}</b></div>
        <div><span>Зарезервировано</span><b>${escapeHtml(money(tax.reserved))}</b></div>
        <div><span>Ещё требуется отложить</span><b class="${tax.pending > 0 ? 'warn' : ''}">${escapeHtml(money(tax.pending))}</b></div>
        <div><span>Уплачено</span><b class="pos">${escapeHtml(money(tax.paid))}</b></div>
      </div>

      <div class="progress"><div class="progress__fill" style="width:${progress.toFixed(1)}%;background:${cssVar('--chart-tax', '#4fd1a5')}"></div></div>
      <div class="tax-bar-legend"><span>уплачено ${pct(progress)}</span><span class="muted">осталось ${escapeHtml(money(tax.reserveAvailable))}</span></div>

      <div class="tax-actions">
        <button class="btn btn--primary" data-act="tax-pay">${icon('percent', 16)}Отметить уплату</button>
        ${tax.pending > 0 ? `<button class="btn btn--soft" data-act="reserve-all">Зарезервировать всё</button>` : ''}
      </div>

      <p class="card__hint">Резерв виртуальный: деньги остаются на счёте и входят в общий баланс. Мы не вычитаем налог из баланса, пока вы не отметите фактическую уплату.</p>
    </section>

    <section class="card">
      ${sectionHead('Настройки резерва', '')}
      <div class="tax-settings">
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
        <p class="hint">Какие доходы участвуют в расчёте, задаётся в категориях: «Настройки» → «Категории» → отметка у категории дохода.</p>
        <button class="btn btn--soft" data-tax-save>Сохранить</button>
      </div>
      <p class="disclaimer">${icon('info', 14)}<span>${state.settings.taxRate}% — это ваша личная настройка планирования, а не установленная законом ставка и не налоговая консультация. Уточняйте свои обязательства у специалиста.</span></p>
    </section>

    <section class="card">
      ${sectionHead('Месяцы', '')}
      <div class="chart chart--bars" ${chartAttr({
        type: 'bars',
        valuesPerItem: 2,
        height: 160,
        items: monthRows.map((r) => ({
          label: monthLabel(r.month, 'short'),
          values: [
            { value: r.accrued, color: cssVar('--chart-tax', '#4fd1a5'), name: 'Начислено' },
            { value: r.paid, color: cssVar('--chart-expense', '#5a6272'), name: 'Уплачено' },
          ],
        })),
      })}></div>
      <div class="month-table">
        ${monthRows
          .slice()
          .reverse()
          .map(
            (r) => `<div class="month-row">
              <span>${escapeHtml(monthLabelCap(r.month))}</span>
              <span class="muted">+${escapeHtml(money(r.accrued, { bare: true }))}</span>
              <span class="pos">−${escapeHtml(money(r.paid, { bare: true }))}</span>
            </div>`,
          )
          .join('')}
      </div>
    </section>

    ${sectionHead('Начисления', accruals.length ? `<span class="muted small">${accruals.length}</span>` : '')}
    ${
      accruals.length
        ? `<div class="card card--flush"><div class="accrual-list">
            ${accruals
              .slice(0, 50)
              .map((t) => {
                const reserved = t.reserved !== false;
                return `<div class="accrual">
                  <div class="accrual__main">
                    <span class="accrual__amount">${escapeHtml(money(t.taxAccrued))}</span>
                    <span class="accrual__meta">${escapeHtml(fmtDate(t.date, 'full'))} · доход ${escapeHtml(money(t.amount))}${t.taxRate ? ` · ${t.taxRate}%` : ''}</span>
                  </div>
                  <button class="status-toggle ${reserved ? 'is-on' : ''}" data-act="toggle-reserved" data-id="${escapeHtml(t.id)}">
                    ${icon(reserved ? 'check' : 'dots', 13)}${reserved ? 'в резерве' : 'ожидает'}
                  </button>
                </div>`;
              })
              .join('')}
          </div></div>`
        : emptyState({ iconName: 'percent', title: 'Начислений пока нет', text: 'Резерв появляется автоматически при добавлении дохода из категории с включённым резервом.' })
    }

    ${sectionHead('Уплаты', payments.length ? `<span class="muted small">${payments.length}</span>` : '')}
    ${
      payments.length
        ? `<div class="card card--flush"><div class="accrual-list">
            ${payments
              .slice(0, 30)
              .map(
                (t) => `<div class="accrual">
                  <div class="accrual__main">
                    <span class="accrual__amount pos">${escapeHtml(money(t.amount))}</span>
                    <span class="accrual__meta">${escapeHtml(fmtDate(t.date, 'full'))}${t.comment ? ` · ${escapeHtml(t.comment)}` : ''}</span>
                  </div>
                  <button class="link-btn" data-act="tx-open" data-id="${escapeHtml(t.id)}">Открыть${icon('chevron', 13)}</button>
                </div>`,
              )
              .join('')}
          </div></div>`
        : `<div class="chart-empty">Отметьте уплату налога — операция уменьшит баланс счёта и закроет часть резерва.</div>`
    }
  </div>`;
}

export function mountTax(root) {
  const rateEl = root.querySelector('[data-rate]');
  const enabledEl = root.querySelector('[data-tax-enabled]');
  const autoEl = root.querySelector('[data-auto-reserve]');
  const save = root.querySelector('[data-tax-save]');
  if (!save) return;
  save.addEventListener('click', () => {
    const rate = Number(rateEl.value);
    if (!(rate >= 0 && rate <= 100)) return toast('Процент должен быть от 0 до 100', 'error');
    store.updateSettings({ taxRate: rate, taxEnabled: enabledEl.checked, autoReserve: autoEl.checked });
    toast('Настройки резерва сохранены');
  });
}
