// Управление сессией: вход, регистрация, восстановление пароля, состояние шапки.

import { api, authApi, clearSession, getCachedUser, setSession } from './api.js';
import { $$, escapeHtml, field, formatPhone, initials, openModal, closeModal, setBusy, toast } from './ui.js';
import { icon } from './icons.js';

let currentUser = getCachedUser();
let readyPromise = null;

export function getUser() {
  return currentUser;
}

export function isAuthed() {
  return Boolean(currentUser);
}

function emit() {
  document.dispatchEvent(new CustomEvent('auth:change', { detail: { user: currentUser } }));
  renderAuthZone();
}

export function setUser(user) {
  currentUser = user;
  emit();
}

/* ---------------- Инициализация ---------------- */

export function initAuth() {
  if (readyPromise) return readyPromise;
  renderAuthZone();
  readyPromise = (async () => {
    try {
      const data = await authApi.me();
      currentUser = data.user;
      setSession({ accessToken: null, user: data.user });
    } catch {
      try {
        await api.refresh();
        const data = await authApi.me();
        currentUser = data.user;
        setSession({ accessToken: null, user: data.user });
      } catch {
        currentUser = null;
        clearSession();
      }
    }
    emit();
    return currentUser;
  })();
  return readyPromise;
}

export function whenAuthReady() {
  return initAuth();
}

/* ---------------- Действия ---------------- */

export async function login(email, password) {
  const data = await authApi.login(email, password);
  setSession(data);
  currentUser = data.user;
  emit();
  return data.user;
}

export async function register(payload) {
  const data = await authApi.register(payload);
  setSession(data);
  currentUser = data.user;
  emit();
  return data.user;
}

export async function logout() {
  try {
    await authApi.logout();
  } catch {
    /* сессии уже нет — это нормально */
  }
  clearSession();
  currentUser = null;
  emit();
  toast('Вы вышли из аккаунта', { type: 'info' });
}

export function requireUser(returnTo = window.location.pathname + window.location.search) {
  if (currentUser) return true;
  const url = new URL('/index.html', window.location.origin);
  url.searchParams.set('auth', 'login');
  url.searchParams.set('next', returnTo);
  window.location.href = url.toString();
  return false;
}

/* ---------------- Шапка ---------------- */

function renderAuthZone() {
  const zone = document.getElementById('auth-zone');
  if (zone) zone.innerHTML = currentUser ? userMenuMarkup(currentUser) : guestMarkup();

  const mobileZone = document.getElementById('auth-zone-mobile');
  if (mobileZone) {
    mobileZone.innerHTML = currentUser
      ? `<a class="btn btn--outline btn--block" href="/profile.html">${icon('user', { size: 16 })}Личный кабинет</a>`
      : `<button class="btn btn--outline btn--block" type="button" data-auth-open="login">${icon('login', { size: 16 })}Войти</button>`;
  }

  updateUnreadBadge();
}

function guestMarkup() {
  return `
    <button class="btn btn--ghost btn--sm" type="button" data-auth-open="login">Войти</button>
    <a class="btn btn--outline btn--sm header-cta" href="/create.html">${icon('plus', { size: 16 })}Разместить</a>
  `;
}

function userMenuMarkup(user) {
  const avatar = user.avatar
    ? `<span class="avatar"><img src="${escapeHtml(user.avatar)}" alt="" width="28" height="28"></span>`
    : `<span class="avatar" aria-hidden="true">${escapeHtml(initials(user.name))}</span>`;

  return `
    <div class="user-menu">
      <button class="user-menu__trigger" type="button" data-user-menu-toggle aria-expanded="false" aria-haspopup="true">
        ${avatar}
        <span class="user-menu__name">${escapeHtml(user.name.split(' ')[0])}</span>
        <span class="user-menu__chevron">${icon('chevron-down', { size: 14 })}</span>
      </button>
      <div class="user-menu__panel" data-user-menu-panel role="menu">
        <div class="user-menu__head">
          <div class="fw-600">${escapeHtml(user.name)}</div>
          <div class="text-xs text-muted truncate">${escapeHtml(user.email || '')}</div>
        </div>
        <a href="/profile.html" role="menuitem">${icon('list', { size: 17 })}Мои объявления</a>
        <a href="/profile.html#favorites" role="menuitem">${icon('heart', { size: 17 })}Избранное</a>
        <a href="/messages.html" role="menuitem">${icon('message', { size: 17 })}Сообщения<span class="icon-btn__badge" data-unread-badge hidden>0</span></a>
        <a href="/profile.html#balance" role="menuitem">${icon('wallet', { size: 17 })}Баланс</a>
        <a href="/profile.html#settings" role="menuitem">${icon('settings', { size: 17 })}Настройки</a>
        <div class="user-menu__sep"></div>
        <button type="button" class="is-danger" data-auth-logout role="menuitem">${icon('logout', { size: 17 })}Выйти</button>
      </div>
    </div>
  `;
}

/* ---------------- Бейдж непрочитанных ---------------- */

export async function updateUnreadBadge() {
  if (!currentUser) {
    $$('[data-unread-badge]').forEach((node) => { node.hidden = true; });
    return;
  }
  try {
    const { unread } = await api.get('/messages/unread-count');
    $$('[data-unread-badge]').forEach((node) => {
      node.textContent = unread > 99 ? '99+' : String(unread);
      node.hidden = unread === 0;
    });
  } catch {
    /* тихо игнорируем */
  }
}

/* ---------------- Модальные окна авторизации ---------------- */

const MODAL_TITLES = {
  login: 'Вход в аккаунт',
  register: 'Регистрация',
  forgot: 'Восстановление пароля',
  reset: 'Новый пароль',
};

export function openAuthModal(mode = 'login', { next = '', token = '' } = {}) {
  setAuthMode(mode, { token });
  const modal = document.getElementById('auth-modal');
  if (modal) {
    if (next) modal.dataset.next = next;
    openModal('auth-modal');
  }
}

function setAuthMode(mode, { token = '' } = {}) {
  const title = document.getElementById('auth-modal-title');
  if (title) title.textContent = MODAL_TITLES[mode] || MODAL_TITLES.login;

  $$('[data-auth-view]').forEach((view) => {
    view.hidden = view.dataset.authView !== mode;
  });

  const resetTokenField = document.querySelector('[data-reset-token]');
  if (resetTokenField && token) resetTokenField.value = token;

  const subtitle = document.getElementById('auth-modal-subtitle');
  if (subtitle) {
    const subtitles = {
      login: 'Войдите, чтобы публиковать объявления и общаться с продавцами.',
      register: 'Публикация объявлений, избранное и переписка — в одном аккаунте.',
      forgot: 'Укажите e-mail, и мы отправим код для сброса пароля.',
      reset: 'Придумайте новый пароль длиной не менее 8 символов.',
    };
    subtitle.textContent = subtitles[mode] || '';
  }

  const modal = document.getElementById('auth-modal');
  if (modal) modal.dataset.mode = mode;
}

function fieldError(form, name, message) {
  const field = form.querySelector(`[data-field="${name}"]`);
  const error = field?.querySelector('.field__error span');
  if (field) field.classList.toggle('has-error', Boolean(message));
  if (error) error.textContent = message || '';
}

function clearErrors(form) {
  form.querySelectorAll('.field').forEach((field) => field.classList.remove('has-error'));
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function handleApiError(form, error) {
  const details = error?.details;
  if (details && typeof details === 'object') {
    for (const [key, message] of Object.entries(details)) {
      fieldError(form, key, message);
    }
  }
  toast(error.message || 'Не удалось выполнить действие', { type: 'error' });
}

export function initAuthForms() {
  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-auth-open]');
    if (opener) {
      event.preventDefault();
      openAuthModal(opener.dataset.authOpen || 'login');
      return;
    }

    const switchLink = event.target.closest('[data-auth-switch]');
    if (switchLink) {
      event.preventDefault();
      setAuthMode(switchLink.dataset.authSwitch);
      return;
    }

    if (event.target.closest('[data-auth-logout]')) {
      event.preventDefault();
      logout();
    }
  });

  const loginForm = document.getElementById('login-form');
  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(loginForm);
    const values = readForm(loginForm);
    const submit = loginForm.querySelector('[type="submit"]');
    setBusy(submit, true, 'Входим…');
    try {
      await login(values.email.trim(), values.password);
      closeModal('auth-modal');
      loginForm.reset();
      toast('Добро пожаловать!', { type: 'success' });
      const modal = document.getElementById('auth-modal');
      const next = modal?.dataset.next;
      if (next) {
        window.location.href = next;
      } else if (document.body.dataset.requiresAuth === 'true') {
        window.location.reload();
      }
    } catch (error) {
      handleApiError(loginForm, error);
    } finally {
      setBusy(submit, false);
    }
  });

  const registerForm = document.getElementById('register-form');
  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(registerForm);
    const values = readForm(registerForm);

    if (values.password !== values.passwordConfirm) {
      fieldError(registerForm, 'passwordConfirm', 'Пароли не совпадают');
      return;
    }
    if (!values.agree) {
      toast('Подтвердите согласие с условиями использования', { type: 'error' });
      return;
    }

    const submit = registerForm.querySelector('[type="submit"]');
    setBusy(submit, true, 'Создаём аккаунт…');
    try {
      await register({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone?.trim() || '',
        city: values.city?.trim() || '',
        password: values.password,
      });
      closeModal('auth-modal');
      registerForm.reset();
      toast('Аккаунт создан. Проверьте e-mail для подтверждения.', { type: 'success' });
      if (document.body.dataset.requiresAuth === 'true') window.location.reload();
    } catch (error) {
      handleApiError(registerForm, error);
    } finally {
      setBusy(submit, false);
    }
  });

  const forgotForm = document.getElementById('forgot-form');
  forgotForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(forgotForm);
    const values = readForm(forgotForm);
    const submit = forgotForm.querySelector('[type="submit"]');
    setBusy(submit, true, 'Отправляем…');
    try {
      const response = await authApi.forgotPassword(values.email.trim());
      const token = response.demoResetToken || '';
      toast(response.message, { type: 'success', timeout: 7000 });
      setAuthMode('reset', { token });
    } catch (error) {
      handleApiError(forgotForm, error);
    } finally {
      setBusy(submit, false);
    }
  });

  const resetForm = document.getElementById('reset-form');
  resetForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(resetForm);
    const values = readForm(resetForm);
    const submit = resetForm.querySelector('[type="submit"]');
    setBusy(submit, true, 'Сохраняем…');
    try {
      const response = await authApi.resetPassword(values.token.trim(), values.password);
      toast(response.message, { type: 'success' });
      setAuthMode('login');
      resetForm.reset();
    } catch (error) {
      handleApiError(resetForm, error);
    } finally {
      setBusy(submit, false);
    }
  });

  // Заполнение демо-аккаунта одним нажатием
  document.addEventListener('click', (event) => {
    const fill = event.target.closest('[data-demo-fill]');
    if (!fill) return;
    event.preventDefault();
    const form = document.getElementById('login-form');
    if (!form) return;
    const email = field(form, 'email');
    const password = field(form, 'password');
    if (email) {
      email.value = 'demo@market.ru';
      email.focus();
    }
    if (password) password.value = 'demo1234';
  });
}

/* ---------------- Меню пользователя ---------------- */

export function initUserMenu() {
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-user-menu-toggle]');
    const panel = document.querySelector('[data-user-menu-panel]');
    if (!panel) return;

    if (toggle) {
      const isOpen = panel.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
      return;
    }
    if (!event.target.closest('.user-menu')) {
      panel.classList.remove('is-open');
      document.querySelector('[data-user-menu-toggle]')?.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelector('[data-user-menu-panel]')?.classList.remove('is-open');
    document.querySelector('[data-user-menu-toggle]')?.setAttribute('aria-expanded', 'false');
  });
}

/* ---------------- Подсказка демо-доступа ---------------- */

export async function initDemoHint() {
  const hint = document.querySelector('[data-demo-hint]');
  if (!hint) return;
  try {
    const config = await api.get('/config');
    if (config.demoMode && config.demoAccount) {
      hint.hidden = false;
      hint.innerHTML = `
        ${icon('info', { size: 15 })}
        <span>Демо-доступ: <strong>${escapeHtml(config.demoAccount.email)}</strong> / <strong>${escapeHtml(config.demoAccount.password)}</strong></span>
        <button type="button" class="link-btn" data-demo-fill>Подставить</button>
      `;
    }
  } catch {
    /* необязательный блок */
  }
}

export function phoneMarkup(user) {
  return user?.phone ? formatPhone(user.phone) : '';
}
