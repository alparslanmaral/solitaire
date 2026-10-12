// Light / dark / follow-the-system, reflected on <html data-theme="...">.

const query = window.matchMedia('(prefers-color-scheme: dark)');
const THEME_COLORS = { light: '#e6f3ec', dark: '#0a1a1a' };

export function applyAppearance(choice) {
  const resolved = choice === 'system' ? (query.matches ? 'dark' : 'light') : choice;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.appearance = choice;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}

export function watchAppearance(getChoice) {
  query.addEventListener('change', () => {
    if (getChoice() === 'system') applyAppearance('system');
  });
}
