/**
 * tg.js — интеграция с Telegram Mini App.
 *
 * В обычном браузере модуль тихо выключается: никаких тегов, классов и CSS-переменных
 * не появляется, приложение работает как раньше. Внутри Телеграма даёт ровно то,
 * чего не хватало PWA: явную высоту вьюпорта вместо `dvh` и явные safe-area
 * (устройство + собственная шапка Телеграма), поэтому нижняя панель всегда
 * прижата к реальному низу видимой области.
 */

const overlay = () => window.Telegram && window.Telegram.WebApp;

/** Открыто ли внутри Телеграма (а не в браузере). */
export function isTelegram() {
  const w = overlay();
  if (!w) return false;
  return Boolean(w.initData || (w.initDataUnsafe && w.initDataUnsafe.user));
}

let app = null;
let backShown = false;

/** Размеры и safe-area: единственный источник правды для оболочки внутри Телеграма. */
function applyViewport() {
  const w = app;
  if (!w) return;
  const root = document.documentElement;
  const height = w.viewportStableHeight || w.viewportHeight;
  if (height) root.style.setProperty('--app-h', `${Math.round(height)}px`);

  const safe = w.safeAreaInset || { top: 0, bottom: 0, left: 0, right: 0 };
  const content = w.contentSafeAreaInset || { top: 0, bottom: 0, left: 0, right: 0 };
  const fullscreen = Boolean(w.isFullscreen);
  // В полноэкранном режиме сверху плавают кнопки «свернуть» и «закрыть»
  // самого Телеграма: держим под них минимум 58 px, чтобы они не садились
  // на заголовок и на кнопки приложения.
  const topInset = Math.max((safe.top || 0) + (content.top || 0), fullscreen ? 58 : 0);
  root.style.setProperty('--top-safe', `${Math.round(topInset)}px`);
  root.style.setProperty('--dock-safe', `${Math.round(safe.bottom || 0)}px`);
  root.style.setProperty('--side-safe', `${Math.round(Math.max(safe.left || 0, safe.right || 0))}px`);
  document.body.classList.toggle('is-fullscreen', fullscreen);
}

/** Кнопка «назад» в шапке Телеграма повторяет поведение кнопки в приложении. */
export function syncTelegramBack(isHome) {
  if (!app || !app.BackButton) return;
  const show = !isHome;
  if (show === backShown) return;
  backShown = show;
  if (show) app.BackButton.show();
  else app.BackButton.hide();
}

export function haptic(kind = 'light') {
  const w = app;
  if (!w || !w.HapticFeedback) return;
  try {
    if (w.HapticFeedback.impactOccurred) w.HapticFeedback.impactOccurred(kind);
  } catch {
    /* нет поддержки — молча */
  }
}

/* ─────────── резерв в облаке Телеграма (CloudStorage) ───────────
   Локальное хранилище WebView можно вычистить вместе с кешем Телеграма.
   CloudStorage лежит на серверах Telegram, привязан к аккаунту и не зависит
   от кеша: при пустом локальном хранилище данные поднимаются оттуда. */

const MANIFEST_KEY = 'opora.manifest';
const CHUNK = 3500; // лимит CloudStorage — 4096 байт на значение

export const cloudAvailable = () => Boolean(app && app.CloudStorage);

function csCall(method, ...args) {
  return new Promise((resolve) => {
    try {
      app.CloudStorage[method](...args, (err, value) => resolve(err ? null : value));
    } catch {
      resolve(null);
    }
  });
}

/** Сохранить снимок состояния чанками. true — записалось целиком. */
export async function cloudSave(text) {
  if (!cloudAvailable() || typeof text !== 'string' || !text) return false;
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
  if (chunks.length > 900) return false; // защита от переполнения (лимит 1024 ключа)

  for (let i = 0; i < chunks.length; i++) {
    const ok = await csCall('setItem', `opora.state.${i}`, chunks[i]);
    if (ok === null) return false;
  }
  const manifest = JSON.stringify({ chunks: chunks.length, bytes: text.length, savedAt: new Date().toISOString() });
  const ok = await csCall('setItem', MANIFEST_KEY, manifest);
  return ok !== null;
}

/** Прочитать снимок из облака: { text, savedAt } или null. */
export async function cloudLoad() {
  if (!cloudAvailable()) return null;
  const raw = await csCall('getItem', MANIFEST_KEY);
  if (!raw) return null;
  let meta = null;
  try {
    meta = JSON.parse(raw);
  } catch {
    return null;
  }
  const count = Number(meta && meta.chunks) || 0;
  if (!count) return null;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const part = await csCall('getItem', `opora.state.${i}`);
    if (part === null) return null;
    parts.push(part);
  }
  return { text: parts.join(''), savedAt: (meta && meta.savedAt) || null };
}

/** Точка входа: вызывается из boot() до первого render(). */
export function initTelegram({ onBack } = {}) {
  const w = overlay();
  if (!w || !isTelegram()) return null;
  app = w;

  document.body.classList.add('is-tg');
  try {
    w.ready();
    w.expand();
    // полноэкранный режим (Bot API 8.0+): приложение занимает весь экран,
    // сверху остаются только системные кнопки «свернуть/закрыть» Телеграма
    if (typeof w.requestFullscreen === 'function' && !w.isFullscreen) w.requestFullscreen();
    if (w.disableVerticalSwipes) w.disableVerticalSwipes();
    if (w.setHeaderColor) w.setHeaderColor('#05070a');
    if (w.setBackgroundColor) w.setBackgroundColor('#05070a');
    if (w.setBottomBarColor) w.setBottomBarColor('#05070a');
  } catch {
    /* старые клиенты Telegram не знают части методов */
  }

  applyViewport();
  w.onEvent('viewportChanged', applyViewport);
  w.onEvent('safeAreaChanged', applyViewport);
  w.onEvent('contentSafeAreaChanged', applyViewport);
  w.onEvent('fullscreenChanged', applyViewport);
  w.onEvent('fullscreenFailed', applyViewport);
  w.onEvent('themeChanged', () => {
    if (w.setHeaderColor) w.setHeaderColor('#05070a');
  });
  if (w.BackButton && onBack) w.BackButton.onClick(onBack);

  return app;
}
