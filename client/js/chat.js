// Чат: список диалогов, long-polling сообщений, индикатор набора, вложения.

import { chatApi } from './api.js';
import { icon } from './icons.js';
import {
  $, $$, dayLabel, escapeHtml, formatChatTime, formatPrice, formatTime, initials,
  setBusy, toast, typingMarkup,
} from './ui.js';
import { getUser, requireUser, updateUnreadBadge } from './auth.js';
import { mountLayout } from './layout.js';

mountLayout({ pageTitle: 'Сообщения', bottomNav: false });

const state = {
  conversations: [],
  activeId: null,
  activeConversation: null,
  messages: [],
  lastId: 0,
  polling: false,
  typingTimer: null,
  lastTypingSent: 0,
  filter: '',
};

const POLL_TIMEOUT = 12000;

/* ---------------- Список диалогов ---------------- */

function conversationMatches(item) {
  if (!state.filter) return true;
  const needle = state.filter.toLowerCase();
  return item.counterpart.name.toLowerCase().includes(needle)
    || item.listing.title.toLowerCase().includes(needle);
}

function renderConversations() {
  const container = $('#chat-items');
  if (!container) return;

  const items = state.conversations.filter(conversationMatches);
  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state" style="border:none;background:transparent;padding:32px 20px">
        <span class="empty-state__icon">${icon('message', { size: 24 })}</span>
        <h3>${state.filter ? 'Ничего не найдено' : 'Диалогов пока нет'}</h3>
        <p>${state.filter ? 'Попробуйте изменить запрос.' : 'Напишите продавцу со страницы объявления — переписка появится здесь.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const avatar = item.counterpart.avatar
        ? `<span class="avatar"><img src="${escapeHtml(item.counterpart.avatar)}" alt="" width="40" height="40"></span>`
        : `<span class="avatar">${escapeHtml(initials(item.counterpart.name))}</span>`;

      return `
      <button class="chat-item${item.id === state.activeId ? ' is-active' : ''}" type="button" data-conversation="${item.id}">
        ${avatar}
        <span class="chat-item__body">
          <span class="chat-item__top">
            <span class="chat-item__name">${escapeHtml(item.counterpart.name)}</span>
            <span class="chat-item__time">${formatChatTime(item.lastMessageAt)}</span>
          </span>
          <span class="chat-item__preview">${escapeHtml(item.lastMessage || 'Нет сообщений')}</span>
          <span class="chat-item__listing">${icon('grid', { size: 11 })}<span>${escapeHtml(item.listing.title)}</span></span>
        </span>
        ${item.unread ? `<span class="chat-item__unread">${item.unread > 9 ? '9+' : item.unread}</span>` : ''}
      </button>`;
    })
    .join('');
}

/* ---------------- Окно чата ---------------- */

function renderChatHead() {
  const head = $('#chat-head');
  const listingBar = $('#chat-listing');
  const conversation = state.activeConversation;
  if (!head) return;

  if (!conversation) {
    head.innerHTML = '';
    if (listingBar) listingBar.hidden = true;
    return;
  }

  const counterpart = conversation.counterpart;
  head.innerHTML = `
    <button class="chat-back" type="button" data-chat-back aria-label="К списку диалогов">${icon('arrow-left', { size: 19 })}</button>
    ${counterpart.avatar
      ? `<span class="avatar"><img src="${escapeHtml(counterpart.avatar)}" alt="" width="40" height="40"></span>`
      : `<span class="avatar">${escapeHtml(initials(counterpart.name))}</span>`}
    <div class="grow">
      <div class="fw-600" style="font-size:15px">${escapeHtml(counterpart.name)}</div>
      <div class="text-xs text-muted row row-2" style="gap:4px">
        ${counterpart.verified ? icon('shield-check', { size: 12 }) : ''}
        ${counterpart.rating.toFixed(1)} · ${conversation.role === 'seller' ? 'покупатель' : 'продавец'}
      </div>
    </div>
    <a class="icon-btn" href="/listing.html?id=${conversation.listing.id}" aria-label="Открыть объявление">${icon('external-link', { size: 18 })}</a>
  `;

  if (listingBar) {
    listingBar.hidden = false;
    listingBar.innerHTML = `
      ${conversation.listing.image ? `<img src="${escapeHtml(conversation.listing.image)}" alt="" width="34" height="34">` : ''}
      <div class="grow" style="min-width:0">
        <div class="chat-panel__listing-title">${escapeHtml(conversation.listing.title)}</div>
        <div class="chat-panel__listing-meta">${formatPrice(conversation.listing.price)} · ${escapeHtml(statusLabel(conversation.listing.status))}</div>
      </div>
      <a class="btn btn--ghost btn--sm" href="/listing.html?id=${conversation.listing.id}">Открыть</a>
    `;
  }
}

function statusLabel(status) {
  return {
    active: 'в продаже',
    sold: 'продано',
    moderation: 'на модерации',
    rejected: 'отклонено',
    archived: 'в архиве',
  }[status] || status;
}

function messageMarkup(message) {
  const isOut = message.senderId === getUser()?.id;
  const time = formatTime(message.createdAt);
  const file = message.attachmentUrl
    ? `<a class="msg__file" href="${escapeHtml(message.attachmentUrl)}" target="_blank" rel="noopener">
         ${icon('paperclip', { size: 13 })}${escapeHtml(message.attachmentName || 'Вложение')}
       </a>`
    : '';

  return `
    <div class="msg ${isOut ? 'msg--out' : 'msg--in'}" data-message="${message.id}">
      <div class="msg__bubble">${escapeHtml(message.body)}${file}</div>
      <div class="msg__meta">
        ${time}
        ${isOut ? `<span class="${message.isRead ? 'is-read' : ''}" title="${message.isRead ? 'Прочитано' : 'Доставлено'}">${icon(message.isRead ? 'check-circle' : 'check', { size: 12 })}</span>` : ''}
      </div>
    </div>
  `;
}

function renderMessages({ append = false } = {}) {
  const container = $('#chat-messages');
  if (!container) return;

  if (!state.messages.length) {
    container.innerHTML = `
      <div class="chat-empty">
        <div class="chat-empty__inner">
          <span class="chat-empty__icon">${icon('message', { size: 26 })}</span>
          <h3 style="font-size:16px">Начните переписку</h3>
          <p>Поздоровайтесь и уточните детали — продавцы обычно отвечают в течение часа.</p>
        </div>
      </div>`;
    return;
  }

  let html = '';
  let lastDay = '';

  for (const message of state.messages) {
    const day = dayLabel(message.createdAt);
    if (day !== lastDay) {
      html += `<div class="chat-day">${escapeHtml(day)}</div>`;
      lastDay = day;
    }
    html += messageMarkup(message);
  }

  if (append) {
    container.insertAdjacentHTML('beforeend', html);
  } else {
    container.innerHTML = html;
  }
  scrollToBottom();
}

function scrollToBottom(smooth = false) {
  const container = $('#chat-messages');
  if (!container) return;
  container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

/* ---------------- Показ «печатает» ---------------- */

function showTyping(visible) {
  const container = $('#chat-messages');
  if (!container) return;
  let node = container.querySelector('.typing');
  if (visible && !node) {
    container.insertAdjacentHTML('beforeend', typingMarkup());
    scrollToBottom(true);
  } else if (!visible && node) {
    node.remove();
  }
}

/* ---------------- Загрузка диалогов ---------------- */

async function loadConversations() {
  try {
    const data = await chatApi.conversations();
    state.conversations = data.items;
    renderConversations();
    updateUnreadBadge();
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

async function openConversation(id) {
  const numericId = Number(id);
  if (!numericId) return;

  state.activeId = numericId;
  document.querySelector('.chat-shell')?.classList.add('is-open');
  renderConversations();

  try {
    const [{ conversation }, { messages }] = await Promise.all([
      chatApi.conversation(numericId),
      chatApi.messages(numericId),
    ]);
    state.activeConversation = conversation;
    state.messages = messages;
    state.lastId = messages.length ? messages[messages.length - 1].id : 0;
    renderChatHead();
    renderMessages();
    await chatApi.markRead(numericId);
    const item = state.conversations.find((entry) => entry.id === numericId);
    if (item) item.unread = 0;
    renderConversations();
    updateUnreadBadge();
    window.history.replaceState({}, '', `/messages.html?c=${numericId}`);
    startPolling();
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

/* ---------------- Long-polling ---------------- */

let pollController = null;

async function pollLoop() {
  if (!state.activeId) return;
  state.polling = true;

  while (state.polling && state.activeId) {
    try {
      const data = await chatApi.messages(state.activeId, state.lastId);
      if (data.messages?.length) {
        state.messages.push(...data.messages);
        state.lastId = data.messages[data.messages.length - 1].id;
        renderMessages({ append: true });
        if (state.messages.some((message) => message.senderId !== getUser()?.id)) {
          chatApi.markRead(state.activeId).catch(() => {});
        }
      }
      showTyping(Boolean(data.typing));
    } catch (error) {
      if (error.status === 401) break;
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
  state.polling = false;
}

function startPolling() {
  if (state.polling) return;
  pollLoop();
}

function stopPolling() {
  state.polling = false;
  pollController?.abort?.();
  pollController = null;
}

/* ---------------- Отправка ---------------- */

async function sendMessage() {
  const textarea = $('#chat-input');
  const button = $('#chat-send');
  const body = textarea?.value.trim();
  if (!body || !state.activeId) return;

  textarea.value = '';
  autoGrow(textarea);
  button.disabled = true;

  try {
    const data = await chatApi.send(state.activeId, { body });
    state.messages.push(data.message);
    state.lastId = data.message.id;
    renderMessages({ append: true });
    const item = state.conversations.find((entry) => entry.id === state.activeId);
    if (item) {
      item.lastMessage = body;
      item.lastMessageAt = data.message.createdAt;
      state.conversations.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
      renderConversations();
    }
  } catch (error) {
    toast(error.message, { type: 'error' });
    textarea.value = body;
  } finally {
    button.disabled = false;
    textarea.focus();
  }
}

async function sendTyping() {
  if (!state.activeId) return;
  const now = Date.now();
  if (now - state.lastTypingSent < 2600) return;
  state.lastTypingSent = now;
  try {
    await chatApi.typing(state.activeId);
  } catch {
    /* не критично */
  }
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(132, textarea.scrollHeight)}px`;
}

async function uploadAttachment(file) {
  if (!file || !state.activeId) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('Файл больше 5 МБ', { type: 'error' });
    return;
  }
  const form = new FormData();
  form.append('file', file);
  try {
    const uploaded = await chatApi.upload(form);
    const data = await chatApi.send(state.activeId, {
      body: '',
      attachmentUrl: uploaded.url,
      attachmentName: uploaded.name,
    });
    state.messages.push(data.message);
    state.lastId = data.message.id;
    renderMessages({ append: true });
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

/* ---------------- Запуск ---------------- */

async function boot() {
  await requireUser('/messages.html');
  if (!getUser()) return;

  document.body.classList.add('chat-page');
  await loadConversations();

  const params = new URLSearchParams(window.location.search);
  const initialId = params.get('c') || state.conversations[0]?.id;
  if (initialId) await openConversation(initialId);

  $('#chat-items')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-conversation]');
    if (!button) return;
    stopPolling();
    state.messages = [];
    state.lastId = 0;
    openConversation(button.dataset.conversation);
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-chat-back]')) {
      document.querySelector('.chat-shell')?.classList.remove('is-open');
    }
  });

  const input = $('#chat-input');
  input?.addEventListener('input', () => {
    autoGrow(input);
    sendTyping();
  });

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  $('#chat-send')?.addEventListener('click', sendMessage);

  $('#chat-attach')?.addEventListener('click', () => $('#chat-file')?.click());
  $('#chat-file')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) uploadAttachment(file);
    event.target.value = '';
  });

  const search = $('#chat-search');
  search?.addEventListener('input', () => {
    state.filter = search.value.trim();
    renderConversations();
  });

  window.addEventListener('beforeunload', stopPolling);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPolling();
    else if (state.activeId) startPolling();
  });
}

boot();
