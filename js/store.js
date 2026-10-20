/**
 * store.js — состояние, сохранение в localStorage, операции над журналом.
 * Storage можно подменить (используется в тестах).
 */

import { createDefaultState, migrate, makeId } from './schema.js';
import { prepareTransaction } from './commands.js';
import { validateTransaction, SCHEMA_VERSION, isoToday } from './core.js';

export const STORAGE_KEY = 'latte.finance.state.v1';
const BACKUP_KEY = 'latte.finance.backup.v1';

function clone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

export class ValidationError extends Error {
  constructor(errors) {
    super(errors.join('. '));
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export function createStore({ storage, key = STORAGE_KEY } = {}) {
  const backend = storage || (typeof localStorage !== 'undefined' ? localStorage : new MemoryStorage());
  const listeners = new Set();
  let state = load();

  function load() {
    const readKey = (k) => {
      const raw = backend.getItem(k);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return migrate(parsed);
    };
    try {
      const main = readKey(key);
      if (main) return main;
    } catch (err) {
      console.warn('Основная запись повреждена, пробую резервную копию', err);
    }
    try {
      const backup = readKey(BACKUP_KEY);
      if (backup) return backup;
    } catch {
      /* резервная копия тоже недоступна */
    }
    return createDefaultState();
  }

  function persist(next) {
    const json = JSON.stringify(next);
    backend.setItem(key, json);
    try {
      backend.setItem(BACKUP_KEY, json);
    } catch {
      /* резервная копия не критична */
    }
  }

  function emit() {
    for (const fn of listeners) fn(state);
  }

  function commit(next, { silent = false } = {}) {
    const prev = state;
    try {
      persist(next);
    } catch (err) {
      state = prev;
      throw new Error('Не удалось сохранить данные: возможно, закончилось место в браузере. Экспортируйте резервную копию.');
    }
    state = next;
    if (!silent) emit();
    return state;
  }

  function update(mutator) {
    const next = clone(state);
    mutator(next);
    return commit(next);
  }

  function normalizeDraft(draft) {
    const t = { ...draft };
    t.amount = Math.round(Number(t.amount) || 0);
    t.qty = Number(t.qty) || 0;
    t.date = t.date || isoToday();
    t.comment = (t.comment || '').trim().slice(0, 280);
    return t;
  }

  const api = {
    get() { return state; },
    snapshot() { return clone(state); },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    update,

    addTransaction(draft) {
      const base = normalizeDraft(draft);
      const prepared = prepareTransaction(state, {
        ...base,
        id: makeId('tx'),
        createdAt: new Date().toISOString(),
      });
      const errors = validateTransaction(state, prepared);
      if (errors.length) throw new ValidationError(errors);
      update((s) => { s.transactions.push(prepared); });
      return prepared;
    },

    updateTransaction(id, draft) {
      const current = state.transactions.find((t) => t.id === id);
      if (!current) throw new Error('Операция не найдена');
      const base = normalizeDraft({ ...current, ...draft, id });
      // налогооблагаемость берём из категории, если её не задали явно в форме
      if (!Object.prototype.hasOwnProperty.call(draft, 'taxable')) delete base.taxable;
      // при правке суммы дохода налог и распределение пересчитываются заново
      const prepared = prepareTransaction(state, base, current);
      prepared.updatedAt = new Date().toISOString();
      const errors = validateTransaction(state, prepared);
      if (errors.length) throw new ValidationError(errors);
      update((s) => {
        const idx = s.transactions.findIndex((t) => t.id === id);
        if (idx >= 0) s.transactions[idx] = prepared;
      });
      return prepared;
    },

    deleteTransaction(id) {
      update((s) => { s.transactions = s.transactions.filter((t) => t.id !== id); });
    },

    setReserved(id, reserved) {
      update((s) => {
        const t = s.transactions.find((x) => x.id === id);
        if (t && t.type === 'income') t.reserved = !!reserved;
      });
    },

    reserveAll() {
      update((s) => {
        for (const t of s.transactions) {
          if (t.type === 'income' && (t.taxAccrued || 0) > 0) t.reserved = true;
        }
      });
    },

    updateSettings(patch) {
      update((s) => { s.settings = { ...s.settings, ...patch }; });
    },

    saveAccount(account) {
      update((s) => {
        const idx = s.accounts.findIndex((a) => a.id === account.id);
        if (idx >= 0) s.accounts[idx] = { ...s.accounts[idx], ...account };
        else s.accounts.push({ ...account, id: account.id || makeId('acc'), archived: false });
      });
    },

    deleteAccount(id) {
      const used = state.transactions.some((t) => t.accountId === id || t.toAccountId === id);
      if (used) throw new Error('По счёту есть операции. Удалить нельзя — можно скрыть счёт.');
      update((s) => { s.accounts = s.accounts.filter((a) => a.id !== id); });
    },

    saveEnvelope(envelope) {
      update((s) => {
        const idx = s.envelopes.findIndex((e) => e.id === envelope.id);
        if (idx >= 0) s.envelopes[idx] = { ...s.envelopes[idx], ...envelope };
      });
    },

    setEnvelopePercents(byId) {
      update((s) => {
        s.envelopes = s.envelopes.map((e) => (byId[e.id] === undefined ? e : { ...e, percent: byId[e.id] }));
      });
    },

    saveCategory(category) {
      update((s) => {
        const idx = s.categories.findIndex((c) => c.id === category.id);
        if (idx >= 0) s.categories[idx] = { ...s.categories[idx], ...category };
        else s.categories.push({ ...category, id: category.id || makeId('cat') });
      });
    },

    deleteCategory(id) {
      const used = state.transactions.some((t) => t.categoryId === id);
      if (used) throw new Error('Категория используется в операциях — её нельзя удалить');
      update((s) => { s.categories = s.categories.filter((c) => c.id !== id); });
    },

    saveAsset(accountId, asset) {
      update((s) => {
        const acc = s.accounts.find((a) => a.id === accountId);
        if (!acc) throw new Error('Криптосчёт не найден');
        acc.assets = acc.assets || [];
        const idx = acc.assets.findIndex((a) => a.id === asset.id);
        if (idx >= 0) acc.assets[idx] = { ...acc.assets[idx], ...asset, updatedAt: new Date().toISOString() };
        else acc.assets.push({ ...asset, id: asset.id || makeId('asset'), updatedAt: new Date().toISOString() });
      });
    },

    updateAssetPrice(accountId, assetId, priceCents) {
      update((s) => {
        const acc = s.accounts.find((a) => a.id === accountId);
        const asset = acc && (acc.assets || []).find((a) => a.id === assetId);
        if (asset) {
          asset.price = Math.round(priceCents);
          asset.updatedAt = new Date().toISOString();
        }
      });
    },

    deleteAsset(accountId, assetId) {
      update((s) => {
        const acc = s.accounts.find((a) => a.id === accountId);
        if (acc) acc.assets = (acc.assets || []).filter((a) => a.id !== assetId);
      });
    },

    exportJSON() {
      return JSON.stringify({ app: 'latte', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), state }, null, 2);
    },

    importJSON(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Файл повреждён: это не JSON');
      }
      const raw = parsed && parsed.state ? parsed.state : parsed;
      if (!raw || !Array.isArray(raw.transactions) || !Array.isArray(raw.accounts)) {
        throw new Error('В файле нет данных трекера');
      }
      const next = migrate(raw);
      return commit(next);
    },

    reset() {
      const fresh = createDefaultState();
      return commit(fresh);
    },

    storageBytes() {
      const raw = backend.getItem(key) || '';
      return new Blob([raw]).size;
    },
  };

  return api;
}

export const store = createStore();
