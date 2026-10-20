/** views/stats.js — статистика и графики на реальных данных. */
import { money, icon, escapeHtml, emptyState, monthLabel, pct } from '../ui.js';
import { getPeriod, resolveRange, periodChips } from '../period.js';
import { summarize, monthlySeries, balanceSeries, TYPE, addMonths, monthKey } from '../core.js';
import { chartAttr, chartPalette } from '../charts.js';
import { progressBar, envelopeRow } from '../components.js';

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v || '').trim() || fallback;
}

function monthsBetween(from, to, limit = 8) {
  const start = monthKey(from);
  const end = monthKey(to);
  const list = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 60) {
    list.push(cur);
    cur = addMonths(cur, 1);
    guard++;
  }
  return list.slice(-limit);
}

export function renderStats({ state, derived }) {
  const period = getPeriod();
  const range = resolveRange(period);
  const list = state.transactions.filter((t) => t.date >= range.from && t.date <= range.to);
  const sum = summarize(state, list);
  const categories = state.categories;

  const prevLenDays = Math.max(1, (new Date(range.to) - new Date(range.from)) / 86400000 + 1);
  const prevTo = new Date(new Date(range.from).getTime() - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(new Date(range.from).getTime() - prevLenDays * 86400000).toISOString().slice(0, 10);
  const prevList = state.transactions.filter((t) => t.date >= prevFrom && t.date <= prevTo);
  const prevSum = summarize(state, prevList);

  // Для месячных периодов показываем окно в 6 месяцев — так видна динамика, а не один столбик
  const chartFrom =
    period.preset === 'month' || period.preset === 'prev'
      ? `${addMonths(monthKey(range.to), -5)}-01`
      : range.from === '1900-01-01'
        ? state.transactions[0]?.date || range.to
        : range.from;
  const months = monthsBetween(chartFrom, range.to, 12);
  const series = monthlySeries(state.transactions, months);
  const balancePts = balanceSeries(state, range.from === '1900-01-01' ? (state.transactions[0]?.date || range.to) : range.from, range.to);

  const catTotals = categories
    .map((c) => ({ cat: c, value: sum.byCategory.find((x) => x.id === c.id)?.amount || 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const catTotal = catTotals.reduce((s, x) => s + x.value, 0);
  const PALETTE = chartPalette();
  const palette = (i) => PALETTE[i % PALETTE.length];
  const maxCat = catTotals.length ? catTotals[0].value : 0;
  // пончик читается до 5 сегментов; дальше — ранжированные полосы
  const useDonut = catTotals.length > 0 && catTotals.length <= 5;
  const segments = catTotals.map((x, i) => ({ label: x.cat.name, value: x.value, color: palette(i) }));

  const incomeDelta = prevSum.income > 0 ? ((sum.income - prevSum.income) / prevSum.income) * 100 : null;
  const expenseDelta = prevSum.expenses > 0 ? ((sum.expenses - prevSum.expenses) / prevSum.expenses) * 100 : null;
  const hasAnyData = state.transactions.length > 0;
  const hasPeriodData = list.length > 0;

  const taxAccruedTotal = list.reduce((s, t) => s + (t.type === TYPE.INCOME ? t.taxAccrued || 0 : 0), 0);

  const deltaBadge = (delta, invert = false) => {
    if (delta === null) return '<span class="muted">—</span>';
    const good = invert ? delta < 0 : delta > 0;
    const arrow = delta > 0 ? 'arrowUp' : 'arrowDown';
    return `<span class="delta ${good ? 'pos' : 'neg'}">${icon(arrow, 12)}${pct(Math.abs(delta))}</span>`;
  };

  return `<div class="page">
    <div class="chips-scroll">${periodChips(period.preset)}</div>
    <p class="period-caption">${escapeHtml(range.label)}</p>

    ${
      !hasAnyData
        ? emptyState({
            iconName: 'chart',
            title: 'Статистика появится после первых операций',
            text: 'Добавьте доход или расход — здесь появятся графики доходов, расходов, категорий и динамики баланса. Все расчёты строятся только на ваших данных.',
            action: `<button class="btn btn--primary" data-act="add">${icon('plus', 16)}Добавить операцию</button>`,
          })
        : `
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-card__label">Доходы</span>
          <span class="kpi-card__value pos">${escapeHtml(money(sum.income))}</span>
          <span class="kpi-card__sub">${
            incomeDelta === null
              ? '<span class="muted">прошлый период без доходов</span>'
              : `${deltaBadge(incomeDelta)}<span class="muted">к прошлому периоду</span>`
          }</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card__label">Расходы</span>
          <span class="kpi-card__value">${escapeHtml(money(sum.expenses))}</span>
          <span class="kpi-card__sub">${
            expenseDelta === null
              ? '<span class="muted">прошлый период без расходов</span>'
              : `${deltaBadge(expenseDelta, true)}<span class="muted">к прошлому периоду</span>`
          }</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card__label">Разница</span>
          <span class="kpi-card__value ${sum.net >= 0 ? 'pos' : 'neg'}">${escapeHtml(money(sum.net, { signed: true }))}</span>
          <span class="kpi-card__sub muted">доходы минус расходы</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-card__label">Налоговый резерв</span>
          <span class="kpi-card__value">${escapeHtml(money(taxAccruedTotal))}</span>
          <span class="kpi-card__sub muted">начислено за период</span>
        </div>
      </div>

      <section class="card">
        <header class="card__head">
          <div>
            <h3 class="card__title">Доходы и расходы по месяцам</h3>
            <p class="card__sub">Только реальные движения денег, без переводов</p>
          </div>
          <div class="legend">
            <span class="legend__item"><i style="background:${palette(0)}"></i>Доходы</span>
            <span class="legend__item"><i style="background:${cssVar('--chart-expense', '#5a6272')}"></i>Расходы</span>
          </div>
        </header>
        <div class="chart chart--bars" ${chartAttr({
          type: 'bars',
          valuesPerItem: 2,
          height: 200,
          items: series.map((r) => ({
            label: monthLabel(r.month, 'short'),
            values: [
              { value: r.income, color: palette(0), name: 'Доходы' },
              { value: r.expenses, color: cssVar('--chart-expense', '#5a6272'), name: 'Расходы' },
            ],
          })),
        })}></div>
      </section>

      <div class="stats-two">
        <section class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">Расходы по категориям</h3>
              <p class="card__sub">${hasPeriodData ? `${catTotals.length} категорий` : 'Нет расходов за период'}</p>
            </div>
          </header>
          ${
            catTotal > 0
              ? useDonut
                ? `<div class="donut-wrap">
                  <div class="chart chart--donut" ${chartAttr({ type: 'donut', segments, size: 176, stroke: 16 })}></div>
                  <div class="cat-list">
                    ${catTotals
                      .map(
                        (x, i) => `<div class="cat-row">
                          <i class="cat-row__dot" style="background:${palette(i)}"></i>
                          <span class="cat-row__name">${escapeHtml(x.cat.name)}</span>
                          <span class="cat-row__val">${escapeHtml(money(x.value))}</span>
                          <span class="cat-row__pct">${pct((x.value / (catTotal || 1)) * 100)}</span>
                        </div>`,
                      )
                      .join('')}
                  </div>
                </div>`
                : `<div class="rank">
                  ${catTotals
                    .slice(0, 8)
                    .map(
                      (x, i) => `<div class="rank__row" style="--c:${palette(i)}">
                        <span class="rank__bar" style="width:${((x.value / (maxCat || 1)) * 100).toFixed(1)}%"></span>
                        <span class="rank__name">${escapeHtml(x.cat.name)}</span>
                        <span class="rank__val">${escapeHtml(money(x.value))}</span>
                        <span class="rank__pct">${pct((x.value / (catTotal || 1)) * 100)}</span>
                      </div>`,
                    )
                    .join('')}
                  ${catTotals.length > 8 ? `<div class="rank__more">и ещё ${catTotals.length - 8} категорий</div>` : ''}
                </div>`
              : `<div class="chart-empty">Расходов за этот период нет — график заполнится автоматически.</div>`
          }
        </section>

        <section class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">Динамика баланса</h3>
              <p class="card__sub">Деньги на карте и в наличных</p>
            </div>
            <span class="card__value">${escapeHtml(money(balancePts[balancePts.length - 1]?.value || 0))}</span>
          </header>
          <div class="chart chart--area" ${chartAttr({ type: 'area', height: 200, points: balancePts })}></div>
        </section>
      </div>

      <div class="stats-two">
        <section class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">Деньги по конвертам</h3>
              <p class="card__sub">Распределение накопленного</p>
            </div>
          </header>
          <div class="chart chart--stack" ${chartAttr({
            type: 'stack',
            height: 12,
            segments: derived.envelopes.map((e, i) => ({ label: e.name, value: Math.max(0, e.balance), color: e.color || palette(i) })),
          })}></div>
          <div class="env-list env-list--tight">
            ${derived.envelopes.map((e) => envelopeRow(e, { total: derived.envelopeTotal })).join('')}
          </div>
        </section>

        <section class="card">
          <header class="card__head">
            <div>
              <h3 class="card__title">Налоговый резерв</h3>
              <p class="card__sub">Начисления и уплаты по месяцам</p>
            </div>
          </header>
          <div class="chart chart--bars" ${chartAttr({
            type: 'bars',
            valuesPerItem: 2,
            height: 170,
            items: series.map((r) => ({
              label: monthLabel(r.month, 'short'),
              values: [
                { value: r.taxAccrued, color: cssVar('--chart-tax', '#4fd1a5'), name: 'Начислено' },
                { value: r.taxPaid, color: cssVar('--chart-expense', '#5a6272'), name: 'Уплачено' },
              ],
            })),
          })}></div>
          <div class="mini-stats">
            <div><span>Начислено</span><b>${escapeHtml(money(taxAccruedTotal))}</b></div>
            <div><span>Уплачено</span><b>${escapeHtml(money(sum.taxPaid))}</b></div>
          </div>
        </section>
      </div>

      <section class="card">
        <header class="card__head">
          <div>
            <h3 class="card__title">Сравнение с прошлым периодом</h3>
            <p class="card__sub">${escapeHtml(prevFrom.split('-').reverse().join('.'))} — ${escapeHtml(prevTo.split('-').reverse().join('.'))}</p>
          </div>
        </header>
        <div class="compare">
          <div class="compare__row"><span>Доходы</span><b>${escapeHtml(money(sum.income))}</b><span class="muted">${escapeHtml(money(prevSum.income))}</span>${deltaBadge(incomeDelta)}</div>
          <div class="compare__row"><span>Расходы</span><b>${escapeHtml(money(sum.expenses))}</b><span class="muted">${escapeHtml(money(prevSum.expenses))}</span>${deltaBadge(expenseDelta, true)}</div>
          <div class="compare__row"><span>Разница</span><b>${escapeHtml(money(sum.net, { signed: true }))}</b><span class="muted">${escapeHtml(money(prevSum.net, { signed: true }))}</span><span></span></div>
          <div class="compare__row"><span>Налог уплачен</span><b>${escapeHtml(money(sum.taxPaid))}</b><span class="muted">${escapeHtml(money(prevSum.taxPaid))}</span><span></span></div>
        </div>
      </section>

      ${
        !hasPeriodData
          ? `<div class="note note--soft">${icon('info', 16)}<span>За выбранный период операций нет. Выберите другой период выше — данные за другие месяцы сохранены.</span></div>`
          : ''
      }
    `
    }
  </div>`;
}
