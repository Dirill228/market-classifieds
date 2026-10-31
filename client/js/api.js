// Тонкая обёртка над fetch: CSRF-токен, access-token в памяти + автообновление
// через refresh-cookie при 401.

const API_BASE = '/api';
const TOKEN_KEY = 'market.accessToken';
const USER_KEY = 'market.user';

let accessToken = readStoredToken();
let refreshPromise = null;

function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredToken(token) {
  accessToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* приватный режим — работаем без сохранения */
  }
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function getAccessToken() {
  return accessToken;
}

export function setSession({ accessToken: token, user }) {
  writeStoredToken(token || null);
  if (user) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* игнорируем */
    }
  }
}

export function getCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  writeStoredToken(null);
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* игнорируем */
  }
}

async function rawRequest(path, { method = 'GET', body, headers = {}, isForm = false } = {}) {
  const finalHeaders = { Accept: 'application/json', ...headers };
  if (accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie('csrf_token');
    if (csrf) finalHeaders['X-CSRF-Token'] = csrf;
  }

  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: payload,
    credentials: 'same-origin',
    cache: isForm ? 'no-store' : 'default',
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message = data?.error?.message || `Ошибка запроса (${response.status})`;
    throw new ApiError(response.status, message, data?.error?.details || null);
  }
  return data;
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/refresh', { method: 'POST' })
      .then((data) => {
        writeStoredToken(data.accessToken);
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        } catch {
          /* игнорируем */
        }
        return data.user;
      })
      .catch((error) => {
        clearSession();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (error) {
    const canRetry = error instanceof ApiError
      && error.status === 401
      && !path.startsWith('/auth/refresh')
      && !path.startsWith('/auth/login');

    if (!canRetry) throw error;

    await refreshSession();
    return rawRequest(path, options);
  }
}

export const api = {
  get: (path, params) => request(`${path}${toQuery(params)}`),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST', body: formData, isForm: true }),
  refresh: refreshSession,
};

export function toQuery(params) {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/* ---------- Доменные обёртки ---------- */

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (payload) => api.post('/auth/register', payload),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updateMe: (payload) => api.patch('/auth/me', payload),
  changePassword: (payload) => api.post('/auth/me/password', payload),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
};

export const catalogApi = {
  home: () => api.get('/home'),
  categories: () => api.get('/categories'),
  locations: () => api.get('/locations'),
  suggest: (q) => api.get('/suggest', { q }),
  listings: (params) => api.get('/listings', params),
  listing: (id) => api.get(`/listings/${id}`),
  similar: (id) => api.get(`/listings/${id}/similar`),
  phone: (id) => api.get(`/listings/${id}/phone`),
  report: (id, payload) => api.post(`/listings/${id}/report`, payload),
  mine: (status) => api.get('/listings/mine', status ? { status } : undefined),
  create: (formData) => api.upload('/listings', formData),
  update: (id, formData) => request(`/listings/${id}`, { method: 'PATCH', body: formData, isForm: true }),
  setStatus: (id, status) => api.patch(`/listings/${id}/status`, { status }),
  remove: (id) => api.del(`/listings/${id}`),
};

export const favoritesApi = {
  list: () => api.get('/favorites'),
  add: (listingId) => api.post('/favorites', { listingId }),
  remove: (listingId) => api.del(`/favorites/${listingId}`),
};

export const savedSearchesApi = {
  list: () => api.get('/saved-searches'),
  create: (title, query) => api.post('/saved-searches', { title, query }),
  remove: (id) => api.del(`/saved-searches/${id}`),
};

export const profileApi = {
  stats: () => api.get('/profile/stats'),
  balance: () => api.get('/profile/balance'),
};

export const chatApi = {
  conversations: () => api.get('/conversations'),
  conversation: (id) => api.get(`/conversations/${id}`),
  messages: (id, after) => api.get(`/conversations/${id}/messages`, after ? { after } : undefined),
  send: (id, payload) => api.post(`/conversations/${id}/messages`, payload),
  markRead: (id) => api.post(`/conversations/${id}/read`),
  typing: (id) => api.post(`/conversations/${id}/typing`),
  start: (listingId, message) => api.post('/conversations', { listingId, message }),
  unread: () => api.get('/messages/unread-count'),
  upload: (formData) => api.upload('/uploads/chat', formData),
};

export const miscApi = {
  faq: () => api.get('/faq'),
  contact: (payload) => api.post('/contact', payload),
  config: () => api.get('/config'),
  user: (id) => api.get(`/users/${id}`),
};
