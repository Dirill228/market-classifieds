// О компании: счётчики, FAQ, форма обратной связи.

import { miscApi, catalogApi } from './api.js';
import { icon } from './icons.js';
import { $, $$, escapeHtml, initAccordions, initCounters, setBusy, toast } from './ui.js';
import { mountLayout } from './layout.js';

mountLayout({ pageTitle: 'О компании и помощь' });

/* ---------------- Цифры ---------------- */

async function loadFigures() {
  try {
    const data = await catalogApi.home();
    const map = {
      'figure-users': data.stats.users,
      'figure-listings': data.stats.listings,
      'figure-cities': data.stats.cities,
      'figure-deals': data.stats.deals,
    };
    for (const [id, value] of Object.entries(map)) {
      const node = document.getElementById(id);
      if (!node) continue;
      node.dataset.count = String(value);
      node.textContent = '0';
    }
    initCounters(document);
  } catch {
    $$('[data-count]').forEach((node) => {
      node.textContent = node.dataset.count || '0';
    });
  }
}

/* ---------------- FAQ ---------------- */

function renderFaq(groups) {
  const nav = $('#faq-nav');
  const container = $('#faq-groups');
  if (!container) return;

  if (nav) {
    nav.innerHTML = groups
      .map(
        (group, index) => `
        <button type="button" data-faq-jump="${group.id}" class="${index === 0 ? 'is-active' : ''}">
          ${escapeHtml(group.title)}
        </button>`,
      )
      .join('');
  }

  container.innerHTML = groups
    .map(
      (group) => `
      <section class="faq-group" id="faq-${group.id}">
        <h2>${escapeHtml(group.title)}</h2>
        <div class="accordion">
          ${group.items
            .map(
              (item, index) => `
            <div class="accordion__item">
              <button class="accordion__trigger" type="button" data-accordion-trigger
                aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="faq-${group.id}-${index}">
                ${escapeHtml(item.question)}
                <span class="accordion__icon">${icon('chevron-down', { size: 14 })}</span>
              </button>
              <div class="accordion__panel${index === 0 ? ' is-open' : ''}" id="faq-${group.id}-${index}">
                <div><div class="accordion__content">${escapeHtml(item.answer)}</div></div>
              </div>
            </div>`,
            )
            .join('')}
        </div>
      </section>`,
    )
    .join('');

  initAccordions(container);
}

async function loadFaq() {
  try {
    const data = await miscApi.faq();
    renderFaq(data.groups);
  } catch (error) {
    toast('Не удалось загрузить часто задаваемые вопросы', { type: 'error' });
  }
}

/* ---------------- Форма обратной связи ---------------- */

function initContactForm() {
  const form = $('#contact-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());

    if (data.message.trim().length < 20) {
      toast('Опишите вопрос подробнее — минимум 20 символов', { type: 'error' });
      return;
    }

    setBusy(submit, true, 'Отправляем…');
    try {
      const response = await miscApi.contact({
        name: data.name.trim(),
        email: data.email.trim(),
        topic: data.topic,
        message: data.message.trim(),
      });
      form.reset();
      const success = $('#contact-success');
      if (success) {
        success.hidden = false;
        success.innerHTML = `${icon('check-circle', { size: 17 })}<span>${escapeHtml(response.message)}</span>`;
      }
      toast('Обращение отправлено', { type: 'success' });
    } catch (error) {
      toast(error.message, { type: 'error' });
    } finally {
      setBusy(submit, false);
    }
  });
}

/* ---------------- Навигация по FAQ ---------------- */

function initFaqNav() {
  $('#faq-nav')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-faq-jump]');
    if (!button) return;
    $$('[data-faq-jump]').forEach((node) => node.classList.toggle('is-active', node === button));
    document.getElementById(`faq-${button.dataset.faqJump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

loadFigures();
loadFaq();
initContactForm();
initFaqNav();
