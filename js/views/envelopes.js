/** views/envelopes.js — финансовые конверты. */
import { money, icon, escapeHtml, emptyState, openSheet, closeLayer, toast, amountInput, fmtDate, pct } from '../ui.js';
import { sectionHead } from '../components.js';
import { TYPE } from '../core.js';
import { store } from '../store.js';
import { chartAttr } from '../charts.js';

export function renderEnvelopes({ state, derived }) {
  const envs = derived.envelopes;
  const total = derived.envelopeTotal;
  const configured = envs.filter((e) => e.share !== null).reduce((s, e) => s + e.share, 0);
  const savingsShare = Math.max(0, 100 - configured);
  const savingsEnv = envs.find((e) => e.share === null);

  const events = [];
  for (const t of state.transactions) {
    if (t.type === TYPE.INCOME && t.alloc) events.push({ date: t.date, kind: 'alloc', tx: t });
    else if (t.type === TYPE.ENV_TRANSFER) events.push({ date: t.date, kind: 'move', tx: t });
    else if ((t.type === TYPE.EXPENSE || t.type === TYPE.REFUND) && t.envelopeId) events.push({ date: t.date, kind: t.type, tx: t });
  }
  events.sort((a, b) => (a.date === b.date ? String(b.tx.createdAt).localeCompare(String(a.tx.createdAt)) : a.date < b.date ? 1 : -1));

  return `<div class="page">
    <section class="card card--summary">
      <div class="summary-line">
        <div>
          <span class="summary-line__label">Распределено по конвертам</span>
          <b class="summary-line__value">${escapeHtml(money(total))}</b>
        </div>
        <div class="summary-line__crypto">
          <span>Свободно сверх конвертов</span>
          <b>${escapeHtml(money(derived.unallocated))}</b>
        </div>
      </div>
      <div class="chart chart--stack" ${chartAttr({
        type: 'stack',
        height: 10,
        segments: envs.map((e) => ({ label: e.name, value: Math.max(0, e.balance), color: e.color })),
      })}></div>
      <p class="card__hint">Конверты виртуальные: они показывают, на что распределены деньги, но не создают новых средств на счетах.</p>
    </section>

    <div class="env-cards">
      ${envs
        .map((e) => {
          const goal = e.goal || 0;
          const ratio = goal > 0 ? Math.max(0, Math.min(1, e.balance / goal)) : 0;
          return `<section class="card env-card">
            <header class="env-card__head">
              <span class="env-card__icon" style="--env-color:${escapeHtml(e.color)}">${icon(e.icon || 'wallet', 17)}</span>
              <div class="env-card__titles">
                <h3>${escapeHtml(e.name)}</h3>
                <span>${e.share === null ? 'остаток дохода' : `доля ${pct(e.share, 2)}`}</span>
              </div>
              <button class="icon-btn" data-act="env-edit" data-id="${escapeHtml(e.id)}" aria-label="Изменить конверт">${icon('edit', 16)}</button>
            </header>
            <div class="env-card__amount">${escapeHtml(money(e.balance))}</div>
            <div class="env-card__goal">
              ${
                goal > 0
                  ? `<div class="env-card__goal-line"><span>Цель ${escapeHtml(money(goal))}</span><span>${pct(ratio * 100)}</span></div>
                     <div class="progress"><div class="progress__fill" style="width:${(ratio * 100).toFixed(1)}%;background:${escapeHtml(e.color)}"></div></div>`
                  : `<div class="env-card__goal-line"><span class="muted">Цель не задана</span><span class="muted">${pct(total > 0 ? (Math.max(0, e.balance) / total) * 100 : 0)} от всех конвертов</span></div>
                     <div class="progress"><div class="progress__fill" style="width:${(total > 0 ? Math.max(0, e.balance) / total : 0) * 100}%;background:${escapeHtml(e.color)};opacity:.7"></div></div>`
              }
            </div>
            <div class="env-card__actions">
              <button class="link-btn" data-act="env-edit" data-id="${escapeHtml(e.id)}">${goal > 0 ? 'Изменить цель' : 'Задать цель'}</button>
              <button class="link-btn" data-act="env-move" data-id="${escapeHtml(e.id)}">Перевести${icon('chevron', 13)}</button>
            </div>
          </section>`;
        })
        .join('')}
    </div>

    <section class="card">
      ${sectionHead('Распределение новых доходов', '')}
      <form class="dist-form" data-dist>
        ${envs
          .filter((e) => e.share !== null)
          .map(
            (e) => `<label class="dist-row">
              <span class="dist-row__name">${escapeHtml(e.name)}</span>
              <span class="dist-row__input">
                <input class="input input--num" type="number" min="0" max="100" step="0.01" data-env="${escapeHtml(e.id)}" value="${e.share}" />
                <span>%</span>
              </span>
            </label>`,
          )
          .join('')}
        <div class="dist-row dist-row--rest">
          <span class="dist-row__name">${escapeHtml(savingsEnv?.name || 'Накопления')}</span>
          <span class="dist-row__val" data-rest>${pct(savingsShare, 2)}</span>
        </div>
        <p class="hint">Остаток после первых долей всегда уходит в «${escapeHtml(savingsEnv?.name || 'Накопления')}» — так округление не теряет деньги.</p>
        <p class="form-error" data-dist-error hidden></p>
        <button type="button" class="btn btn--soft" data-dist-save>Сохранить распределение</button>
      </form>
    </section>

    ${sectionHead('История распределения', events.length ? `<span class="muted small">${events.length} записей</span>` : '')}
    ${
      events.length
        ? `<div class="card card--flush"><div class="env-history">
            ${events
              .slice(0, 40)
              .map((ev) => {
                const t = ev.tx;
                if (ev.kind === 'alloc') {
                  const rows = state.envelopes
                    .filter((e) => t.alloc[e.id] !== undefined)
                    .map((e) => `<span class="env-history__part">${escapeHtml(e.name)} <b>${escapeHtml(money(t.alloc[e.id], { bare: true }))}</b></span>`)
                    .join('');
                  return `<div class="env-history__row">
                    <div class="env-history__top"><span>Доход ${escapeHtml(money(t.amount))}</span><span class="muted">${escapeHtml(fmtDate(t.date, 'full'))}</span></div>
                    <div class="env-history__parts">${rows}</div>
                  </div>`;
                }
                if (ev.kind === 'move') {
                  const from = state.envelopes.find((e) => e.id === t.envelopeId)?.name;
                  const to = state.envelopes.find((e) => e.id === t.toEnvelopeId)?.name;
                  return `<div class="env-history__row">
                    <div class="env-history__top"><span>${escapeHtml(from)} → ${escapeHtml(to)}</span><span class="muted">${escapeHtml(money(t.amount))}</span></div>
                    <div class="env-history__parts"><span class="muted">${escapeHtml(fmtDate(t.date, 'full'))}</span></div>
                  </div>`;
                }
                const envName = state.envelopes.find((e) => e.id === t.envelopeId)?.name;
                const cat = state.categories.find((c) => c.id === t.categoryId)?.name;
                return `<div class="env-history__row">
                  <div class="env-history__top"><span>${ev.kind === TYPE.REFUND ? 'Возврат в конверт' : 'Расход из конверта'} «${escapeHtml(envName || 'без конверта')}»</span><span class="${ev.kind === TYPE.REFUND ? 'pos' : ''}">${ev.kind === TYPE.REFUND ? '+' : '−'}${escapeHtml(money(t.amount, { bare: true }))}</span></div>
                  <div class="env-history__parts"><span class="muted">${escapeHtml(cat || '')}${cat ? ' · ' : ''}${escapeHtml(fmtDate(t.date, 'full'))}</span></div>
                </div>`;
              })
              .join('')}
          </div></div>`
        : emptyState({ iconName: 'wallet', title: 'Распределений ещё нет', text: 'Добавьте доход с налоговым резервом — остаток автоматически разложится по конвертам, и история появится здесь.' })
    }
  </div>`;
}

export function mountEnvelopes(root) {
  const form = root.querySelector('[data-dist]');
  if (!form) return;
  const inputs = [...form.querySelectorAll('[data-env]')];
  const restEl = form.querySelector('[data-rest]');
  const errEl = form.querySelector('[data-dist-error]');
  const recalc = () => {
    const sum = inputs.reduce((s, i) => s + (Number(i.value) || 0), 0);
    restEl.textContent = pct(Math.max(0, 100 - sum), 2);
    restEl.classList.toggle('neg', sum > 100);
    errEl.hidden = sum <= 100;
    errEl.textContent = sum > 100 ? `Сумма долей ${sum.toFixed(2).replace('.', ',')}% больше 100%` : '';
  };
  inputs.forEach((i) => i.addEventListener('input', recalc));
  form.querySelector('[data-dist-save]').addEventListener('click', () => {
    const sum = inputs.reduce((s, i) => s + (Number(i.value) || 0), 0);
    if (sum > 100) return toast('Сумма долей больше 100%', 'error');
    const map = {};
    for (const i of inputs) map[i.getAttribute('data-env')] = Math.max(0, Number(i.value) || 0);
    store.setEnvelopePercents(map);
    toast('Распределение сохранено');
  });
  recalc();
}

export function openEnvelopeForm(envelopeId) {
  const state = store.get();
  const env = state.envelopes.find((e) => e.id === envelopeId);
  if (!env) return;
  const isRest = env.percent === null;

  const root = openSheet({
    title: env.name,
    subtitle: 'Название, доля и цель',
    body: `<div class="form">
      <label class="field"><span class="field__label">Название</span>
        <input class="input" data-f="name" value="${escapeHtml(env.name)}" maxlength="30" data-autofocus />
      </label>
      ${
        isRest
          ? `<p class="hint">Этот конверт получает остаток дохода после вычитания долей и округления.</p>`
          : `<label class="field"><span class="field__label">Доля дохода, %</span>
              <input class="input" data-f="percent" type="number" min="0" max="100" step="0.01" value="${env.percent}" />
            </label>`
      }
      <label class="field"><span class="field__label">Цель накопления</span>
        <input class="input" data-f="goal" inputmode="decimal" value="${env.goal ? escapeHtml(amountInput(env.goal)) : ''}" placeholder="0 — без цели" />
        <span class="field__hint">Прогресс показывается на главной и на этой странице.</span>
      </label>
      <div class="field"><span class="field__label">Цвет</span>
        <div class="swatches">
          ${['#4690FF', '#9B8CFF', '#4FD1A5', '#F2A65A', '#E07BD0', '#7EE0B8', '#FF8FA3'].map((c) => `<button type="button" class="swatch ${c === env.color ? 'is-active' : ''}" data-color="${c}" style="--c:${c}" aria-label="Цвет ${c}"></button>`).join('')}
        </div>
      </div>
    </div>`,
    footer: `<button class="btn btn--primary btn--block" data-save>Сохранить</button>`,
  });

  let color = env.color;
  root.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
    color = b.getAttribute('data-color');
    root.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('is-active', x === b));
  }));

  root.querySelector('[data-save]').addEventListener('click', () => {
    const name = root.querySelector('[data-f="name"]').value.trim();
    if (!name) return toast('Введите название конверта', 'error');
    const percentInput = root.querySelector('[data-f="percent"]');
    const percent = percentInput ? Number(percentInput.value) : null;
    if (percentInput && (!(percent >= 0) || percent > 100)) return toast('Доля должна быть от 0 до 100', 'error');
    const others = state.envelopes.filter((e) => e.id !== env.id && e.percent !== null).reduce((s, e) => s + Number(e.percent), 0);
    if (percentInput && others + percent > 100) return toast('Сумма долей превышает 100%', 'error');
    store.saveEnvelope({
      id: env.id,
      name,
      percent: percentInput ? percent : null,
      goal: parseAmountToCents(root.querySelector('[data-f="goal"]').value) || 0,
      color,
    });
    closeLayer();
    toast('Конверт обновлён');
  });
}
