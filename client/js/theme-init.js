// Ранняя инициализация темы: подключается в <head> до CSS, чтобы не было вспышки.
(function initTheme() {
  var stored = null;
  try {
    stored = localStorage.getItem('market.theme');
  } catch (error) {
    stored = null;
  }
  var theme = stored;
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
