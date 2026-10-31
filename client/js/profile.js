// Личный кабинет: объявления, статистика, график, избранное, настройки, баланс.

import { catalogApi, favoritesApi, profileApi, savedSearchesApi, authApi } from './api.js';
import { icon } from './icons.js';
import {
  $, $$, declension, emptyStateMarkup, escapeHtml, field, fieldValue, formatDate, formatPrice,
  listingCardMarkup, relativeTime, setBusy, syncFavoriteButton, toast,
} from './ui.js';
import { getUser, requireUser, setUser, logout } from './auth.js';
import { mountLayout } from './layout.js';

mountLayout({ pageTitle: 'Личный кабинет' });

const state = {
  tab: 'listings',
  stats: null,
  listings: [],
  favorites: [],
  searches: [],
  balance: null,
};

const STATUS_LABEL = {
  active: { text: 'Активно', cls: 'status-dot--active', badge: 'badge--new' },
  moderation: { text: 'На модерации', cls: 'status-dot--moderation', badge: 'badge--warn' },
  rejected: { text: 'Отклонено', cls: 'status-dot--rejected', badge: 'badge--danger' },
  sold: { text: 'Продано', cls: 'status-dot--sold', badge: 'badge--info' },
  archived: { text: 'В архиве', cls: '', badge: 'badge--soft' },
};

/* ---------------- Профиль ---------------- */

function renderHero(user, stats) {
  const container = $('#profile-hero');
  if (!container) return;
  const avatar = user.avatar
    ? `<span class="avatar avatar--xl avatar--ring"><img src="${escapeHtml(user.avatar)}" alt="" width="84" height="84"></span>`
    : `<span class="avatar avatar--xl avatar--ring">${escapeHtml((user.name || '').slice(0, 1))}</span>`;

  container.innerHTML = `
    ${avatar}
    <div class="profile-hero__meta">
      <h2>${escapeHtml(user.name)}</h2>
      <div class="profile-hero__sub">
        ${escapeHtml(user.city || 'Город не указан')} · на Маркете с ${formatDate(user.createdAt)}
      </div>
      <div class="profile-hero__badges">
        <span class="badge badge--soft">${icon('star', { size: 11 })}${user.rating.toFixed(1)} · ${declension(user.reviewsCount, ['отзыв', 'отзыва', 'отзывов'])}</span>
        ${user.verified
          ? `<span class="badge badge--new">${icon('shield-check', { size: 11 })}Проверенный продавец</span>`
          : `<span class="badge badge--warn">${icon('alert', { size: 11 })}Не подтверждён</span>`}
        <span class="badge badge--outline">${escapeHtml(user.email)}</span>
      </div>
    </div>
    <div class="row row-2">
      <a class="btn btn--outline btn--sm" href="/create.html">${icon('plus', { size: 15 })}Новое объявление</a>
      <button class="btn btn--ghost btn--sm" type="button" data-tab-jump="settings">${icon('settings', { size: 15 })}Настройки</button>
    </div>
  `;
}

function renderStats(stats) {
  const container = $('#stat-grid');
  if (!container) return;
  const cards = [
    { label: 'Активные', value: stats.counts.active, icon: 'list' },
    { label: 'Всего просмотров', value: stats.totalViews, icon: 'eye' },
    { label: 'В избранном', value: stats.favorites, icon: 'heart' },
    { label: 'Непрочитанных', value: stats.unread, icon: 'message' },
  ];
  container.innerHTML = cards
    .map(
      (card) => `
      <div class="stat-card">
        <div class="stat-card__label">${icon(card.icon, { size: 13 })}${escapeHtml(card.label)}</div>
        <div class="stat-card__value">${card.value.toLocaleString('ru-RU')}</div>
        <div class="stat-card__delta">${icon('trending-up', { size: 12 })}за 30 дней</div>
      </div>`,
    )
    .join('');
}

/* ---------------- График ---------------- */

function renderChart(series) {
  const svg = $('#views-chart');
  if (!svg) return;

  const width = 720;
  const height = 168;
  const padding = { top: 12, right: 8, bottom: 20, left: 8 };
  const values = series.map((point) => point.value);
  const max = Math.max(1, ...values);
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const stepX = innerW / Math.max(1, series.length - 1);

  const points = series.map((point, index) => {
    const x = padding.left + index * stepX;
    const y = padding.top + innerH - (point.value / max) * innerH;
    return [x, y];
  });

  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${(padding.top + innerH).toFixed(1)} L${points[0][0].toFixed(1)},${(padding.top + innerH).toFixed(1)} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = padding.top + innerH * ratio;
      return `<line class="chart-grid" x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" />`;
    })
    .join('');

  const labels = series
    .map((point, index) => {
      if (index % 6 !== 0 && index !== series.length - 1) return '';
      const x = padding.left + index * stepX;
      const date = new Date(point.date);
      return `<text class="chart-label" x="${x.toFixed(1)}" y="${height - 4}" text-anchor="middle">${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}</text>`;
    })
    .join('');

  const lastPoint = points[points.length - 1];

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <defs>
      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand-900)" stop-opacity="0.18" />
        <stop offset="100%" stop-color="var(--brand-900)" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${gridLines}
    <path class="chart-area" d="${area}" />
    <path class="chart-line" d="${line}" />
    <circle class="chart-dot" cx="${lastPoint[0].toFixed(1)}" cy="${lastPoint[1].toFixed(1)}" r="3.5" />
    ${labels}
  `;

  const total = values.reduce((sum, value) => sum + value, 0);
  const totalNode = $('#chart-total');
  if (totalNode) totalNode.innerHTML = `<strong>${total.toLocaleString('ru-RU')}</strong> просмотров за 30 дней`;
}

/* ---------------- Верификация ---------------- */

function renderVerification(verification) {
  const container = $('#verify-list');
  if (!container) return;
  const items = [
    { key: 'email', label: 'E-mail', desc: 'Подтверждён', done: verification.email },
    { key: 'phone', label: 'Телефон', desc: verification.phone ? 'Подтверждён' : 'Добавьте номер в настройках', done: verification.phone },
    { key: 'passport', label: 'Документы', desc: verification.passport ? 'Проверены модератором' : 'Не загружены', done: verification.passport },
  ];
  container.innerHTML = items
    .map(
      (item) => `
      <div class="verify-item${item.done ? '' : ' is-pending'}">
        <span class="verify-item__icon">${icon(item.done ? 'check' : 'clock', { size: 14 })}</span>
        <span class="verify-item__text">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.desc)}</span>
        </span>
        ${item.done ? '<span class="badge badge--new">Готово</span>' : '<button class="link-btn" type="button" data-tab-jump="settings">Добавить</button>'}
      </div>`,
    )
    .join('');
}

/* ---------------- Объявления ---------------- */

function renderListings(filterStatus = 'all') {
  const container = $('#listings-body');
  if (!container) return;

  const items = filterStatus === 'all'
    ? state.listings
    : state.listings.filter((item) => item.status === filterStatus);

  if (!items.length) {
    container.innerHTML = `
      <tr><td colspan="5">
        ${emptyStateMarkup({
          iconName: 'list',
          title: 'Объявлений пока нет',
          text: 'Разместите первое объявление — это бесплатно и занимает около двух минут.',
          actionHtml: '<a class="btn btn--primary" href="/create.html">Разместить объявление</a>',
        })}
      </td></tr>`;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const status = STATUS_LABEL[item.status] || STATUS_LABEL.archived;
      return `
      <tr data-listing-row="${item.id}">
        <td>
          <div class="data-table__listing">
            <span class="data-table__thumb">
              ${item.images?.[0]
                ? `<img src="${escapeHtml(item.images[0].url)}" alt="" loading="lazy" width="46" height="40">`
                : `<span class="listing-card__placeholder">${icon(item.category.icon, { size: 16 })}</span>`}
            </span>
            <div>
              <a class="data-table__title" href="/listing.html?id=${item.id}">${escapeHtml(item.title)}</a>
              <div class="text-xs text-muted mt-1">${escapeHtml(item.category.name)} · ${escapeHtml(item.location.name)}</div>
            </div>
          </div>
        </td>
        <td class="data-table__price">${formatPrice(item.price)}</td>
        <td>
          <span class="status-pill">
            <span class="status-dot ${status.cls}"></span>${status.text}
          </span>
        </td>
        <td class="data-table__views">${item.views.toLocaleString('ru-RU')}</td>
        <td class="text-muted nowrap">${relativeTime(item.createdAt)}</td>
        <td>
          <div class="row-actions">
            <a class="icon-btn tooltip" href="/listing.html?id=${item.id}" data-tooltip="Открыть" aria-label="Открыть объявление">${icon('eye', { size: 15 })}</a>
            <button class="icon-btn tooltip" type="button" data-listing-status="${item.id}" data-status="sold" data-tooltip="${item.status === 'sold' ? 'Вернуть в продажу' : 'Отметить проданным'}" aria-label="Изменить статус">
              ${icon(item.status === 'sold' ? 'refresh' : 'check-circle', { size: 15 })}
            </button>
            <button class="icon-btn is-danger tooltip" type="button" data-listing-delete="${item.id}" data-tooltip="Удалить" aria-label="Удалить объявление">
              ${icon('trash', { size: 15 })}
            </button>
          </div>
        </td>
      </tr>`;
    })
    .join('');
}

function renderListingTabs() {
  const container = $('#listing-tabs');
  if (!container) return;
  const counts = { all: state.listings.length };
  for (const item of state.listings) counts[item.status] = (counts[item.status] || 0) + 1;

  const tabs = [
    { key: 'all', label: 'Все' },
    { key: 'active', label: 'Активные' },
    { key: 'moderation', label: 'На модерации' },
    { key: 'sold', label: 'Проданные' },
    { key: 'rejected', label: 'Отклонённые' },
  ];

  container.innerHTML = tabs
    .map(
      (tab) => `
      <button class="tab" type="button" role="tab" data-status-filter="${tab.key}" aria-selected="${tab.key === 'all'}">
        ${tab.label}
        <span class="tab__count">${counts[tab.key] || 0}</span>
      </button>`,
    )
    .join('');
}

/* ---------------- Избранное ---------------- */

function renderFavorites() {
  const container = $('#favorites-grid');
  if (!container) return;
  if (!state.favorites.length) {
    container.innerHTML = emptyStateMarkup({
      iconName: 'heart',
      title: 'В избранном пусто',
      text: 'Нажимайте на сердечко в карточках объявлений, чтобы сохранить их здесь.',
      actionHtml: '<a class="btn btn--primary" href="/catalog.html">Перейти в каталог</a>',
    });
    return;
  }
  container.innerHTML = state.favorites.map((item) => listingCardMarkup(item)).join('');
}

/* ---------------- Сохранённые поиски ---------------- */

function renderSearches() {
  const container = $('#saved-searches');
  if (!container) return;
  if (!state.searches.length) {
    container.innerHTML = emptyStateMarkup({
      iconName: 'bookmark',
      title: 'Сохранённых поисков нет',
      text: 'Настройте фильтры в каталоге и нажмите «Сохранить поиск» — мы будем присылать новые объявления.',
      actionHtml: '<a class="btn btn--primary" href="/catalog.html">Открыть каталог</a>',
    });
    return;
  }
  container.innerHTML = state.searches
    .map((search) => {
      const query = new URLSearchParams(search.query || {}).toString();
      return `
      <div class="verify-item">
        <span class="verify-item__icon">${icon('bookmark', { size: 14 })}</span>
        <span class="verify-item__text">
          <strong>${escapeHtml(search.title)}</strong>
          <span>Сохранён ${formatDate(search.createdAt)}</span>
        </span>
        <a class="link-btn" href="/catalog.html${query ? `?${query}` : ''}">Открыть</a>
        <button class="icon-btn is-danger" type="button" data-search-delete="${search.id}" aria-label="Удалить поиск">${icon('x', { size: 14 })}</button>
      </div>`;
    })
    .join('');
}

/* ---------------- Баланс ---------------- */

function renderBalance() {
  const container = $('#balance-body');
  if (!container) return;
  if (!state.balance) return;

  const { balance, spent, transactions } = state.balance;
  container.innerHTML = `
    <div class="row between wrap row-3 mb-4">
      <div>
        <div class="text-xs text-muted">Доступно на балансе</div>
        <div class="stat-card__value">${formatPrice(balance)}</div>
      </div>
      <button class="btn btn--primary" type="button" data-tab-jump="listings">${icon('plus', { size: 16 })}Пополнить</button>
    </div>
    <div class="text-sm text-muted mb-4">Потрачено на продвижение: ${formatPrice(spent)}</div>
    ${transactions.length
      ? `<div class="table-wrap"><div class="table-scroll"><table class="data-table" style="min-width:480px">
          <thead><tr><th>Операция</th><th>Объявление</th><th>Сумма</th><th>Дата</th></tr></thead>
          <tbody>
            ${transactions
              .map(
                (tx) => `<tr>
                  <td>${tx.type === 'vip' ? 'VIP-размещение' : 'Срочное размещение'}</td>
                  <td class="truncate" style="max-width:240px">${escapeHtml(tx.title)}</td>
                  <td class="data-table__price text-danger">${formatPrice(tx.amount)}</td>
                  <td class="text-muted nowrap">${formatDate(tx.date)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table></div></div>`
      : '<p class="text-muted text-sm">Платных операций пока не было.</p>'}
  `;
}

/* ---------------- Настройки ---------------- */

function fillSettings(user) {
  const form = $('#settings-form');
  if (!form) return;
  for (const name of ['name', 'email', 'phone', 'city']) {
    const input = field(form, name);
    if (input) input.value = user[name] || '';
  }
}

async function saveSettings() {
  const form = $('#settings-form');
  const submit = form.querySelector('[type="submit"]');
  setBusy(submit, true, 'Сохраняем…');
  try {
    const data = await authApi.updateMe({
      name: fieldValue(form, 'name').trim(),
      phone: fieldValue(form, 'phone').trim(),
      city: fieldValue(form, 'city').trim(),
    });
    setUser(data.user);
    toast('Профиль обновлён', { type: 'success' });
  } catch (error) {
    toast(error.message, { type: 'error' });
  } finally {
    setBusy(submit, false);
  }
}

async function changePassword() {
  const form = $('#password-form');
  const submit = form.querySelector('[type="submit"]');
  const newPassword = fieldValue(form, 'newPassword');
  if (newPassword !== fieldValue(form, 'newPasswordConfirm')) {
    toast('Новые пароли не совпадают', { type: 'error' });
    return;
  }
  setBusy(submit, true, 'Обновляем…');
  try {
    const data = await authApi.changePassword({
      currentPassword: fieldValue(form, 'currentPassword'),
      newPassword,
    });
    toast(data.message, { type: 'success' });
    form.reset();
  } catch (error) {
    toast(error.message, { type: 'error' });
  } finally {
    setBusy(submit, false);
  }
}

/* ---------------- Вкладки ---------------- */

function switchTab(tab) {
  state.tab = tab;
  $$('[data-tab]').forEach((panel) => {
    panel.hidden = panel.dataset.tab !== tab;
  });
  $$('[data-tab-link]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.tabLink === tab);
    if (link.dataset.tabLink === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  window.history.replaceState({}, '', `#${tab}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- Действия с объявлениями ---------------- */

async function changeListingStatus(id, nextStatus) {
  try {
    await catalogApi.setStatus(id, nextStatus);
    toast(nextStatus === 'sold' ? 'Объявление отмечено проданным' : 'Объявление снова в продаже', { type: 'success' });
    await loadListings();
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

async function deleteListing(id) {
  if (!window.confirm('Удалить объявление безвозвратно? Действие нельзя отменить.')) return;
  try {
    await catalogApi.remove(id);
    toast('Объявление удалено', { type: 'success' });
    await loadListings();
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

/* ---------------- Загрузка данных ---------------- */

async function loadStats() {
  try {
    state.stats = await profileApi.stats();
    renderHero(state.stats.user, state.stats);
    renderStats(state.stats);
    renderChart(state.stats.viewsSeries);
    renderVerification(state.stats.verification);
    fillSettings(state.stats.user);
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

async function loadListings() {
  try {
    const data = await catalogApi.mine();
    state.listings = data.items;
    renderListingTabs();
    const activeTab = document.querySelector('[data-status-filter][aria-selected="true"]')?.dataset.statusFilter || 'all';
    renderListings(activeTab);
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

async function loadFavorites() {
  try {
    const data = await favoritesApi.list();
    state.favorites = data.items;
    renderFavorites();
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

async function loadSearches() {
  try {
    const data = await savedSearchesApi.list();
    state.searches = data.items;
    renderSearches();
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

async function loadBalance() {
  try {
    state.balance = await profileApi.balance();
    renderBalance();
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

/* ---------------- Запуск ---------------- */

async function boot() {
  await requireUser('/profile.html');
  if (!getUser()) return;

  await Promise.all([loadStats(), loadListings(), loadFavorites(), loadSearches(), loadBalance()]);

  const initialTab = window.location.hash.replace('#', '') || 'listings';
  switchTab(['listings', 'favorites', 'messages', 'balance', 'settings'].includes(initialTab) ? initialTab : 'listings');

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-tab-link]');
    if (link) {
      event.preventDefault();
      switchTab(link.dataset.tabLink);
      return;
    }
    const jump = event.target.closest('[data-tab-jump]');
    if (jump) {
      switchTab(jump.dataset.tabJump);
      return;
    }

    const filter = event.target.closest('[data-status-filter]');
    if (filter) {
      $$('[data-status-filter]').forEach((tab) => tab.setAttribute('aria-selected', String(tab === filter)));
      renderListings(filter.dataset.statusFilter);
      return;
    }

    const statusButton = event.target.closest('[data-listing-status]');
    if (statusButton) {
      const row = statusButton.closest('[data-listing-row]');
      const item = state.listings.find((entry) => entry.id === Number(statusButton.dataset.listingStatus));
      changeListingStatus(item.id, item.status === 'sold' ? 'active' : 'sold');
      return;
    }

    const deleteButton = event.target.closest('[data-listing-delete]');
    if (deleteButton) {
      deleteListing(Number(deleteButton.dataset.listingDelete));
      return;
    }

    const searchDelete = event.target.closest('[data-search-delete]');
    if (searchDelete) {
      savedSearchesApi.remove(Number(searchDelete.dataset.searchDelete))
        .then(() => { toast('Поиск удалён', { type: 'success' }); loadSearches(); })
        .catch((error) => toast(error.message, { type: 'error' }));
    }
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('#favorites-grid [data-favorite]');
    if (!button) return;
    event.preventDefault();
    const id = Number(button.dataset.favorite);
    try {
      await favoritesApi.remove(id);
      state.favorites = state.favorites.filter((item) => item.id !== id);
      renderFavorites();
      toast('Удалено из избранного', { type: 'success', timeout: 2200 });
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  });

  $('#settings-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveSettings();
  });

  $('#password-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    changePassword();
  });

  $('#logout-btn')?.addEventListener('click', async () => {
    await logout();
    window.location.href = '/index.html';
  });
}

boot();
