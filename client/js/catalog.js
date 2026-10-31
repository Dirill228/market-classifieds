// Каталог: фильтры, сортировка, пагинация, сохранённый поиск.

import { catalogApi, favoritesApi, savedSearchesApi } from './api.js';
import { icon } from './icons.js';
import {
  $, $$, declension, escapeHtml, formatPrice, listingCardMarkup, renderSkeletons,
  setBusy, toast, syncFavoriteButton, plural,
} from './ui.js';
import { getUser } from './auth.js';
import { mountLayout } from './layout.js';

mountLayout({ pageTitle: 'Каталог объявлений' });

const PER_PAGE = 12;
const PRICE_MIN = 0;
const PRICE_MAX = 30_000_000;

const state = {
  categories: [],
  locations: [],
  params: {},
  page: 1,
  total: 0,
  pages: 1,
  items: [],
  loading: false,
  aggregates: null,
};

/* ---------------- Параметры URL ---------------- */

function readParams() {
  const url = new URL(window.location.href);
  const params = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (value !== '') params[key] = value;
  }
  return params;
}

function writeParams(params, { replace = false } = {}) {
  const url = new URL(window.location.href);
  url.search = '';
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    url.searchParams.set(key, String(value));
  }
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', url.toString());
}

/* ---------------- Фильтры ---------------- */

function buildFiltersMarkup() {
  return `
    <div class="filters__panel">
      <div class="filters__head">
        <h2>Фильтры</h2>
        <button class="filters__reset" type="button" data-filters-reset>Сбросить</button>
      </div>

      <div class="filter-group">
        <button class="filter-group__trigger" type="button" data-filter-toggle="price" aria-expanded="true">
          Цена
          <span class="accordion__icon">${icon('chevron-down', { size: 14 })}</span>
        </button>
        <div class="filter-group__body is-open" data-filter-body="price">
          <div>
            <div class="filter-group__inner">
              <div class="range" data-range>
                <div class="range__track">
                  <div class="range__fill" data-range-fill></div>
                </div>
                <input class="range__input" type="range" min="${PRICE_MIN}" max="${PRICE_MAX}" step="1000" value="${PRICE_MIN}" data-range-min aria-label="Минимальная цена">
                <input class="range__input" type="range" min="${PRICE_MIN}" max="${PRICE_MAX}" step="1000" value="${PRICE_MAX}" data-range-max aria-label="Максимальная цена">
              </div>
              <div class="range__values">
                <input class="input" type="number" inputmode="numeric" placeholder="от" data-price-min aria-label="Цена от">
                <span>—</span>
                <input class="input" type="number" inputmode="numeric" placeholder="до" data-price-max aria-label="Цена до">
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="filter-group">
        <button class="filter-group__trigger" type="button" data-filter-toggle="category" aria-expanded="true">
          Категория
          <span class="accordion__icon">${icon('chevron-down', { size: 14 })}</span>
        </button>
        <div class="filter-group__body is-open" data-filter-body="category">
          <div>
            <div class="filter-group__inner">
              <select class="select" data-filter="category" aria-label="Категория">
                <option value="">Все категории</option>
                ${state.categories
                  .map((category) => `<option value="${category.slug}">${escapeHtml(category.name)}</option>`)
                  .join('')}
              </select>
              <select class="select" data-filter="subcategory" aria-label="Подкатегория" disabled>
                <option value="">Любая подкатегория</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="filter-group">
        <button class="filter-group__trigger" type="button" data-filter-toggle="location" aria-expanded="true">
          Локация
          <span class="accordion__icon">${icon('chevron-down', { size: 14 })}</span>
        </button>
        <div class="filter-group__body is-open" data-filter-body="location">
          <div>
            <div class="filter-group__inner">
              <select class="select" data-filter="location" aria-label="Город">
                <option value="">Вся Россия</option>
                ${state.locations
                  .map(
                    (location) =>
                      `<option value="${location.slug}">${escapeHtml(location.name)} · ${location.count}</option>`,
                  )
                  .join('')}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="filter-group">
        <button class="filter-group__trigger" type="button" data-filter-toggle="condition" aria-expanded="true">
          Состояние
          <span class="filter-hint tooltip" data-tooltip="Уточните, товар новый или был в использовании" tabindex="0">
            ${icon('info', { size: 13 })}
          </span>
          <span class="accordion__icon">${icon('chevron-down', { size: 14 })}</span>
        </button>
        <div class="filter-group__body is-open" data-filter-body="condition">
          <div>
            <div class="filter-group__inner">
              <label class="check check--radio">
                <input type="radio" name="condition" value="" checked>
                <span class="check__box"></span><span>Любое</span>
              </label>
              <label class="check check--radio">
                <input type="radio" name="condition" value="new">
                <span class="check__box"></span><span>Новое</span>
              </label>
              <label class="check check--radio">
                <input type="radio" name="condition" value="used">
                <span class="check__box"></span><span>Б/у</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="filter-group">
        <button class="filter-group__trigger" type="button" data-filter-toggle="seller" aria-expanded="true">
          Продавец
          <span class="accordion__icon">${icon('chevron-down', { size: 14 })}</span>
        </button>
        <div class="filter-group__body is-open" data-filter-body="seller">
          <div>
            <div class="filter-group__inner">
              <label class="check check--radio">
                <input type="radio" name="sellerType" value="" checked>
                <span class="check__box"></span><span>Все продавцы</span>
              </label>
              <label class="check check--radio">
                <input type="radio" name="sellerType" value="private">
                <span class="check__box"></span><span>Частные лица</span>
              </label>
              <label class="check check--radio">
                <input type="radio" name="sellerType" value="business">
                <span class="check__box"></span><span>Компании</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="filter-group">
        <div class="filter-toggle-row">
          <span class="row row-2">Доставка</span>
          <label class="switch">
            <input type="checkbox" data-filter="delivery" aria-label="Только с доставкой">
            <span class="switch__track"></span>
          </label>
        </div>
        <div class="filter-toggle-row">
          <span class="row row-2">Только срочные</span>
          <label class="switch">
            <input type="checkbox" data-filter="urgent" aria-label="Только срочные">
            <span class="switch__track"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="filters__mobile-bar">
      <button class="btn btn--outline" type="button" data-filters-reset>Сбросить</button>
      <button class="btn btn--primary" type="button" data-filters-apply>Показать</button>
    </div>
  `;
}

function syncFilterControls() {
  const params = state.params;

  $$('[data-filter]').forEach((input) => {
    const key = input.dataset.filter;
    if (input.type === 'checkbox') {
      input.checked = params[key] === 'true' || params[key] === '1';
    } else {
      input.value = params[key] || '';
    }
  });

  $$('input[name="condition"]').forEach((radio) => {
    radio.checked = (params.condition || '') === radio.value;
  });
  $$('input[name="sellerType"]').forEach((radio) => {
    radio.checked = (params.sellerType || '') === radio.value;
  });

  const min = Number(params.priceMin || PRICE_MIN);
  const max = Number(params.priceMax || PRICE_MAX);
  const minInput = $('[data-price-min]');
  const maxInput = $('[data-price-max]');
  const rangeMin = $('[data-range-min]');
  const rangeMax = $('[data-range-max]');
  if (minInput) minInput.value = params.priceMin || '';
  if (maxInput) maxInput.value = params.priceMax || '';
  if (rangeMin) rangeMin.value = String(Math.min(min, PRICE_MAX));
  if (rangeMax) rangeMax.value = String(Math.min(max, PRICE_MAX));
  updateRangeFill();

  syncSubcategories();
}

function syncSubcategories() {
  const categorySelect = $('[data-filter="category"]');
  const subSelect = $('[data-filter="subcategory"]');
  if (!categorySelect || !subSelect) return;

  const category = state.categories.find((item) => item.slug === categorySelect.value);
  const subs = category?.subcategories || [];
  subSelect.innerHTML = `<option value="">Любая подкатегория</option>${subs
    .map((sub) => `<option value="${sub.slug}">${escapeHtml(sub.name)}</option>`)
    .join('')}`;
  subSelect.disabled = subs.length === 0;
  subSelect.value = state.params.subcategory || '';
}

function updateRangeFill() {
  const rangeMin = $('[data-range-min]');
  const rangeMax = $('[data-range-max]');
  const fill = $('[data-range-fill]');
  if (!rangeMin || !rangeMax || !fill) return;

  const min = Number(rangeMin.value);
  const max = Number(rangeMax.value);
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  fill.style.left = `${(low / PRICE_MAX) * 100}%`;
  fill.style.width = `${((high - low) / PRICE_MAX) * 100}%`;
}

function applyFilterChange() {
  const params = { ...state.params };

  $$('[data-filter]').forEach((input) => {
    const key = input.dataset.filter;
    if (input.type === 'checkbox') {
      if (input.checked) params[key] = 'true';
      else delete params[key];
    } else if (input.value) {
      params[key] = input.value;
    } else {
      delete params[key];
    }
  });

  const condition = $('input[name="condition"]:checked')?.value;
  if (condition) params.condition = condition;
  else delete params.condition;

  const sellerType = $('input[name="sellerType"]:checked')?.value;
  if (sellerType) params.sellerType = sellerType;
  else delete params.sellerType;

  const minValue = $('[data-price-min]')?.value;
  const maxValue = $('[data-price-max]')?.value;
  if (minValue) params.priceMin = minValue;
  else delete params.priceMin;
  if (maxValue) params.priceMax = maxValue;
  else delete params.priceMax;

  if (params.category && !params.subcategory) delete params.subcategory;

  state.params = params;
  state.page = 1;
  writeParams({ ...params, page: undefined });
  loadListings();
}

function initFilters() {
  const container = $('#filters');
  if (!container) return;
  container.innerHTML = buildFiltersMarkup();
  syncFilterControls();

  container.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-filter-toggle]');
    if (toggle) {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      container.querySelector(`[data-filter-body="${toggle.dataset.filterToggle}"]`)?.classList.toggle('is-open', !expanded);
      return;
    }

    if (event.target.closest('[data-filters-reset]')) {
      state.params = {};
      state.page = 1;
      writeParams({});
      syncFilterControls();
      loadListings();
      return;
    }

    if (event.target.closest('[data-filters-apply]')) {
      $('#filters')?.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      applyFilterChange();
    }
  });

  container.addEventListener('change', (event) => {
    const target = event.target;
    if (target.matches('[data-filter="category"]')) {
      delete state.params.subcategory;
      syncSubcategories();
      applyFilterChange();
      return;
    }
    if (target.matches('[data-filter], input[name="condition"], input[name="sellerType"]')) {
      applyFilterChange();
    }
  });

  const minNumber = container.querySelector('[data-price-min]');
  const maxNumber = container.querySelector('[data-price-max]');
  const rangeMin = container.querySelector('[data-range-min]');
  const rangeMax = container.querySelector('[data-range-max]');

  let priceTimer = null;
  const scheduleApply = () => {
    clearTimeout(priceTimer);
    priceTimer = setTimeout(applyFilterChange, 420);
  };

  rangeMin?.addEventListener('input', () => {
    if (Number(rangeMin.value) > Number(rangeMax.value)) rangeMin.value = rangeMax.value;
    if (minNumber) minNumber.value = rangeMin.value === String(PRICE_MIN) ? '' : rangeMin.value;
    updateRangeFill();
    scheduleApply();
  });

  rangeMax?.addEventListener('input', () => {
    if (Number(rangeMax.value) < Number(rangeMin.value)) rangeMax.value = rangeMin.value;
    if (maxNumber) maxNumber.value = rangeMax.value === String(PRICE_MAX) ? '' : rangeMax.value;
    updateRangeFill();
    scheduleApply();
  });

  minNumber?.addEventListener('input', scheduleApply);
  maxNumber?.addEventListener('input', scheduleApply);

  $('#filters-open')?.addEventListener('click', () => {
    $('#filters')?.classList.add('is-open');
    document.body.classList.add('is-locked');
  });
}

/* ---------------- Список ---------------- */

function activeFilterChips() {
  const chips = [];
  const params = state.params;
  const push = (label, key) => chips.push({ label, key });

  if (params.q) push(`«${params.q}»`, 'q');
  if (params.category) {
    const category = state.categories.find((item) => item.slug === params.category);
    if (category) push(category.name, 'category');
  }
  if (params.subcategory) {
    const category = state.categories.find((item) => item.slug === params.category);
    const sub = category?.subcategories?.find((item) => item.slug === params.subcategory);
    if (sub) push(sub.name, 'subcategory');
  }
  if (params.location) {
    const location = state.locations.find((item) => item.slug === params.location);
    if (location) push(location.name, 'location');
  }
  if (params.priceMin) push(`от ${formatPrice(Number(params.priceMin))}`, 'priceMin');
  if (params.priceMax) push(`до ${formatPrice(Number(params.priceMax))}`, 'priceMax');
  if (params.condition) push(params.condition === 'new' ? 'Новое' : 'Б/у', 'condition');
  if (params.sellerType) push(params.sellerType === 'business' ? 'Компании' : 'Частные', 'sellerType');
  if (params.delivery) push('С доставкой', 'delivery');
  if (params.urgent) push('Срочные', 'urgent');

  return chips;
}

function renderChips() {
  const container = $('#active-filters');
  if (!container) return;
  const chips = activeFilterChips();
  if (!chips.length) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.innerHTML = chips
    .map(
      (chip) => `
      <button class="chip" type="button" data-remove-filter="${chip.key}">
        ${escapeHtml(chip.label)}
        <span class="chip__remove">${icon('x', { size: 10 })}</span>
      </button>`,
    )
    .join('');
}

function removeFilter(key) {
  const params = { ...state.params };
  delete params[key];
  if (key === 'category') delete params.subcategory;
  state.params = params;
  state.page = 1;
  writeParams({ ...params, page: undefined });
  syncFilterControls();
  loadListings();
}

function renderCount() {
  const node = $('#catalog-count');
  if (!node) return;
  const word = plural(state.total, ['объявление', 'объявления', 'объявлений']);
  node.innerHTML = `Найдено <strong>${state.total}</strong> ${word}`;
}

function renderListings() {
  const grid = $('#catalog-grid');
  if (!grid) return;

  if (!state.items.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1">
        <span class="empty-state__icon">${icon('search', { size: 24 })}</span>
        <h3>Ничего не нашлось</h3>
        <p>Попробуйте изменить фильтры или поискать в другой категории — новые объявления появляются каждый день.</p>
        <button class="btn btn--outline" type="button" data-filters-reset>Сбросить фильтры</button>
      </div>`;
    return;
  }

  grid.innerHTML = state.items.map((item) => listingCardMarkup(item)).join('');
}

function renderPagination() {
  const container = $('#pagination');
  if (!container) return;
  if (state.pages <= 1) {
    container.innerHTML = '';
    return;
  }

  const pages = [];
  const current = state.page;
  const total = state.pages;
  for (let index = 1; index <= total; index += 1) {
    if (index === 1 || index === total || Math.abs(index - current) <= 1) pages.push(index);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }

  container.innerHTML = `
    <button class="pagination__btn" type="button" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''} aria-label="Предыдущая страница">
      ${icon('chevron-left', { size: 15 })}
    </button>
    ${pages
      .map((page) =>
        page === '…'
          ? '<span class="pagination__gap">…</span>'
          : `<button class="pagination__btn" type="button" data-page="${page}" ${page === current ? 'aria-current="page"' : ''}>${page}</button>`,
      )
      .join('')}
    <button class="pagination__btn" type="button" data-page="${current + 1}" ${current === total ? 'disabled' : ''} aria-label="Следующая страница">
      ${icon('chevron-right', { size: 15 })}
    </button>
  `;
}

async function loadListings({ append = false } = {}) {
  if (state.loading) return;
  state.loading = true;

  const grid = $('#catalog-grid');
  const more = $('#load-more');
  if (!append) {
    renderSkeletons(grid, 9);
    grid.classList.add('listing-grid');
  }
  setBusy(more, true, 'Загружаем…');

  try {
    const data = await catalogApi.listings({
      ...state.params,
      page: state.page,
      perPage: PER_PAGE,
    });
    state.items = append ? [...state.items, ...data.items] : data.items;
    state.total = data.pagination.total;
    state.pages = data.pagination.pages;
    state.aggregates = data.aggregates;

    renderListings();
    renderCount();
    renderPagination();
    renderChips();

    if (more) {
      more.hidden = state.page >= state.pages;
    }
    const summary = $('#result-summary');
    if (summary) {
      summary.textContent = `Показано ${state.items.length} из ${state.total}`;
    }
  } catch (error) {
    toast(error.message || 'Не удалось загрузить объявления', { type: 'error' });
    if (grid && !append) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <span class="empty-state__icon">${icon('alert', { size: 24 })}</span>
        <h3>Ошибка загрузки</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>`;
    }
  } finally {
    state.loading = false;
    setBusy(more, false);
  }
}

/* ---------------- Сохранённый поиск ---------------- */

function searchTitle() {
  const parts = [];
  if (state.params.q) parts.push(`«${state.params.q}»`);
  if (state.params.category) {
    const category = state.categories.find((item) => item.slug === state.params.category);
    if (category) parts.push(category.name);
  }
  if (state.params.location) {
    const location = state.locations.find((item) => item.slug === state.params.location);
    if (location) parts.push(location.name);
  }
  return parts.length ? parts.join(' · ') : 'Все объявления';
}

async function saveSearch() {
  if (!getUser()) {
    toast('Войдите, чтобы сохранять поиски', { type: 'info' });
    document.querySelector('[data-auth-open="login"]')?.click();
    return;
  }
  try {
    await savedSearchesApi.create(searchTitle(), state.params);
    toast('Поиск сохранён в личном кабинете', { type: 'success' });
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
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
      document.querySelectorAll(`[data-favorite="${id}"]`).forEach((node) => syncFavoriteButton(node, !active));
    } catch (error) {
      toast(error.message, { type: 'error' });
    } finally {
      button.disabled = false;
    }
  });
}

/* ---------------- Инициализация ---------------- */

async function boot() {
  state.params = readParams();
  state.page = Number(state.params.page) || 1;
  delete state.params.page;

  try {
    const [categoriesData, locationsData] = await Promise.all([
      catalogApi.categories(),
      catalogApi.locations(),
    ]);
    state.categories = categoriesData.categories;
    state.locations = locationsData.locations;
  } catch (error) {
    toast('Не удалось загрузить справочники', { type: 'error' });
  }

  initFilters();
  bindFavorites();

  const sortSelect = $('#sort-select');
  if (sortSelect) {
    sortSelect.value = state.params.sort || 'date';
    sortSelect.addEventListener('change', () => {
      if (sortSelect.value === 'date') delete state.params.sort;
      else state.params.sort = sortSelect.value;
      state.page = 1;
      writeParams({ ...state.params });
      loadListings();
    });
  }

  $('#save-search')?.addEventListener('click', saveSearch);

  $('#load-more')?.addEventListener('click', () => {
    if (state.page >= state.pages) return;
    state.page += 1;
    loadListings({ append: true });
  });

  $('#pagination')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button) return;
    const page = Number(button.dataset.page);
    if (!page || page < 1 || page > state.pages) return;
    state.page = page;
    writeParams({ ...state.params, page: page > 1 ? page : undefined });
    loadListings();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('#active-filters')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-filter]');
    if (button) removeFilter(button.dataset.removeFilter);
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-filters-reset]')) {
      state.params = {};
      state.page = 1;
      writeParams({});
      syncFilterControls();
      loadListings();
    }
  });

  const queryInput = $('#catalog-query');
  if (queryInput) {
    queryInput.value = state.params.q || '';
    let timer = null;
    queryInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (queryInput.value.trim()) state.params.q = queryInput.value.trim();
        else delete state.params.q;
        state.page = 1;
        writeParams({ ...state.params });
        loadListings();
      }, 420);
    });
  }

  const heading = $('#catalog-title');
  if (heading) {
    const category = state.categories.find((item) => item.slug === state.params.category);
    heading.textContent = category ? category.name : state.params.q ? `Поиск: ${state.params.q}` : 'Все объявления';
  }

  await loadListings();
}

boot();
