// Admin-selectable brand colours. Every `blue-*` Tailwind class reads --brand-* vars.
export type BrandThemeId = 'blue' | 'emerald' | 'violet' | 'rose' | 'amber' | 'teal';
type Palette = Record<number, string>;
const P = (hexes: string[]): Palette => {
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const out: Palette = {};
  shades.forEach((s, i) => {
    const h = hexes[i].replace('#', '');
    out[s] = `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`;
  });
  return out;
};
export const BRAND_THEMES: Record<BrandThemeId, { label: string; swatch: string; palette: Palette }> = {
  blue: { label: 'Zen Blue', swatch: '#3b82f6', palette: P(['#eff6ff','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e40af','#1e3a8a','#172554']) },
  emerald: { label: 'Emerald', swatch: '#10b981', palette: P(['#ecfdf5','#d1fae5','#a7f3d0','#6ee7b7','#34d399','#10b981','#059669','#047857','#065f46','#064e3b','#022c22']) },
  violet: { label: 'Violet', swatch: '#8b5cf6', palette: P(['#f5f3ff','#ede9fe','#ddd6fe','#c4b5fd','#a78bfa','#8b5cf6','#7c3aed','#6d28d9','#5b21b6','#4c1d95','#2e1065']) },
  rose: { label: 'Rose', swatch: '#f43f5e', palette: P(['#fff1f2','#ffe4e6','#fecdd3','#fda4af','#fb7185','#f43f5e','#e11d48','#be123c','#9f1239','#881337','#4c0519']) },
  amber: { label: 'Amber', swatch: '#f59e0b', palette: P(['#fffbeb','#fef3c7','#fde68a','#fcd34d','#fbbf24','#f59e0b','#d97706','#b45309','#92400e','#78350f','#451a03']) },
  teal: { label: 'Teal', swatch: '#14b8a6', palette: P(['#f0fdfa','#ccfbf1','#99f6e4','#5eead4','#2dd4bf','#14b8a6','#0d9488','#0f766e','#115e59','#134e4a','#042f2e']) },
};
export const THEME_SETTING_KEY = 'brand_theme';
const LOCAL_KEY = 'zenhr_brand_theme';
export const isBrandTheme = (v: unknown): v is BrandThemeId => typeof v === 'string' && v in BRAND_THEMES;
export function applyBrandTheme(id: string | null | undefined) {
  const theme = BRAND_THEMES[isBrandTheme(id) ? id : 'blue'];
  const root = document.documentElement;
  Object.entries(theme.palette).forEach(([s, rgb]) => root.style.setProperty(`--brand-${s}`, rgb));
  root.style.setProperty('--primary-gradient', theme.swatch);
  try { localStorage.setItem(LOCAL_KEY, isBrandTheme(id) ? id : 'blue'); } catch { /* ignore */ }
}
export const cachedBrandTheme = (): string | null => { try { return localStorage.getItem(LOCAL_KEY); } catch { return null; } };
