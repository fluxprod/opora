/** views/home.js — главный экран. */
import { money, icon, escapeHtml, emptyState, monthLabelCap, monthNameNom, fmtDate } from '../ui.js';
import { accountCard, envelopeRow, txRow, sectionHead, heroAmount, kpi } from '../components.js';
import { balanceSeries, summarize, monthKey, isoToday, monthRange, addMonths } from '../core.js';
import { chartAttr } from '../charts.js';

export function renderHome({ state, derived }) {
  // «Скрыть крипту»: главная должна выглядеть так, будто крипты нет вообще —
  // ни переключателя, ни карточки счёта, ни строки в балансе
  const hideCrypto = Boolean(state.settings.hideCrypto);
  const view = !hideCrypto && state.settings.balanceView === 'total' ? 'total' : 'fiat';
  const main = view === 'total' ? derived.total : derived.fiatTotal;

  const from = new Date();
  from.setDate(from.getDate() - 30);
  const fromISO = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  const spark = balanceSeries(state, fromISO, isoToday());

  const thisMonth = monthKey(isoToday());
  const range = monthRange(thisMonth);
  const mtd = summarize(state, state.transactions.filter((t) => t.date >= range.from && t.date <= range.to));

  const recent = [...state.transactions].sort((a, b) => (a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : a.date < b.date ? 1 : -1)).slice(0, 6);
  const isEmpty = state.transactions.length === 0;

  const fiatAccounts = derived.accounts.filter((a) => !a.isCrypto && !a.archived);
  const cryptoAcc = hideCrypto ? null : derived.accounts.find((a) => a.isCrypto);

  // изменение денег за 30 дней: одинаково верно для обоих режимов баланса,
  // потому что стоимость крипты в этом окне считается неизменной
  const startFiat = spark.length ? spark[0].value : derived.fiatTotal;
  const delta = derived.fiatTotal - startFiat;

  return `<div class="home">
    <div class="home__col home__col--main">
    <section class="hero home__hero">
      <div class="hero__glow" aria-hidden="true"></div>
      <header class="hero__head">
        <span class="hero__eyebrow">Всего денег</span>
        ${
          hideCrypto
            ? ''
            : `<div class="seg seg--sm" role="tablist">
          <button class="seg__item ${view === 'fiat' ? 'is-active' : ''}" data-act="set-view" data-view="fiat" role="tab" aria-selected="${view === 'fiat'}">Без крипты</button>
          <button class="seg__item ${view === 'total' ? 'is-active' : ''}" data-act="set-view" data-view="total" role="tab" aria-selected="${view === 'total'}">С криптой</button>
        </div>`
        }
      </header>

      <div class="hero__amount">${heroAmount(main)}</div>

      <p class="hero__delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}">
        ${delta === 0 ? '' : icon(delta > 0 ? 'arrowUp' : 'arrowDown', 13)}
        <b>${delta === 0 ? 'Без изменений' : `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`}</b>
        <span>за 30 дней</span>
      </p>

      <div class="hero__spark" ${chartAttr({ type: 'spark', points: spark.map((p) => ({ value: p.value })), height: 46 })}></div>

      <div class="hero__stats">
        <div class="hero__stat">
          <span>Доступно для расходов</span>
          <b class="accent">${escapeHtml(money(derived.available))}</b>
        </div>
        <div class="hero__stat">
          <span>Налоговый резерв</span>
          <b>${escapeHtml(money(derived.tax.reserveAvailable))}</b>
        </div>
        ${
          !hideCrypto && derived.cryptoValue > 0
            ? `<div class="hero__stat">
                <span>Крипта</span>
                <b>${escapeHtml(money(derived.cryptoValue))}</b>
              </div>`
            : ''
        }
      </div>
    </section>

    <section class="home__accounts">
      ${sectionHead(
        'Мои счета',
        `<button class="link-btn" data-act="go" data-to="accounts">Все счета${icon('chevron', 14)}</button>`,
      )}
      <div class="acc-grid">
        ${fiatAccounts.map((a) => accountCard(a)).join('')}
        ${cryptoAcc ? accountCard(cryptoAcc) : ''}
      </div>
    </section>

    <section class="home__recent">
      ${sectionHead(
        'Последние операции',
        `<button class="link-btn" data-act="go" data-to="history">Вся история${icon('chevron', 14)}</button>`,
        isEmpty ? '' : `За ${monthNameNom(thisMonth)}: +${money(mtd.income)} / −${money(mtd.expenses)}`,
      )}
      ${
        isEmpty
          ? emptyState({
              iconName: 'sparkles',
              title: 'Пока пусто',
              text: 'Добавьте первый доход или расход — приложение само посчитает налоговый резерв и распределит остаток по конвертам.',
              action: `<button class="btn btn--primary" data-act="add">${icon('plus', 16)}Добавить операцию</button>`,
            })
          : `<div class="card card--flush"><div class="tx-list">${recent.map((t) => txRow(state, t)).join('')}</div></div>`
      }
    </section>
    </div>

    <div class="home__col home__col--side">
    <section class="home__envelopes">
      ${sectionHead('Конверты', `<button class="link-btn" data-act="go" data-to="envelopes">Настроить${icon('chevron', 14)}</button>`)}
      <div class="card">
        <div class="env-list">
          ${derived.envelopes.map((e) => envelopeRow(e, { total: derived.envelopeTotal })).join('')}
        </div>
        <div class="card__foot">
          <span>Распределено из доходов</span>
          <b>${escapeHtml(money(derived.envelopeTotal))}</b>
        </div>
      </div>
    </section>

    <section class="home__tax">
      ${sectionHead('Налоговый резерв', `<button class="link-btn" data-act="go" data-to="tax">Подробнее${icon('chevron', 14)}</button>`)}
      <div class="card">
        <div class="tax-mini">
          <div>
            <span>Начислено</span>
            <b>${escapeHtml(money(derived.tax.accrued))}</b>
          </div>
          <div>
            <span>В резерве</span>
            <b>${escapeHtml(money(derived.tax.reserveAvailable))}</b>
          </div>
          <div>
            <span>Уплачено</span>
            <b>${escapeHtml(money(derived.tax.paid))}</b>
          </div>
        </div>
        <div class="progress progress--thin">
          <div class="progress__fill" style="width:${derived.tax.reserved > 0 ? Math.min(100, ((derived.tax.reserved - derived.tax.reserveAvailable) / derived.tax.reserved) * 100).toFixed(1) : 0}%;background:var(--chart-tax)"></div>
        </div>
        <p class="card__hint">${state.settings.taxEnabled ? `Ставка ${state.settings.taxRate}% от доходов с включённым резервом. Деньги остаются на счёте — резерв виртуальный.` : 'Резерв выключен в настройках.'}</p>
        ${derived.tax.pending > 0 ? `<button class="btn btn--soft btn--block" data-act="reserve-all">Зарезервировать ${escapeHtml(money(derived.tax.pending))}</button>` : ''}
      </div>
    </section>
    </div>
  </div>`;
}
