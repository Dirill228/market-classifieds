// Общие UI-утилиты: форматирование, тосты, карточки объявлений, тема,
// рендер шапки и футера, модальные окна, аккордеоны.

import { icon } from './icons.js';

/* ---------------- Форматирование ---------------- */

const nf = new Intl.NumberFormat('ru-RU');
const nfCompact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

export function formatPrice(value) {
  if (value === null || value === undefined) return '—';
  return `${nf.format(Math.round(value))} ₽`;
}

export function formatPriceShort(value) {
  return `${nfCompact.format(Math.round(value))} ₽`;
}

const PERIOD_LABEL = {
  hour: 'в час',
  day: 'в сутки',
  month: 'в месяц',
  m2: 'за м²',
};

export function periodLabel(period) {
  return PERIOD_LABEL[period] || '';
}

export function priceWithPeriod(price, period) {
  const label = periodLabel(period);
  return label ? `${formatPrice(price)} <small>${label}</small>` : formatPrice(price);
}

export function formatDate(value, { withTime = false } = {}) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const options = withTime
    ? { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'long' };
  return date.toLocaleDateString('ru-RU', options);
}

export function relativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн назад`;

  return formatDate(value);
}

export function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatChatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return formatTime(value);

  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return 'вчера';

  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export function plural(count, forms) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

export function declension(count, [one, few, many]) {
  return `${nf.format(count)} ${plural(count, [one, few, many])}`;
}

export function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) {
    const rest = digits.slice(1);
    return `+7 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6, 8)}-${rest.slice(8, 10)}`;
  }
  return value || '';
}

export function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function avatarUrl(url) {
  if (!url) return '';
  return url;
}

export function avatarMarkup(seller, { size = 'sm' } = {}) {
  const cls = size === 'sm' ? 'avatar avatar--sm' : size === 'lg' ? 'avatar avatar--lg' : 'avatar';
  if (seller?.avatar) {
    return `<span class="${cls}"><img src="${escapeHtml(seller.avatar)}" alt="" loading="lazy" width="40" height="40"></span>`;
  }
  return `<span class="${cls}" aria-hidden="true">${escapeHtml(initials(seller?.name))}</span>`;
}

export function listingUrl(id) {
  return `/listing.html?id=${id}`;
}

/* ---------------- DOM ---------------- */

export function $ (selector, root = document) { return root.querySelector(selector); }
export function $$ (selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

/* ---------------- Формы ---------------- */

// Обращение к полю по имени: form.title и form.name перекрываются нативными
// свойствами HTMLFormElement/HTMLElement, поэтому идём через elements.namedItem.
export function field(form, name) {
  return form?.elements?.namedItem(name) || null;
}

export function fieldValue(form, name) {
  const node = field(form, name);
  if (!node) return '';
  return typeof node.value === 'string' ? node.value : '';
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function setBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="btn__spinner"></span><span>${escapeHtml(busyLabel || 'Загрузка…')}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

/* ---------------- Тема ---------------- */

const THEME_KEY = 'market.theme';

export function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* игнорируем */
  }
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-pressed', String(next === 'dark'));
    button.setAttribute(
      'aria-label',
      next === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему',
    );
    button.setAttribute('title', next === 'dark' ? 'Светлая тема' : 'Тёмная тема');
  });
  document.dispatchEvent(new CustomEvent('theme:change', { detail: { theme: next } }));
}

export function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    stored = null;
  }
  const preferred = stored
    || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = preferred;
  return preferred;
}

export function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ---------------- Тосты ---------------- */

function toastStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = el('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    document.body.append(stack);
  }
  return stack;
}

const TOAST_ICONS = {
  success: 'check-circle',
  error: 'alert',
  info: 'info',
};

export function toast(message, { type = 'info', title = '', timeout = 4200 } = {}) {
  const stack = toastStack();
  const node = el('div', { class: `toast toast--${type}` }, [
    el('span', { class: 'toast__icon', html: icon(TOAST_ICONS[type] || 'info', { size: 18 }) }),
    el('div', { class: 'toast__body' }, [
      title ? el('div', { class: 'toast__title', text: title }) : null,
      el('div', { text: message }),
    ]),
    el('button', {
      class: 'toast__close',
      type: 'button',
      'aria-label': 'Закрыть уведомление',
      html: icon('x', { size: 13 }),
      onclick: () => dismiss(),
    }),
  ]);

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 200);
  }

  stack.append(node);
  if (timeout) setTimeout(dismiss, timeout);
  return dismiss;
}

/* ---------------- Карточки ---------------- */

export function badgesMarkup(listing) {
  const badges = [];
  if (listing.isUrgent) {
    badges.push(`<span class="badge badge--urgent">${icon('clock', { size: 11 })}Срочно</span>`);
  }
  if (listing.promotedUntil) {
    badges.push(`<span class="badge badge--vip">${icon('star', { size: 11 })}VIP</span>`);
  }
  if (listing.condition === 'new') {
    badges.push('<span class="badge badge--new">Новое</span>');
  }
  return badges.join('');
}

export function listingCardMarkup(listing, { compact = false, eager = false } = {}) {
  const image = listing.images?.[0];
  const media = image
    ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || listing.title)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`
    : `<span class="listing-card__placeholder">${icon(listing.category?.icon || 'image', { size: 34 })}</span>`;

  const period = periodLabel(listing.pricePeriod);
  const location = listing.location?.name || '';

  return `
    <article class="listing-card${compact ? ' listing-card--compact' : ''}">
      <a class="listing-card__media" href="${listingUrl(listing.id)}" aria-label="${escapeHtml(listing.title)}">
        ${media}
        <span class="listing-card__badges">${badgesMarkup(listing)}</span>
      </a>
      <button class="listing-card__fav${listing.isFavorite ? ' is-active' : ''}" type="button"
        data-favorite="${listing.id}" aria-pressed="${listing.isFavorite ? 'true' : 'false'}"
        aria-label="${listing.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}">
        ${icon('heart', { size: 16 })}
      </button>
      <div class="listing-card__body">
        <a class="listing-card__price" href="${listingUrl(listing.id)}">${formatPrice(listing.price)}${period ? ` <small>${period}</small>` : ''}</a>
        <a class="listing-card__title" href="${listingUrl(listing.id)}">${escapeHtml(listing.title)}</a>
        <div class="listing-card__meta">
          ${icon('map-pin', { size: 13 })}
          <span>${escapeHtml(location)}</span>
          <span class="dot-sep"></span>
          <span>${relativeTime(listing.createdAt)}</span>
        </div>
      </div>
      <div class="listing-card__footer">
        <span class="listing-card__seller">
          ${avatarMarkup(listing.seller, { size: 'sm' })}
          <span>${escapeHtml(listing.seller?.name || '')}</span>
        </span>
        ${listing.seller?.verified
          ? `<span class="listing-card__verified" title="Проверенный продавец">${icon('shield-check', { size: 13 })}</span>`
          : ''}
      </div>
    </article>
  `;
}

export function skeletonCardMarkup() {
  return `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton-card__media"></div>
      <div class="skeleton-card__body">
        <div class="skeleton skeleton-line skeleton-line--price"></div>
        <div class="skeleton skeleton-line skeleton-line--title"></div>
        <div class="skeleton skeleton-line skeleton-line--short"></div>
      </div>
    </div>
  `;
}

export function renderSkeletons(container, count = 8) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, skeletonCardMarkup).join('');
}

export function emptyStateMarkup({ iconName = 'search', title, text, actionHtml = '' }) {
  return `
    <div class="empty-state">
      <span class="empty-state__icon">${icon(iconName, { size: 24 })}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      ${actionHtml}
    </div>
  `;
}

/* ---------------- Аккордеон ---------------- */

export function initAccordions(root = document) {
  $$('[data-accordion-trigger]', root).forEach((trigger) => {
    if (trigger.dataset.bound === 'true') return;
    trigger.dataset.bound = 'true';
    trigger.addEventListener('click', () => {
      const expanded = trigger.getAttribute('aria-expanded') === 'true';
      const panelId = trigger.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      trigger.setAttribute('aria-expanded', String(!expanded));
      if (panel) panel.classList.toggle('is-open', !expanded);
    });
  });
}

/* ---------------- Модальные окна ---------------- */

export function openModal(id) {
  const backdrop = document.getElementById(id);
  if (!backdrop) return;
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-locked');
  const focusable = backdrop.querySelector('input, textarea, select, button:not([data-close])');
  setTimeout(() => focusable?.focus(), 60);
}

export function closeModal(id) {
  const backdrop = typeof id === 'string' ? document.getElementById(id) : id;
  if (!backdrop) return;
  backdrop.classList.remove('is-open');
  backdrop.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal-backdrop.is-open')) {
    document.body.classList.remove('is-locked');
  }
}

export function initModals() {
  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-modal-open]');
    if (opener) {
      event.preventDefault();
      openModal(opener.dataset.modalOpen);
      return;
    }
    const closer = event.target.closest('[data-modal-close], [data-close]');
    if (closer) {
      const backdrop = closer.closest('.modal-backdrop');
      if (backdrop) closeModal(backdrop);
      return;
    }
    if (event.target.classList.contains('modal-backdrop')) closeModal(event.target);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = document.querySelector('.modal-backdrop.is-open');
    if (open) closeModal(open);
  });
}

/* ---------------- Раскрытие длинного текста ---------------- */

export function initReadMore() {
  $$('[data-read-more]').forEach((button) => {
    const target = document.getElementById(button.dataset.readMore);
    if (!target) return;
    button.addEventListener('click', () => {
      const collapsed = target.classList.toggle('is-collapsed');
      button.textContent = collapsed ? 'Показать полностью' : 'Свернуть';
      button.setAttribute('aria-expanded', String(!collapsed));
    });
  });
}

/* ---------------- «Наверх» ---------------- */

export function initToTop() {
  const button = document.querySelector('.to-top');
  if (!button) return;
  const onScroll = () => {
    button.classList.toggle('is-visible', window.scrollY > 640);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ---------------- Горизонтальные рейлы ---------------- */

export function initRails() {
  $$('[data-rail]').forEach((wrap) => {
    const rail = wrap.querySelector('.rail');
    if (!rail) return;
    const prev = wrap.querySelector('.rail-nav--prev');
    const next = wrap.querySelector('.rail-nav--next');

    const step = () => {
      const first = rail.firstElementChild;
      return first ? first.getBoundingClientRect().width + 16 : 280;
    };

    const sync = () => {
      const max = rail.scrollWidth - rail.clientWidth - 4;
      if (prev) prev.disabled = rail.scrollLeft <= 4;
      if (next) next.disabled = rail.scrollLeft >= max;
    };

    prev?.addEventListener('click', () => rail.scrollBy({ left: -step(), behavior: 'smooth' }));
    next?.addEventListener('click', () => rail.scrollBy({ left: step(), behavior: 'smooth' }));
    rail.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  });
}

/* ---------------- Счётчики ---------------- */

export function animateCount(node, target, { duration = 1200, suffix = '' } = {}) {
  if (!node) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    node.textContent = `${nf.format(target)}${suffix}`;
    return;
  }
  const start = performance.now();
  const from = 0;
  const tick = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - progress) ** 3;
    const value = Math.round(from + (target - from) * eased);
    node.textContent = `${nf.format(value)}${suffix}`;
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function initCounters(root = document) {
  const nodes = $$('[data-count]', root);
  if (!nodes.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const node = entry.target;
      observer.unobserve(node);
      animateCount(node, Number(node.dataset.count), { suffix: node.dataset.countSuffix || '' });
    });
  }, { threshold: 0.4 });
  nodes.forEach((node) => observer.observe(node));
}

/* ---------------- Избранное (делегирование) ---------------- */

export function bindFavoriteButtons(root = document, { onToggle } = {}) {
  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-favorite]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.busy === 'true') return;
    button.dataset.busy = 'true';
    try {
      await onToggle?.(button);
    } finally {
      delete button.dataset.busy;
    }
  });
}

export function syncFavoriteButton(button, isFavorite) {
  button.classList.toggle('is-active', isFavorite);
  button.setAttribute('aria-pressed', String(isFavorite));
  button.setAttribute('aria-label', isFavorite ? 'Убрать из избранного' : 'Добавить в избранное');
}

/* ---------------- Скелетон «печатает» ---------------- */

export function typingMarkup() {
  return '<div class="typing" aria-label="Собеседник печатает"><span></span><span></span><span></span></div>';
}

/* ---------------- Дни в чате ---------------- */

export function dayLabel(value) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/* ---------------- Ссылки на текущую страницу ---------------- */

export function markCurrentNav() {
  const path = window.location.pathname.replace(/\/index\.html$/, '/');
  $$('[data-nav]').forEach((link) => {
    const target = new URL(link.getAttribute('href'), window.location.origin).pathname;
    const isHome = (path === '/' || path === '/index.html') && (target === '/' || target === '/index.html');
    if (isHome || (target !== '/' && path.startsWith(target))) {
      link.setAttribute('aria-current', 'page');
    }
  });
}
