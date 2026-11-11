import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { BRAND_THEMES, BrandThemeId, THEME_SETTING_KEY, applyBrandTheme, cachedBrandTheme, isBrandTheme } from '../utils/brandTheme';
import { appSettingsService } from '../services/appSettingsService';

/** Admin-only colour picker; the choice is saved for the whole company. */
const BrandThemePicker: React.FC = () => {
  const [current, setCurrent] = useState<string>(cachedBrandTheme() || 'blue');
  const [saving, setSaving] = useState(false);
  useEffect(() => { appSettingsService.getSetting(THEME_SETTING_KEY).then(v => { if (isBrandTheme(v)) setCurrent(v); }); }, []);
  const pick = async (id: BrandThemeId) => {
    setCurrent(id); applyBrandTheme(id); setSaving(true);
    await appSettingsService.setSetting(THEME_SETTING_KEY, id);
    setSaving(false);
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {(Object.keys(BRAND_THEMES) as BrandThemeId[]).map(id => {
          const t = BRAND_THEMES[id]; const on = current === id;
          return (
            <button key={id} type="button" onClick={() => pick(id)} aria-pressed={on}
              className={`group flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all duration-200 active:scale-95 hover:-translate-y-0.5 ${on ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/5'}`}>
              <span className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110" style={{ background: t.swatch }}>
                {on && <Check size={18} color="#fff" />}
              </span>
              <span className="text-xs text-white/80">{t.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-white/50">{saving ? 'Saving…' : 'Applies to everyone in your company.'}</p>
    </div>
  );
};
export default BrandThemePicker;
