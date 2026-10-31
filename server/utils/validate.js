import { ApiError } from './http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Zа-яА-Я]{2,}$/;
const PHONE_RE = /^\+?[0-9\s()-]{10,18}$/;

export function cleanString(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function assert(condition, message, status = 422, details = null) {
  if (!condition) throw new ApiError(status, message, details);
}

export function validateRegistration({ name, email, password, phone }) {
  const errors = {};
  if (!name || name.length < 2 || name.length > 60) errors.name = 'Укажите имя от 2 до 60 символов';
  if (!email || !EMAIL_RE.test(email)) errors.email = 'Укажите корректный e-mail';
  if (!password || password.length < 8) errors.password = 'Пароль должен быть не короче 8 символов';
  if (password && password.length > 72) errors.password = 'Пароль слишком длинный';
  if (phone && !PHONE_RE.test(phone)) errors.phone = 'Укажите корректный телефон';
  if (Object.keys(errors).length) {
    throw new ApiError(422, 'Проверьте правильность заполнения полей', errors);
  }
}

export function validateListing(payload) {
  const errors = {};
  const title = cleanString(payload.title, 120);
  const description = cleanString(payload.description, 5000);
  const price = Number(payload.price);

  if (title.length < 8) errors.title = 'Заголовок должен содержать минимум 8 символов';
  if (title.length > 90) errors.title = 'Заголовок не должен превышать 90 символов';
  if (description.length < 30) errors.description = 'Описание должно содержать минимум 30 символов';
  if (description.length > 4000) errors.description = 'Описание слишком длинное';
  if (!Number.isFinite(price) || price < 0) errors.price = 'Укажите корректную цену';
  if (price > 1_000_000_000) errors.price = 'Цена слишком большая';
  if (!payload.categoryId) errors.categoryId = 'Выберите категорию';
  if (!payload.locationId) errors.locationId = 'Выберите город';

  const banned = ['запрещённый товар', 'наркотик', 'оружие без лицензии'];
  const haystack = `${title} ${description}`.toLowerCase();
  if (banned.some((word) => haystack.includes(word))) {
    errors.title = 'Объявление нарушает правила площадки и будет отправлено на модерацию';
  }

  if (Object.keys(errors).length) {
    throw new ApiError(422, 'Проверьте объявление перед публикацией', errors);
  }

  return {
    title,
    description,
    price: Math.round(price),
    categoryId: Number(payload.categoryId),
    subcategoryId: payload.subcategoryId ? Number(payload.subcategoryId) : null,
    locationId: Number(payload.locationId),
    condition: payload.condition === 'new' ? 'new' : 'used',
    sellerType: payload.sellerType === 'business' ? 'business' : 'private',
    delivery: payload.delivery === 'true' || payload.delivery === true ? 1 : 0,
    negotiable: payload.negotiable === 'true' || payload.negotiable === true ? 1 : 0,
    pricePeriod: ['', 'hour', 'day', 'month', 'm2'].includes(payload.pricePeriod)
      ? payload.pricePeriod
      : '',
    address: cleanString(payload.address, 200),
    attributes: payload.attributes || '{}',
  };
}
