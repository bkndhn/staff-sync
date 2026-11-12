import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { THEME_STYLES, ThemeStyleId, STYLE_SETTING_KEY, applyThemeStyle, cachedThemeStyle, isThemeStyle } from '../utils/themeStyle';
import { appSettingsService } from '../services/appSettingsService';

/** Admin-only: pick the app style for the whole company (staff portal included). */
const ThemeStylePicker: React.FC = () => {
  const [current, setCurrent] = useState<ThemeStyleId>(cachedThemeStyle());
  const [saving, setSaving] = useState(false);
  useEffect(() => { appSettingsService.getSetting(STYLE_SETTING_KEY).then(v => { if (isThemeStyle(v)) setCurrent(v); }); }, []);
  const pick = async (id: ThemeStyleId) => {
    setCurrent(id); applyThemeStyle(id); setSaving(true);
    try { await appSettingsService.setSetting(STYLE_SETTING_KEY, id); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(Object.keys(THEME_STYLES) as ThemeStyleId[]).map(id => {
          const t = THEME_STYLES[id]; const on = current === id;
          return (
            <button key={id} type="button" onClick={() => pick(id)} aria-pressed={on}
              className={`text-left rounded-2xl border p-3 ${on ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-white/10'}`}>
              <div className="h-20 rounded-xl overflow-hidden relative" style={{ background: t.colors[0] }}>
                <div className="absolute left-2 top-2 right-10 h-6 rounded-lg" style={{ background: t.colors[1], border: `1px solid ${t.colors[2]}55` }} />
                <div className="absolute left-2 bottom-2 w-16 h-6 rounded-lg" style={{ background: `linear-gradient(135deg, ${t.colors[2]}, ${t.colors[3]})` }} />
                {on && <span className="absolute right-2 top-2 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center"><Check size={14} color="#fff" /></span>}
              </div>
              <p className="mt-2 font-semibold text-sm text-white">{t.label}{id === 'bold_violet' && <span className="ml-2 text-[10px] text-white/50">Default</span>}</p>
              <p className="text-xs text-white/50">{t.hint}</p>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-white/50">{saving ? 'Saving…' : 'Applies to everyone, including the staff portal.'}</p>
    </div>
  );
};
export default ThemeStylePicker;
