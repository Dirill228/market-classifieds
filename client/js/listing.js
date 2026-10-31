// Страница объявления: галерея, лайтбокс, телефон, избранное, чат, жалоба.

import { catalogApi, chatApi, favoritesApi } from './api.js';
import { icon } from './icons.js';
import {
  $, $$, declension, escapeHtml, formatDate, formatPhone, formatPrice, initReadMore,
  listingCardMarkup, openModal, closeModal, periodLabel, relativeTime, setBusy, toast,
  syncFavoriteButton,
} from './ui.js';
import { getUser } from './auth.js';
import { mountLayout } from './layout.js';

mountLayout({ pageTitle: 'Объявление' });

const state = { listing: null, galleryIndex: 0, similar: [] };

const params = new URLSearchParams(window.location.search);
const listingId = Number(params.get('id'));

/* ---------------- Галерея ---------------- */

function renderGallery(listing) {
  const container = $('#gallery');
  if (!container) return;
  const images = listing.images?.length
    ? listing.images
    : [{ url: '', alt: listing.title }];

  container.innerHTML = `
    <div class="gallery__main" data-lightbox-open role="button" tabindex="0" aria-label="Открыть фотографию на весь экран">
      ${images[0].url
        ? `<img id="gallery-image" src="${escapeHtml(images[0].url)}" alt="${escapeHtml(images[0].alt || listing.title)}" width="960" height="600">`
        : `<span class="listing-card__placeholder">${icon(listing.category.icon, { size: 44 })}</span>`}
      ${images.length > 1 ? `<span class="gallery__counter" id="gallery-counter">1 / ${images.length}</span>` : ''}
      ${images.length > 1
        ? `<button class="gallery__nav gallery__nav--prev" type="button" data-gallery-prev aria-label="Предыдущее фото">${icon('chevron-left', { size: 17 })}</button>
           <button class="gallery__nav gallery__nav--next" type="button" data-gallery-next aria-label="Следующее фото">${icon('chevron-right', { size: 17 })}</button>`
        : ''}
    </div>
    ${images.length > 1
      ? `<div class="gallery__thumbs" role="tablist" aria-label="Миниатюры">
          ${images
            .map(
              (image, index) => `
            <button class="gallery__thumb" type="button" data-gallery-thumb="${index}" aria-current="${index === 0}" role="tab" aria-label="Фото ${index + 1}">
              <img src="${escapeHtml(image.url)}" alt="" loading="lazy" width="84" height="62">
            </button>`,
            )
            .join('')}
        </div>`
      : ''}
  `;

  state.galleryIndex = 0;

  container.addEventListener('click', (event) => {
    const prev = event.target.closest('[data-gallery-prev]');
    const next = event.target.closest('[data-gallery-next]');
    const thumb = event.target.closest('[data-gallery-thumb]');
    const main = event.target.closest('[data-lightbox-open]');

    if (prev) return setGalleryIndex(state.galleryIndex - 1);
    if (next) return setGalleryIndex(state.galleryIndex + 1);
    if (thumb) return setGalleryIndex(Number(thumb.dataset.galleryThumb));
    if (main) return openLightbox(state.galleryIndex);
  });

  container.querySelector('[data-lightbox-open]')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openLightbox(state.galleryIndex);
    }
  });
}

function setGalleryIndex(index) {
  const listing = state.listing;
  if (!listing?.images?.length) return;
  const total = listing.images.length;
  const next = (index + total) % total;
  state.galleryIndex = next;

  const image = $('#gallery-image');
  if (image) image.src = listing.images[next].url;
  const counter = $('#gallery-counter');
  if (counter) counter.textContent = `${next + 1} / ${total}`;

  $$('[data-gallery-thumb]').forEach((thumb) => {
    thumb.setAttribute('aria-current', String(Number(thumb.dataset.galleryThumb) === next));
  });
  updateLightbox();
}

/* ---------------- Лайтбокс ---------------- */

function openLightbox(index) {
  const listing = state.listing;
  if (!listing?.images?.length) return;
  const lightbox = $('#lightbox');
  if (!lightbox) return;
  state.galleryIndex = index;
  lightbox.classList.add('is-open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-locked');
  updateLightbox();
}

function updateLightbox() {
  const listing = state.listing;
  const lightbox = $('#lightbox');
  if (!listing?.images?.length || !lightbox) return;
  const image = lightbox.querySelector('img');
  const counter = lightbox.querySelector('.lightbox__counter');
  if (image) {
    image.src = listing.images[state.galleryIndex].url;
    image.alt = listing.images[state.galleryIndex].alt || listing.title;
  }
  if (counter) counter.textContent = `${state.galleryIndex + 1} / ${listing.images.length}`;
}

function initLightbox() {
  const lightbox = $('#lightbox');
  if (!lightbox) return;

  const close = () => {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
  };

  lightbox.querySelector('[data-lightbox-close]')?.addEventListener('click', close);
  lightbox.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => setGalleryIndex(state.galleryIndex - 1));
  lightbox.querySelector('[data-lightbox-next]')?.addEventListener('click', () => setGalleryIndex(state.galleryIndex + 1));
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) close();
  });

  document.addEventListener('keydown', (event) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') setGalleryIndex(state.galleryIndex - 1);
    if (event.key === 'ArrowRight') setGalleryIndex(state.galleryIndex + 1);
  });
}

/* ---------------- Заголовок ---------------- */

function renderHead(listing) {
  const container = $('#listing-head');
  if (!container) return;

  const badges = [];
  if (listing.isUrgent) badges.push(`<span class="badge badge--urgent">${icon('clock', { size: 11 })}Срочное</span>`);
  if (listing.promotedUntil) badges.push(`<span class="badge badge--vip">${icon('star', { size: 11 })}VIP-размещение</span>`);
  if (listing.condition === 'new') badges.push('<span class="badge badge--new">Новое</span>');
  if (listing.delivery) badges.push('<span class="badge badge--soft">Доставка</span>');

  container.innerHTML = `
    <div class="listing-head__badges">${badges.join('')}</div>
    <h1>${escapeHtml(listing.title)}</h1>
    <div class="listing-head__meta">
      <span>${icon('map-pin', { size: 14 })}${escapeHtml(listing.location.name)}${listing.address ? `, ${escapeHtml(listing.address)}` : ''}</span>
      <span>${icon('clock', { size: 14 })}${relativeTime(listing.createdAt)}</span>
      <span>${icon('eye', { size: 14 })}${declension(listing.views, ['просмотр', 'просмотра', 'просмотров'])}</span>
      <span>${icon('grid', { size: 14 })}${escapeHtml(listing.category.name)}${listing.subcategory ? ` · ${escapeHtml(listing.subcategory.name)}` : ''}</span>
    </div>
  `;
}

/* ---------------- Описание и характеристики ---------------- */

function renderDescription(listing) {
  const node = $('#listing-description');
  if (!node) return;
  node.textContent = listing.description;
  if (listing.description.length > 420) {
    node.classList.add('is-collapsed');
    $('#description-toggle')?.removeAttribute('hidden');
  }
}

function renderSpecs(listing) {
  const node = $('#listing-specs');
  if (!node) return;

  const rows = [
    ['Категория', listing.subcategory ? `${listing.category.name} · ${listing.subcategory.name}` : listing.category.name],
    ['Состояние', listing.condition === 'new' ? 'Новое' : 'Б/у'],
    ['Продавец', listing.sellerType === 'business' ? 'Компания' : 'Частное лицо'],
    ['Город', listing.location.name],
    ...(listing.address ? [['Адрес', listing.address]] : []),
    ['Доставка', listing.delivery ? 'Возможна' : 'Самовывоз'],
    ['Торг', listing.negotiable ? 'Возможен' : 'Без торга'],
    ...Object.entries(listing.attributes || {}),
  ];

  node.innerHTML = rows
    .map(([key, value]) => `<div class="spec-table__row"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('');
}

/* ---------------- Цена и действия ---------------- */

function renderPriceCard(listing) {
  const container = $('#listing-side');
  if (!container) return;
  const period = periodLabel(listing.pricePeriod);
  const isOwn = getUser()?.id === listing.seller.id;

  container.innerHTML = `
    <div class="price-card">
      <div class="price-card__value">${formatPrice(listing.price)}${period ? ` <small>${period}</small>` : ''}</div>
      <div class="price-card__note">
        ${listing.negotiable ? 'Торг уместен' : 'Цена окончательная'}
        ${listing.pricePeriod === 'month' ? ' · коммунальные по договорённости' : ''}
      </div>

      <div class="price-card__actions">
        ${isOwn
          ? `<a class="btn btn--primary btn--block" href="/profile.html">${icon('edit', { size: 17 })}Редактировать объявление</a>`
          : `<button class="btn btn--primary btn--block" type="button" data-write-message>${icon('message', { size: 17 })}Написать продавцу</button>
             <button class="price-card__phone" type="button" data-reveal-phone>
               ${icon('phone', { size: 17 })}<span>Показать телефон</span>
             </button>`}
        <button class="btn btn--outline btn--block${listing.isFavorite ? ' is-active' : ''}" type="button"
          data-favorite="${listing.id}" aria-pressed="${listing.isFavorite}">
          ${icon('heart', { size: 17 })}<span>${listing.isFavorite ? 'В избранном' : 'В избранное'}</span>
        </button>
      </div>

      <div class="price-card__safety">
        ${icon('shield-check', { size: 15 })}
        <span>Не переводите предоплату до встречи. Проверяйте товар и документы лично — так безопаснее.</span>
      </div>
    </div>

    <div class="seller-card">
      <div class="seller-card__top">
        ${listing.seller.avatar
          ? `<span class="avatar avatar--lg"><img src="${escapeHtml(listing.seller.avatar)}" alt="" width="56" height="56"></span>`
          : `<span class="avatar avatar--lg">${escapeHtml((listing.seller.name || '').slice(0, 1))}</span>`}
        <div class="grow">
          <div class="seller-card__name">
            ${escapeHtml(listing.seller.name)}
            ${listing.seller.verified ? icon('shield-check', { size: 15 }) : ''}
          </div>
          <div class="seller-card__sub">${listing.sellerType === 'business' ? 'Компания' : 'Частное лицо'} · на Маркете с ${formatDate(listing.seller.registeredAt)}</div>
          <div class="rating" style="margin-top:6px">
            ${icon('star', { size: 14 })}
            ${listing.seller.rating.toFixed(1)}
            <span>· ${declension(listing.seller.reviewsCount, ['отзыв', 'отзыва', 'отзывов'])}</span>
          </div>
        </div>
      </div>

      <div class="seller-card__stats">
        <div class="seller-card__stat">
          <strong>${declension(listing.sellerStats?.activeListings ?? 1, ['объявление', 'объявления', 'объявлений']).split(' ')[0]}</strong>
          <span>активных</span>
        </div>
        <div class="seller-card__stat">
          <strong>${listing.seller.rating.toFixed(1)}</strong>
          <span>рейтинг</span>
        </div>
        <div class="seller-card__stat">
          <strong>${listing.seller.reviewsCount}</strong>
          <span>отзывов</span>
        </div>
      </div>

      <div class="stack stack-2 mt-4">
        <a class="btn btn--outline btn--block btn--sm" href="/catalog.html?sellerId=${listing.seller.id}">Все объявления продавца</a>
        <button class="btn btn--ghost btn--block btn--sm" type="button" data-report>${icon('flag', { size: 15 })}Пожаловаться</button>
      </div>
    </div>
  `;
}

/* ---------------- Похожие ---------------- */

function renderSimilar(items) {
  const grid = $('#similar-grid');
  if (!grid) return;
  if (!items.length) {
    grid.closest('section')?.remove();
    return;
  }
  state.similar = items;
  grid.innerHTML = items.map((item) => listingCardMarkup(item)).join('');
}

/* ---------------- Карта ---------------- */

function renderMap(listing) {
  const node = $('#listing-map');
  if (!node) return;
  node.innerHTML = `
    <div class="map-card">
      <div class="map-card__pin">
        ${icon('map-pin', { size: 30 })}
        <span class="map-card__label">${escapeHtml(listing.location.name)}${listing.address ? ` · ${escapeHtml(listing.address)}` : ''}</span>
      </div>
      <span class="map-card__hint">Точный адрес продавец сообщит в переписке</span>
    </div>
  `;
}

/* ---------------- Хлебные крошки ---------------- */

function renderBreadcrumbs(listing) {
  const node = $('#breadcrumbs');
  if (!node) return;
  node.innerHTML = `
    <a href="/index.html">Главная</a>
    ${icon('chevron-right', { size: 14 })}
    <a href="/catalog.html">Каталог</a>
    ${icon('chevron-right', { size: 14 })}
    <a href="/catalog.html?category=${listing.category.slug}">${escapeHtml(listing.category.name)}</a>
    ${icon('chevron-right', { size: 14 })}
    <span aria-current="page">${escapeHtml(listing.title.slice(0, 60))}${listing.title.length > 60 ? '…' : ''}</span>
  `;
}

/* ---------------- Действия ---------------- */

async function revealPhone(button) {
  if (!getUser()) {
    toast('Войдите, чтобы увидеть телефон продавца', { type: 'info' });
    document.querySelector('[data-auth-open="login"]')?.click();
    return;
  }
  setBusy(button, true, 'Загружаем…');
  try {
    const data = await catalogApi.phone(state.listing.id);
    button.classList.add('is-revealed');
    button.innerHTML = `${icon('phone', { size: 17 })}<span>${escapeHtml(formatPhone(data.phone))}</span>`;
    button.disabled = false;
  } catch (error) {
    toast(error.message, { type: 'error' });
    setBusy(button, false);
  }
}

function openMessageModal() {
  if (!getUser()) {
    toast('Войдите, чтобы написать продавцу', { type: 'info' });
    document.querySelector('[data-auth-open="login"]')?.click();
    return;
  }
  const listing = state.listing;
  const preview = $('#message-modal-listing');
  if (preview) {
    preview.innerHTML = `
      ${listing.images?.[0] ? `<img src="${escapeHtml(listing.images[0].url)}" alt="" width="48" height="48" style="width:48px;height:48px;border-radius:8px;object-fit:cover;flex:none">` : ''}
      <div>
        <div class="fw-600 text-sm">${escapeHtml(listing.title)}</div>
        <div class="text-xs text-muted">${formatPrice(listing.price)} · ${escapeHtml(listing.location.name)}</div>
      </div>
    `;
  }
  const textarea = $('#message-text');
  if (textarea && !textarea.value) {
    textarea.value = `Здравствуйте! Интересует «${listing.title}». Подскажите, актуально?`;
  }
  openModal('message-modal');
}

async function sendMessage() {
  const textarea = $('#message-text');
  const submit = $('#message-send');
  const message = textarea?.value.trim();
  if (!message) {
    toast('Напишите сообщение', { type: 'error' });
    return;
  }
  setBusy(submit, true, 'Отправляем…');
  try {
    const data = await chatApi.start(state.listing.id, message);
    closeModal('message-modal');
    toast('Сообщение отправлено', { type: 'success' });
    setTimeout(() => {
      window.location.href = `/messages.html?c=${data.id}`;
    }, 500);
  } catch (error) {
    toast(error.message, { type: 'error' });
  } finally {
    setBusy(submit, false);
  }
}

function openReportModal() {
  const form = $('#report-form');
  form?.reset();
  openModal('report-modal');
}

async function submitReport() {
  const form = $('#report-form');
  const submit = $('#report-submit');
  const reason = form?.reason?.value;
  const comment = form?.comment?.value || '';
  if (!reason) {
    toast('Выберите причину жалобы', { type: 'error' });
    return;
  }
  setBusy(submit, true, 'Отправляем…');
  try {
    const data = await catalogApi.report(state.listing.id, { reason, comment });
    closeModal('report-modal');
    toast(data.message, { type: 'success', timeout: 6000 });
  } catch (error) {
    toast(error.message, { type: 'error' });
  } finally {
    setBusy(submit, false);
  }
}

async function toggleFavorite(button) {
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
    const label = button.querySelector('span');
    if (label) label.textContent = !active ? 'В избранном' : 'В избранное';
    toast(active ? 'Удалено из избранного' : 'Сохранено в избранное', { type: 'success', timeout: 2400 });
  } catch (error) {
    toast(error.message, { type: 'error' });
  } finally {
    button.disabled = false;
  }
}

/* ---------------- Загрузка ---------------- */

async function boot() {
  if (!listingId) {
    window.location.replace('/404.html');
    return;
  }

  initLightbox();

  try {
    const data = await catalogApi.listing(listingId);
    state.listing = data.listing;
    const listing = data.listing;

    document.title = `${listing.title} — Маркет`;
    renderBreadcrumbs(listing);
    renderGallery(listing);
    renderHead(listing);
    renderDescription(listing);
    renderSpecs(listing);
    renderPriceCard({ ...listing, sellerStats: data.sellerStats });
    renderMap(listing);

    $('#listing-side')?.addEventListener('click', (event) => {
      const phoneBtn = event.target.closest('[data-reveal-phone]');
      if (phoneBtn) revealPhone(phoneBtn);
      const writeBtn = event.target.closest('[data-write-message]');
      if (writeBtn) openMessageModal();
      const favBtn = event.target.closest('[data-favorite]');
      if (favBtn) toggleFavorite(favBtn);
      if (event.target.closest('[data-report]')) openReportModal();
    });

    $('#message-send')?.addEventListener('click', sendMessage);
    $('#report-submit')?.addEventListener('click', submitReport);

    initReadMore();

    catalogApi.similar(listingId).then((similar) => {
      renderSimilar(similar.items);
      document.addEventListener('click', async (event) => {
        const button = event.target.closest('#similar-grid [data-favorite]');
        if (!button) return;
        event.preventDefault();
        await toggleFavorite(button);
      });
    }).catch(() => {});
  } catch (error) {
    const main = document.querySelector('main');
    if (main) {
      main.innerHTML = `
        <div class="container">
          <div class="error-page">
            <div class="error-page__code">404</div>
            <h1>Объявление не найдено</h1>
            <p>${escapeHtml(error.message)}. Возможно, продавец снял его с публикации или оно было заблокировано модератором.</p>
            <div class="error-page__actions">
              <a class="btn btn--primary" href="/catalog.html">Перейти в каталог</a>
              <a class="btn btn--outline" href="/index.html">На главную</a>
            </div>
          </div>
        </div>`;
    }
  }
}

boot();
