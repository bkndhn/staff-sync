// Company-wide visual style chosen by an admin (app_settings key app_theme_style).
export type ThemeStyleId = 'bold_violet' | 'dark_glass' | 'light_minimal';
export const THEME_STYLES: Record<ThemeStyleId, { label: string; hint: string; dark: boolean; colors: string[] }> = {
  bold_violet: { label: 'Bold Violet', hint: 'Deep violet with vivid gradients', dark: true, colors: ['#0d0718', '#1a1030', '#8b5cf6', '#d946ef'] },
  dark_glass: { label: 'Dark Glass', hint: 'Frosted glass on deep navy', dark: true, colors: ['#060a12', '#0f1726', '#38bdf8', '#94a3b8'] },
  light_minimal: { label: 'Light Minimal', hint: 'Clean white with soft borders', dark: false, colors: ['#f8fafc', '#ffffff', '#e2e8f0', '#2563eb'] },
};
export const DEFAULT_STYLE: ThemeStyleId = 'bold_violet';
export const STYLE_SETTING_KEY = 'app_theme_style';
const LOCAL_KEY = 'zenhr_theme_style';
export const isThemeStyle = (v: unknown): v is ThemeStyleId => typeof v === 'string' && v in THEME_STYLES;
export const resolveStyle = (v: unknown): ThemeStyleId => (isThemeStyle(v) ? v : DEFAULT_STYLE);
export const cachedThemeStyle = (): ThemeStyleId => { try { return resolveStyle(localStorage.getItem(LOCAL_KEY)); } catch { return DEFAULT_STYLE; } };
export function applyThemeStyle(v: unknown): ThemeStyleId {
  const id = resolveStyle(v);
  const b = document.body;
  Object.keys(THEME_STYLES).forEach(k => b.classList.remove(`style-${k}`));
  b.classList.add(`style-${id}`);
  try { localStorage.setItem(LOCAL_KEY, id); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('zenhr-style', { detail: id }));
  return id;
}
