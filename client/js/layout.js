// Единый каркас: шапка, подвал, мобильная навигация, модальное окно авторизации.
// Рендерится в плейсхолдеры страниц, чтобы не дублировать разметку в восьми файлах.

import { icon } from './icons.js';
import { $$, initTheme, toggleTheme, markCurrentNav, initModals, initToTop, initRails, initAccordions } from './ui.js';
import { initAuth, initAuthForms, initUserMenu, initDemoHint } from './auth.js';

const CITY = 'Москва';

const NAV = [
  { href: '/catalog.html', label: 'Каталог', icon: 'grid' },
  { href: '/catalog.html?category=auto', label: 'Авто', icon: 'car' },
  { href: '/catalog.html?category=realty', label: 'Недвижимость', icon: 'building' },
  { href: '/catalog.html?category=jobs', label: 'Работа', icon: 'briefcase' },
  { href: '/about.html', label: 'Помощь', icon: 'info' },
];

function headerMarkup() {
  return `
    <div class="container header-inner">
      <a class="brand" href="/index.html" aria-label="Маркет — на главную">
        <span class="brand-mark">${icon('grid', { size: 19 })}</span>
        <span class="brand-text">
          <span class="brand-name">Маркет</span>
          <span class="brand-tagline">Объявления</span>
        </span>
      </a>

      <nav class="header-nav" aria-label="Основная навигация">
        ${NAV.map((item) => `<a href="${item.href}" data-nav>${item.label}</a>`).join('')}
      </nav>

      <form class="header-search" role="search" action="/catalog.html" method="get">
        <label class="visually-hidden" for="header-search-input">Поиск по объявлениям</label>
        <div class="input-group">
          <span class="input-group__icon">${icon('search', { size: 17 })}</span>
          <input class="input" id="header-search-input" type="search" name="q" placeholder="Что ищете?" autocomplete="off">
        </div>
      </form>

      <div class="header-actions">
        <a class="header-city" href="/catalog.html" title="Изменить город">
          ${icon('map-pin', { size: 16 })}<span>${CITY}</span>
        </a>

        <button class="theme-toggle" type="button" data-theme-toggle aria-label="Переключить тему" aria-pressed="false">
          ${icon('sun', { size: 19, className: 'icon-sun' })}
          ${icon('moon', { size: 19, className: 'icon-moon' })}
        </button>

        <a class="icon-btn" href="/messages.html" aria-label="Сообщения" data-nav>
          ${icon('message', { size: 20 })}
          <span class="icon-btn__badge" data-unread-badge hidden>0</span>
        </a>

        <div id="auth-zone" class="row row-2"></div>
      </div>
    </div>
  `;
}

function footerMarkup() {
  const year = new Date().getFullYear();
  return `
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand">
          <a class="brand" href="/index.html">
            <span class="brand-mark">${icon('grid', { size: 19 })}</span>
            <span class="brand-text">
              <span class="brand-name">Маркет</span>
              <span class="brand-tagline">Объявления</span>
            </span>
          </a>
          <p class="footer-about">
            Классифайд-площадка для сделок между людьми и бизнесом. Более 40 категорий,
            проверенные продавцы и безопасные расчёты при личной встрече.
          </p>
          <div class="footer-contacts">
            <a href="tel:+74951234567">+7 (495) 123-45-67</a>
            <span class="text-muted">Ежедневно с 9:00 до 21:00 (МСК)</span>
            <a href="mailto:support@market.ru">support@market.ru</a>
          </div>
          <div class="footer-apps">
            <a class="footer-app" href="/about.html">${icon('apple', { size: 16 })}App Store</a>
            <a class="footer-app" href="/about.html">${icon('google', { size: 16 })}Google Play</a>
          </div>
        </div>

        <div class="footer-col">
          <h3>Покупателям</h3>
          <ul>
            <li><a href="/catalog.html">Все объявления</a></li>
            <li><a href="/catalog.html?sort=popularity">Популярное</a></li>
            <li><a href="/about.html#faq">Как купить безопасно</a></li>
            <li><a href="/about.html#faq">Доставка и оплата</a></li>
            <li><a href="/about.html#faq">Возврат и споры</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h3>Продавцам</h3>
          <ul>
            <li><a href="/create.html">Разместить объявление</a></li>
            <li><a href="/profile.html">Личный кабинет</a></li>
            <li><a href="/create.html#tariffs">Тарифы продвижения</a></li>
            <li><a href="/about.html#faq">Правила модерации</a></li>
            <li><a href="/about.html#contact">Помощь продавцу</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h3>Компания</h3>
          <ul>
            <li><a href="/about.html">О компании</a></li>
            <li><a href="/about.html#contact">Контакты</a></li>
            <li><a href="/about.html#legal">Вакансии</a></li>
            <li><a href="/about.html#legal">Реквизиты</a></li>
            <li><a href="/about.html#legal">Политика конфиденциальности</a></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <span>© ${year} ООО «Маркет», ИНН 7701234567, ОГРН 1157746000000</span>
        <div class="footer-legal">
          <a href="/about.html#legal">Оферта</a>
          <a href="/about.html#legal">Конфиденциальность</a>
          <a href="/about.html#legal">Cookies</a>
        </div>
        <span class="footer-lang">${icon('globe', { size: 13 })}Русский</span>
        <div class="footer-social">
          <a href="/about.html" aria-label="Telegram">${icon('tg', { size: 16 })}</a>
          <a href="/about.html" aria-label="ВКонтакте">${icon('vk', { size: 16 })}</a>
          <a href="/about.html" aria-label="YouTube">${icon('youtube', { size: 16 })}</a>
        </div>
      </div>
    </div>
  `;
}

function bottomNavMarkup() {
  const items = [
    { href: '/index.html', label: 'Главная', icon: 'home' },
    { href: '/catalog.html', label: 'Каталог', icon: 'search' },
    { href: '/create.html', label: 'Разместить', icon: 'plus' },
    { href: '/messages.html', label: 'Чаты', icon: 'message', badge: true },
    { href: '/profile.html', label: 'Профиль', icon: 'user' },
  ];
  return items
    .map(
      (item) => `
      <a class="bottom-nav__item" href="${item.href}" data-nav>
        ${icon(item.icon, { size: 21 })}
        <span>${item.label}</span>
        ${item.badge ? '<span class="icon-btn__badge" data-unread-badge hidden>0</span>' : ''}
      </a>`,
    )
    .join('');
}

function authModalMarkup() {
  return `
    <div class="modal-backdrop" id="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" aria-hidden="true">
      <div class="modal">
        <div class="modal__head">
          <div>
            <h2 id="auth-modal-title">Вход в аккаунт</h2>
            <p id="auth-modal-subtitle"></p>
          </div>
          <button class="modal__close" type="button" data-modal-close aria-label="Закрыть">
            ${icon('x', { size: 18 })}
          </button>
        </div>

        <div class="modal__body">
          <div data-auth-view="login">
            <form id="login-form" class="stack stack-4" novalidate>
              <div class="field" data-field="email">
                <label class="field__label" for="login-email">E-mail</label>
                <input class="input" id="login-email" name="email" type="email" autocomplete="email" required placeholder="name@example.ru">
                <span class="field__error">${icon('alert', { size: 13 })}<span></span></span>
              </div>
              <div class="field" data-field="password">
                <div class="row between">
                  <label class="field__label" for="login-password">Пароль</label>
                  <button type="button" class="link-btn text-xs" data-auth-switch="forgot">Забыли пароль?</button>
                </div>
                <input class="input" id="login-password" name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="Минимум 8 символов">
                <span class="field__error">${icon('alert', { size: 13 })}<span></span></span>
              </div>
              <button class="btn btn--primary btn--block" type="submit">Войти</button>
              <div class="alert alert--info" data-demo-hint hidden></div>
              <p class="text-sm text-muted text-center">
                Нет аккаунта?
                <button type="button" class="link-btn" data-auth-switch="register">Зарегистрироваться</button>
              </p>
            </form>
          </div>

          <div data-auth-view="register" hidden>
            <form id="register-form" class="stack stack-4" novalidate>
              <div class="form-grid form-grid--2">
                <div class="field" data-field="name">
                  <label class="field__label" for="reg-name">Имя и фамилия</label>
                  <input class="input" id="reg-name" name="name" type="text" autocomplete="name" required minlength="2" placeholder="Анна Смирнова">
                  <span class="field__error">${icon('alert', { size: 13 })}<span></span></span>
                </div>
                <div class="field" data-field="city">
                  <label class="field__label" for="reg-city">Город</label>
                  <input class="input" id="reg-city" name="city" type="text" autocomplete="address-level2" placeholder="Москва">
                </div>
              </div>
              <div class="field" data-field="email">
                <label class="field__label" for="reg-email">E-mail</label>
                <input class="input" id="reg-email" name="email" type="email" autocomplete="email" required placeholder="name@example.ru">
                <span class="field__error">${icon('alert', { size: 13 })}<span></span></span>
              </div>
              <div class="field" data-field="phone">
                <label class="field__label" for="reg-phone">Телефон</label>
                <input class="input" id="reg-phone" name="phone" type="tel" autocomplete="tel" placeholder="+7 (900) 000-00-00">
                <span class="field__error">${icon('alert', { size: 13 })}<span></span></span>
              </div>
              <div class="form-grid form-grid--2">
                <div class="field" data-field="password">
                  <label class="field__label" for="reg-password">Пароль</label>
                  <input class="input" id="reg-password" name="password" type="password" autocomplete="new-password" required minlength="8" placeholder="Минимум 8 символов">
                  <span class="field__error">${icon('alert', { size: 13 })}<span></span></span>
                </div>
                <div class="field" data-field="passwordConfirm">
                  <label class="field__label" for="reg-password-confirm">Повторите пароль</label>
                  <input class="input" id="reg-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" required minlength="8">
                  <span class="field__error">${icon('alert', { size: 13 })}<span></span></span>
                </div>
              </div>
              <label class="check">
                <input type="checkbox" name="agree" value="true">
                <span class="check__box">${icon('check', { size: 12 })}</span>
                <span>Согласен с <a href="/about.html#legal" class="link-btn">условиями</a> и обработкой персональных данных</span>
              </label>
              <button class="btn btn--primary btn--block" type="submit">Создать аккаунт</button>
              <p class="text-sm text-muted text-center">
                Уже есть аккаунт?
                <button type="button" class="link-btn" data-auth-switch="login">Войти</button>
              </p>
            </form>
          </div>

          <div data-auth-view="forgot" hidden>
            <form id="forgot-form" class="stack stack-4" novalidate>
              <div class="field" data-field="email">
                <label class="field__label" for="forgot-email">E-mail аккаунта</label>
                <input class="input" id="forgot-email" name="email" type="email" autocomplete="email" required placeholder="name@example.ru">
                <span class="field__error">${icon('alert', { size: 13 })}<span></span></span>
              </div>
              <button class="btn btn--primary btn--block" type="submit">Отправить код</button>
              <button type="button" class="btn btn--ghost btn--block" data-auth-switch="login">Вернуться ко входу</button>
            </form>
          </div>

          <div data-auth-view="reset" hidden>
            <form id="reset-form" class="stack stack-4" novalidate>
              <div class="field" data-field="token">
                <label class="field__label" for="reset-token">Код из письма</label>
                <input class="input" id="reset-token" name="token" type="text" data-reset-token required placeholder="Вставьте код">
                <span class="field__error">${icon('alert', { size: 13 })}<span></span></span>
              </div>
              <div class="field" data-field="password">
                <label class="field__label" for="reset-password">Новый пароль</label>
                <input class="input" id="reset-password" name="password" type="password" autocomplete="new-password" required minlength="8">
                <span class="field__error">${icon('alert', { size: 13 })}<span></span></span>
              </div>
              <button class="btn btn--primary btn--block" type="submit">Сохранить пароль</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function mountLayout({ pageTitle, bottomNav = true } = {}) {
  initTheme();

  const header = document.querySelector('[data-site-header]');
  if (header) header.innerHTML = headerMarkup();

  const footer = document.querySelector('[data-site-footer]');
  if (footer) footer.innerHTML = footerMarkup();

  const nav = document.querySelector('[data-bottom-nav]');
  if (nav) {
    if (bottomNav) {
      nav.innerHTML = bottomNavMarkup();
      document.body.classList.add('has-bottom-nav');
    } else {
      nav.remove();
    }
  }

  if (!document.getElementById('auth-modal')) {
    document.body.insertAdjacentHTML('beforeend', authModalMarkup());
  }

  if (!document.querySelector('.to-top')) {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<button class="to-top" type="button" aria-label="Наверх">${icon('arrow-up', { size: 17 })}</button>`,
    );
  }

  const titleNode = document.querySelector('[data-page-title]');
  if (titleNode && pageTitle) titleNode.textContent = pageTitle;

  markCurrentNav();
  initModals();
  initAuthForms();
  initUserMenu();
  initAccordions();
  initRails();
  initToTop();

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => toggleTheme());
  });

  const searchForm = document.querySelector('.header-search');
  searchForm?.addEventListener('submit', (event) => {
    const input = searchForm.querySelector('input[name="q"]');
    if (input && !input.value.trim()) {
      event.preventDefault();
      window.location.href = '/catalog.html';
    }
  });

  document.querySelector('.site-header')?.addEventListener('click', (event) => {
    if (event.target.closest('a[href="/create.html"]')) {
      // на странице создания ссылка в шапке не нужна, но обработчик безопасен
    }
  });

  initAuth().then(() => {
    initDemoHint();
  });

  $$('[data-auth-open]').forEach((node) => node.addEventListener('click', () => {}));
}

export function renderListingsInto(container, items, renderItem) {
  if (!container) return;
  container.innerHTML = items.map(renderItem).join('');
}
