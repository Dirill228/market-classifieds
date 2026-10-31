// Подача объявления: три шага, drag & drop фото, живой предпросмотр, тарифы.

import { catalogApi, toQuery } from './api.js';
import { icon } from './icons.js';
import {
  $, $$, escapeHtml, field, fieldValue, formatPrice, listingCardMarkup, openModal, setBusy, toast,
} from './ui.js';
import { getUser, requireUser } from './auth.js';
import { mountLayout } from './layout.js';

mountLayout({ pageTitle: 'Подать объявление' });

const MAX_PHOTOS = 10;
const MAX_SIZE = 5 * 1024 * 1024;

const TARIFFS = {
  normal: { title: 'Обычное размещение', price: 0, desc: 'Публикация на 30 дней. Показ в каталоге и поиске.' },
  urgent: { title: 'Срочное объявление', price: 149, desc: 'Метка «Срочно», приоритет в сортировке и блок на главной.' },
  vip: { title: 'VIP-размещение', price: 399, desc: 'Выделение в каталоге на 7 дней, показ в карусели «Рекомендуем».' },
};

const state = {
  step: 1,
  categories: [],
  locations: [],
  files: [],
  previewUrls: [],
  categoryId: null,
  subcategoryId: null,
  tariff: 'normal',
};

/* ---------------- Справочники ---------------- */

async function loadDictionaries() {
  try {
    const [categoriesData, locationsData] = await Promise.all([
      catalogApi.categories(),
      catalogApi.locations(),
    ]);
    state.categories = categoriesData.categories;
    state.locations = locationsData.locations;
  } catch (error) {
    toast('Не удалось загрузить категории и города', { type: 'error' });
  }
}

/* ---------------- Шаг 1: категория ---------------- */

function renderCategories() {
  const container = $('#category-picker');
  if (!container) return;
  container.innerHTML = state.categories
    .map(
      (category) => `
      <button class="category-option" type="button" data-category="${category.id}" aria-pressed="${state.categoryId === category.id}">
        ${icon(category.icon, { size: 17 })}
        <span>${escapeHtml(category.name)}</span>
      </button>`,
    )
    .join('');
}

function renderSubcategories() {
  const wrap = $('#subcategory-wrap');
  const select = $('#subcategory-select');
  if (!wrap || !select) return;

  const category = state.categories.find((item) => item.id === state.categoryId);
  const subs = category?.subcategories || [];
  if (!subs.length) {
    wrap.hidden = true;
    select.innerHTML = '';
    state.subcategoryId = null;
    return;
  }
  wrap.hidden = false;
  select.innerHTML = `<option value="">Не указана</option>${subs
    .map((sub) => `<option value="${sub.id}">${escapeHtml(sub.name)}</option>`)
    .join('')}`;
  select.value = state.subcategoryId ? String(state.subcategoryId) : '';
}

function selectCategory(id) {
  state.categoryId = id;
  state.subcategoryId = null;
  $$('[data-category]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.category) === id));
  });
  renderSubcategories();
  updatePreview();
  validateStep1();
}

/* ---------------- Шаги ---------------- */

function goToStep(step) {
  if (step > state.step && !validateStep(state.step)) return;
  state.step = Math.min(3, Math.max(1, step));

  $('[data-step-panel]').forEach((panel) => {
    panel.hidden = Number(panel.dataset.stepPanel) !== state.step;
  });

  $('[data-step]').forEach((node) => {
    const index = Number(node.dataset.step);
    node.classList.toggle('is-active', index === state.step);
    node.classList.toggle('is-done', index < state.step);
    const num = node.querySelector('.wizard-step__num');
    if (num) num.innerHTML = index < state.step ? icon('check', { size: 13 }) : String(index);
  });

  const progress = $('#wizard-progress');
  if (progress) {
    progress.style.width = `${(state.step / 3) * 100}%`;
    progress.parentElement?.setAttribute('aria-valuenow', String(Math.round((state.step / 3) * 100)));
  }

  $('[data-wizard-back]').forEach((button) => { button.hidden = state.step === 1; });
  $('[data-wizard-next]').forEach((button) => { button.hidden = state.step === 3; });
  $('[data-wizard-submit]').forEach((button) => { button.hidden = state.step !== 3; });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- Валидация ---------------- */

function fieldError(name, message) {
  const field = document.querySelector(`[data-field="${name}"]`);
  const error = field?.querySelector('.field__error span');
  if (field) field.classList.toggle('has-error', Boolean(message));
  if (error) error.textContent = message || '';
}

function clearErrors(form) {
  form?.querySelectorAll('.field').forEach((field) => field.classList.remove('has-error'));
}

function validateStep1() {
  if (!state.categoryId) {
    fieldError('category', 'Выберите категорию');
    return false;
  }
  fieldError('category', '');
  return true;
}

function validateStep2() {
  const form = $('#step-2');
  clearErrors(form);
  let ok = true;

  const title = fieldValue(form, 'title').trim();
  const price = fieldValue(form, 'price').trim();
  const description = fieldValue(form, 'description').trim();
  const locationId = fieldValue(form, 'locationId');

  if (title.length < 8) {
    fieldError('title', 'Заголовок должен содержать минимум 8 символов');
    ok = false;
  } else if (title.length > 90) {
    fieldError('title', 'Заголовок не должен превышать 90 символов');
    ok = false;
  }

  if (!price || Number(price) < 0) {
    fieldError('price', 'Укажите цену (0 для «бесплатно»)');
    ok = false;
  }

  if (description.length < 30) {
    fieldError('description', 'Опишите товар подробнее — минимум 30 символов');
    ok = false;
  }

  if (!locationId) {
    fieldError('locationId', 'Выберите город');
    ok = false;
  }

  return ok;
}

function validateStep3() {
  const form = $('#step-3');
  clearErrors(form);
  let ok = true;
  if (!getUser()) {
    toast('Войдите, чтобы опубликовать объявление', { type: 'info' });
    document.querySelector('[data-auth-open="login"]')?.click();
    ok = false;
  }
  const agree = form.querySelector('input[name="agree"]');
  if (agree && !agree.checked) {
    toast('Подтвердите согласие с правилами публикации', { type: 'error' });
    ok = false;
  }
  return ok;
}

function validateStep(step) {
  if (step === 1) return validateStep1();
  if (step === 2) return validateStep2();
  return validateStep3();
}

/* ---------------- Фото ---------------- */

function renderPhotos() {
  const grid = $('#photo-grid');
  if (!grid) return;
  grid.innerHTML = state.previewUrls
    .map(
      (url, index) => `
      <div class="photo-item">
        <img src="${url}" alt="Фото ${index + 1}">
        ${index === 0 ? '<span class="photo-item__main">Главное</span>' : ''}
        <button class="photo-item__remove" type="button" data-photo-remove="${index}" aria-label="Удалить фото ${index + 1}">
          ${icon('x', { size: 12 })}
        </button>
      </div>`,
    )
    .join('');

  const counter = $('#photo-counter');
  if (counter) counter.textContent = `${state.files.length} / ${MAX_PHOTOS}`;

  const dropzone = $('#dropzone');
  if (dropzone) dropzone.hidden = state.files.length >= MAX_PHOTOS;
}

function addFiles(fileList) {
  const files = Array.from(fileList);
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];

  for (const file of files) {
    if (state.files.length >= MAX_PHOTOS) {
      toast(`Можно загрузить не больше ${MAX_PHOTOS} фотографий`, { type: 'error' });
      break;
    }
    if (!allowed.includes(file.type)) {
      toast(`Формат ${file.name.split('.').pop().toUpperCase()} не поддерживается. Используйте JPG, PNG или WebP.`, { type: 'error' });
      continue;
    }
    if (file.size > MAX_SIZE) {
      toast(`Файл «${file.name}» больше 5 МБ`, { type: 'error' });
      continue;
    }
    state.files.push(file);
    state.previewUrls.push(URL.createObjectURL(file));
  }
  renderPhotos();
  updatePreview();
}

function removePhoto(index) {
  const [url] = state.previewUrls.splice(index, 1);
  if (url) URL.revokeObjectURL(url);
  state.files.splice(index, 1);
  renderPhotos();
  updatePreview();
}

function initDropzone() {
  const dropzone = $('#dropzone');
  const input = $('#photo-input');
  if (!dropzone || !input) return;

  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });

  input.addEventListener('change', () => {
    addFiles(input.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });

  dropzone.addEventListener('drop', (event) => {
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  });

  document.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-photo-remove]');
    if (remove) removePhoto(Number(remove.dataset.photoRemove));
  });
}

/* ---------------- Предпросмотр ---------------- */

function updatePreview() {
  const container = $('#preview-listing');
  if (!container) return;

  const form = $('#step-2');
  const title = fieldValue(form, 'title').trim() || 'Заголовок объявления появится здесь';
  const price = Number(fieldValue(form, 'price') || 0);
  const description = fieldValue(form, 'description').trim();
  const locationId = Number(fieldValue(form, 'locationId') || 0);
  const category = state.categories.find((item) => item.id === state.categoryId);
  const location = state.locations.find((item) => item.id === locationId);

  const listing = {
    id: 0,
    title,
    price,
    pricePeriod: fieldValue(form, 'pricePeriod'),
    description,
    condition: fieldValue(form, 'condition') || 'used',
    isUrgent: state.tariff !== 'normal',
    promotedUntil: state.tariff === 'vip' ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
    isFavorite: false,
    images: state.previewUrls.length ? [{ url: state.previewUrls[0], alt: title }] : [],
    category: { name: category?.name || 'Категория', icon: category?.icon || 'grid' },
    location: { name: location?.name || 'Город' },
    seller: { name: getUser()?.name || 'Вы', avatar: getUser()?.avatar || '', verified: Boolean(getUser()?.verified) },
  };

  const card = listingCardMarkup(listing, { compact: true, eager: true });
  container.innerHTML = card.replace(/href="\/listing\.html\?id=0"/g, 'href="#"').replace(/data-favorite="0"/, '');

  const completeness = [
    state.categoryId,
    title.length >= 8,
    price > 0,
    description.length >= 30,
    locationId,
    state.files.length > 0,
  ].filter(Boolean).length;
  const percent = Math.round((completeness / 6) * 100);
  const bar = $('#preview-progress');
  if (bar) {
    bar.style.width = `${percent}%`;
    bar.parentElement?.setAttribute('aria-valuenow', String(percent));
  }
  const label = $('#preview-progress-label');
  if (label) label.textContent = `${percent}%`;
}

/* ---------------- Тарифы ---------------- */

function renderTariffs() {
  const container = $('#tariff-list');
  if (!container) return;
  container.innerHTML = Object.entries(TARIFFS)
    .map(
      ([key, tariff]) => `
      <label class="tariff">
        <input type="radio" name="tariff" value="${key}" ${state.tariff === key ? 'checked' : ''}>
        <span class="tariff__body">
          <span class="tariff__title">${escapeHtml(tariff.title)}${key === 'normal' ? '<span class="badge badge--soft">Бесплатно</span>' : ''}</span>
          <span class="tariff__desc">${escapeHtml(tariff.desc)}</span>
        </span>
        <span class="tariff__price">${tariff.price ? formatPrice(tariff.price) : '0 ₽'}</span>
      </label>`,
    )
    .join('');
}

/* ---------------- Публикация ---------------- */

function buildFormData() {
  const form2 = $('#step-2');
  const form3 = $('#step-3');
  const data = new FormData();

  data.append('title', fieldValue(form2, 'title').trim());
  data.append('description', fieldValue(form2, 'description').trim());
  data.append('price', fieldValue(form2, 'price').trim() || '0');
  data.append('pricePeriod', fieldValue(form2, 'pricePeriod'));
  data.append('condition', fieldValue(form2, 'condition') || 'used');
  data.append('sellerType', fieldValue(form3, 'sellerType') || 'private');
  data.append('locationId', fieldValue(form2, 'locationId'));
  data.append('categoryId', String(state.categoryId));
  if (state.subcategoryId) data.append('subcategoryId', String(state.subcategoryId));
  data.append('delivery', field(form2, 'delivery')?.checked ? 'true' : 'false');
  data.append('negotiable', field(form2, 'negotiable')?.checked ? 'true' : 'false');
  data.append('address', fieldValue(form2, 'address').trim());
  data.append('tariff', state.tariff);

  const attributes = {};
  $$('[data-attr]').forEach((input) => {
    const value = input.value.trim();
    if (value) attributes[input.dataset.attr] = value;
  });
  data.append('attributes', JSON.stringify(attributes));

  state.files.forEach((file) => data.append('images', file));

  return data;
}

async function publish() {
  if (!validateStep1() || !validateStep2() || !validateStep3()) return;
  if (!requireUser('/create.html')) return;

  const submit = document.querySelector('[data-wizard-submit]');
  setBusy(submit, true, 'Публикуем…');

  try {
    const data = await catalogApi.create(buildFormData());
    const listing = data.listing;
    state.files.forEach((_, index) => URL.revokeObjectURL(state.previewUrls[index]));

    const successId = $('#success-listing');
    if (successId) {
      successId.innerHTML = `
        <div class="row row-3">
          ${listing.images?.[0] ? `<img src="${escapeHtml(listing.images[0].url)}" alt="" width="56" height="56" style="width:56px;height:56px;border-radius:10px;object-fit:cover">` : ''}
          <div>
            <div class="fw-600">${escapeHtml(listing.title)}</div>
            <div class="text-sm text-muted">${formatPrice(listing.price)} · ${escapeHtml(listing.location.name)}</div>
          </div>
        </div>`;
    }
    const successLink = $('#success-link');
    if (successLink) successLink.href = `/listing.html?id=${listing.id}`;

    openModal('success-modal');
  } catch (error) {
    if (error.details) {
      for (const [key, message] of Object.entries(error.details)) {
        fieldError(key, message);
      }
    }
    toast(error.message, { type: 'error', timeout: 6000 });
  } finally {
    setBusy(submit, false);
  }
}

/* ---------------- Атрибуты по категории ---------------- */

const CATEGORY_ATTRS = {
  1: [['Марка', 'Марка'], ['Модель', 'Модель'], ['Год', 'Год выпуска'], ['Пробег', 'Пробег']],
  2: [['Площадь', 'Площадь'], ['Этаж', 'Этаж'], ['Количество комнат', 'Количество комнат'], ['Тип дома', 'Тип дома']],
  3: [['Бренд', 'Бренд'], ['Модель', 'Модель'], ['Память', 'Память'], ['Состояние', 'Состояние']],
  4: [['Тип занятости', 'Тип занятости'], ['Опыт', 'Опыт работы'], ['Формат', 'Формат работы'], ['Оклад', 'Оклад']],
  5: [['Опыт работы', 'Опыт работы'], ['Срок', 'Срок выполнения'], ['Выезд', 'Выезд']],
  6: [['Бренд', 'Бренд'], ['Размер', 'Размер'], ['Материал', 'Материал']],
  7: [['Порода', 'Порода'], ['Возраст', 'Возраст'], ['Документы', 'Документы']],
  8: [['Бренд', 'Бренд'], ['Модель', 'Модель'], ['Состояние', 'Состояние']],
  9: [['Марка', 'Марка'], ['Модель', 'Модель'], ['Год', 'Год выпуска'], ['Пробег', 'Пробег']],
  10: [['Площадь', 'Площадь'], ['Срок аренды', 'Срок аренды'], ['Комиссия', 'Комиссия']],
  11: [['Опыт работы', 'Опыт работы'], ['Цена за м²', 'Цена за м²'], ['Гарантия', 'Гарантия']],
  12: [['Предмет', 'Предмет'], ['Опыт работы', 'Опыт работы'], ['Формат', 'Формат занятий']],
};

function renderAttributes() {
  const wrap = $('#attributes-wrap');
  const container = $('#attributes-grid');
  if (!wrap || !container) return;
  const attrs = CATEGORY_ATTRS[state.categoryId];
  if (!attrs) {
    wrap.hidden = true;
    container.innerHTML = '';
    return;
  }
  wrap.hidden = false;
  container.innerHTML = attrs
    .map(
      ([label, key]) => `
      <div class="field">
        <label class="field__label" for="attr-${key}">${escapeHtml(label)}</label>
        <input class="input" id="attr-${key}" type="text" data-attr="${escapeHtml(key)}" placeholder="${escapeHtml(label)}">
      </div>`,
    )
    .join('');
}

/* ---------------- Запуск ---------------- */

async function boot() {
  await loadDictionaries();

  renderCategories();
  renderTariffs();

  const locationSelect = $('#location-select');
  if (locationSelect) {
    locationSelect.innerHTML = `<option value="">Выберите город</option>${state.locations
      .map((location) => `<option value="${location.id}">${escapeHtml(location.name)} · ${escapeHtml(location.region)}</option>`)
      .join('')}`;
  }

  renderPhotos();
  initDropzone();
  goToStep(1);

  $('#category-picker')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    selectCategory(Number(button.dataset.category));
    renderAttributes();
  });

  $('#subcategory-select')?.addEventListener('change', (event) => {
    state.subcategoryId = event.target.value ? Number(event.target.value) : null;
  });

  document.querySelectorAll('[data-wizard-next]').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.step === 1 && !validateStep1()) return;
      if (state.step === 2 && !validateStep2()) return;
      goToStep(state.step + 1);
    });
  });

  document.querySelectorAll('[data-wizard-back]').forEach((button) => {
    button.addEventListener('click', () => goToStep(state.step - 1));
  });

  document.querySelectorAll('[data-wizard-submit]').forEach((button) => {
    button.addEventListener('click', publish);
  });
  $('#step-2')?.addEventListener('input', updatePreview);
  $('#step-2')?.addEventListener('change', updatePreview);

  $('#tariff-list')?.addEventListener('change', (event) => {
    const input = event.target.closest('input[name="tariff"]');
    if (!input) return;
    state.tariff = input.value;
    updatePreview();
  });

  document.querySelectorAll('[data-step-jump]').forEach((button) => {
    button.addEventListener('click', () => goToStep(Number(button.dataset.stepJump)));
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('category')) {
    const category = state.categories.find((item) => item.slug === params.get('category'));
    if (category) {
      selectCategory(category.id);
      renderAttributes();
      goToStep(2);
    }
  }

  updatePreview();
}

boot();
