// Главная страница: категории, рекомендации, срочные объявления, аккордеон SEO.

import { catalogApi, favoritesApi, api } from './api.js';
import { icon } from './icons.js';
import {
  $, $$, declension, escapeHtml, formatPrice, initAccordions, initCounters, initRails,
  listingCardMarkup, renderSkeletons, relativeTime, setBusy, toast, syncFavoriteButton,
} from './ui.js';
import { getUser } from './auth.js';
import { mountLayout } from './layout.js';

mountLayout({ pageTitle: 'Маркет — объявления рядом' });

const state = { data: null };

/* ---------------- Категории ---------------- */

function renderCategories(categories) {
  const container = $('#category-grid');
  if (!container) return;
  container.innerHTML = categories
    .map(
      (category) => `
      <a class="category-tile" href="/catalog.html?category=${encodeURIComponent(category.slug)}">
        <span class="category-tile__icon">${icon(category.icon, { size: 21 })}</span>
        <span class="category-tile__name">${escapeHtml(category.name)}</span>
        <span class="category-tile__count">${declension(category.count, ['объявление', 'объявления', 'объявлений'])}</span>
      </a>`,
    )
    .join('');
}

/* ---------------- Рекомендации ---------------- */

function renderRecommended(items) {
  const rail = $('#recommended-rail');
  if (!rail) return;
  if (!items.length) {
    rail.innerHTML = '<p class="text-muted">Пока нет рекомендаций — посмотрите каталог.</p>';
    return;
  }
  rail.innerHTML = items.map((item) => listingCardMarkup(item, { eager: true })).join('');
}

function renderShowcase(items) {
  const container = $('#hero-showcase');
  if (!container) return;
  if (!items.length) {
    container.hidden = true;
    return;
  }
  container.innerHTML = items
    .map(
      (item, index) => `
      <a class="hero-showcase__card" href="/listing.html?id=${item.id}">
        <span class="hero-showcase__media">
          <img src="${escapeHtml(item.images[0].url)}" alt="${escapeHtml(item.title)}" width="400" height="300" ${index === 0 ? '' : 'loading="lazy"'} decoding="async">
        </span>
        ${item.isUrgent ? '<span class="hero-showcase__tag">Срочно</span>' : ''}
        <span class="hero-showcase__body">
          <span class="hero-showcase__price">${formatPrice(item.price)}</span>
          <span class="hero-showcase__title">${escapeHtml(item.title)}</span>
        </span>
      </a>`,
    )
    .join('');
}

/* ---------------- Срочные ---------------- */

function renderUrgent(items) {
  const grid = $('#urgent-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<p class="text-muted">Сейчас срочных объявлений нет.</p>';
    return;
  }
  grid.innerHTML = items.map((item) => listingCardMarkup(item, { compact: true })).join('');
  startUrgentTimer(items[0]?.urgentEndsAt);
}

function startUrgentTimer(endsAt) {
  const node = $('#urgent-timer');
  if (!node || !endsAt) return;
  const target = new Date(endsAt).getTime();

  const tick = () => {
    const diff = Math.max(0, target - Date.now());
    const hours = Math.floor(diff / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    const seconds = Math.floor((diff % 60_000) / 1000);
    node.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  tick();
  setInterval(tick, 1000);
}

/* ---------------- Метрики и статистика ---------------- */

function renderMetrics(stats) {
  const map = {
    'metric-users': stats.users,
    'metric-listings': stats.listings,
    'metric-cities': stats.cities,
  };
  for (const [id, value] of Object.entries(map)) {
    const node = document.getElementById(id);
    if (node) {
      node.dataset.count = String(value);
      node.textContent = '0';
    }
  }
  initCounters(document);
}

/* ---------------- Популярные запросы ---------------- */

function renderPopularQueries(queries) {
  const list = $('#popular-queries');
  if (!list) return;
  list.innerHTML = queries
    .map(
      (query) => `
      <li>
        <a class="link-btn" href="${escapeHtml(query.href)}">
          ${icon('search', { size: 14 })}${escapeHtml(query.label)}
        </a>
      </li>`,
    )
    .join('');
}

/* ---------------- Избранное ---------------- */

function bindFavorites() {
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-favorite]');
    if (!button) return;
    event.preventDefault();

    if (!getUser()) {
      toast('Войдите, чтобы сохранять объявления', { type: 'info' });
      document.querySelector('[data-auth-open="login"]')?.click();
      return;
    }

    const id = Number(button.dataset.favorite);
    const active = button.classList.contains('is-active');
    button.disabled = true;
    try {
      if (active) await favoritesApi.remove(id);
      else await favoritesApi.add(id);
      syncFavoriteButton(button, !active);
      document.querySelectorAll(`[data-favorite="${id}"]`).forEach((node) => syncFavoriteButton(node, !active));
      toast(active ? 'Удалено из избранного' : 'Сохранено в избранное', { type: 'success', timeout: 2600 });
    } catch (error) {
      toast(error.message, { type: 'error' });
    } finally {
      button.disabled = false;
    }
  });
}

/* ---------------- Автокомплит поиска ---------------- */

function initHeroSearch(categories) {
  const input = $('#hero-search-input');
  const panel = $('#hero-search-suggest');
  if (!input || !panel) return;

  let timer = null;
  let controller = null;

  const hide = () => {
    panel.hidden = true;
    panel.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
  };

  const render = (items) => {
    if (!items.length) {
      hide();
      return;
    }
    panel.innerHTML = items
      .map(
        (item) => `
        <a class="suggest-item" href="${escapeHtml(item.href)}" role="option">
          <span class="suggest-item__icon">${icon(item.type === 'category' ? item.icon || 'grid' : 'search', { size: 15 })}</span>
          <span class="suggest-item__body">
            <span class="suggest-item__label">${escapeHtml(item.label)}</span>
            ${item.hint ? `<span class="suggest-item__hint">${escapeHtml(item.hint)}</span>` : ''}
          </span>
          ${item.type === 'category' ? '<span class="badge badge--soft">Категория</span>' : ''}
        </a>`,
      )
      .join('');
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const localSuggestions = (term) => {
    const needle = term.toLowerCase();
    const categoryHits = categories
      .filter((category) => category.name.toLowerCase().includes(needle))
      .slice(0, 3)
      .map((category) => ({
        type: 'category',
        label: category.name,
        icon: category.icon,
        href: `/catalog.html?category=${category.slug}`,
      }));
    return categoryHits;
  };

  input.addEventListener('input', () => {
    const term = input.value.trim();
    clearTimeout(timer);
    if (term.length < 2) {
      hide();
      return;
    }
    render(localSuggestions(term));
    timer = setTimeout(async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const data = await catalogApi.suggest(term);
        render(data.suggestions);
      } catch {
        /* оставляем локальные подсказки */
      }
    }, 220);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.hero-search')) hide();
  });

  panel.addEventListener('click', (event) => {
    if (event.target.closest('a')) hide();
  });
}

/* ---------------- Карусель категорий в hero ---------------- */

async function load() {
  renderSkeletons($('#recommended-rail'), 4);
  try {
    const data = await catalogApi.home();
    state.data = data;
    renderCategories(data.categories);
    renderRecommended(data.recommended);
    renderShowcase(data.showcase);
    renderUrgent(data.urgent);
    renderMetrics(data.stats);
    renderPopularQueries(data.popularQueries);
    initHeroSearch(data.categories);
    initRails();
    initAccordions();
  } catch (error) {
    toast(error.message || 'Не удалось загрузить данные', { type: 'error' });
    const rail = $('#recommended-rail');
    if (rail) {
      rail.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon">${icon('alert', { size: 24 })}</span>
          <h3>Не удалось загрузить объявления</h3>
          <p>Проверьте соединение и попробуйте ещё раз.</p>
          <button class="btn btn--outline" type="button" onclick="location.reload()">Обновить</button>
        </div>`;
    }
  }
}

bindFavorites();
load();
