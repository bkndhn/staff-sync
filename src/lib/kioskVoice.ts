// Spoken punch confirmations for the face kiosk (uses the phone's built-in voices, works offline).

export type VoiceLang = 'en' | 'hi' | 'ta' | 'off';

export const PUNCH_PHRASES: Record<Exclude<VoiceLang, 'off'>, { in: (n: string) => string; out: (n: string) => string; bcp: string }> = {
  en: { in: n => `Welcome ${n}, punched in`, out: n => `Thank you ${n}, punched out`, bcp: 'en-IN' },
  hi: { in: n => `नमस्ते ${n}, आपकी हाज़िरी लग गई`, out: n => `धन्यवाद ${n}, आपका आउट दर्ज हो गया`, bcp: 'hi-IN' },
  ta: { in: n => `வணக்கம் ${n}, வருகை பதிவு செய்யப்பட்டது`, out: n => `நன்றி ${n}, வெளியேற்றம் பதிவு செய்யப்பட்டது`, bcp: 'ta-IN' },
};

const VALID: VoiceLang[] = ['en', 'hi', 'ta', 'off'];

/** Saved kiosk language; anything unknown falls back to English. */
export const readVoiceLang = (): VoiceLang => {
  try {
    const v = localStorage.getItem('kioskVoiceLang') as VoiceLang | null;
    return v && VALID.includes(v) ? v : 'en';
  } catch { return 'en'; }
};

/** Speaks the punch in the chosen language; falls back to English when the phone has no voice for it.
 *  Returns the text spoken (or null when muted / speech unavailable). */
export const speakPunch = (kind: 'in' | 'out', name: string, lang: VoiceLang): string | null => {
  if (lang === 'off') return null;
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const p = PUNCH_PHRASES[lang] ?? PUNCH_PHRASES.en;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang === p.bcp) || voices.find(v => v.lang.startsWith(lang));
    const phrases = voice ? p : PUNCH_PHRASES.en;
    const text = phrases[kind](name);
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-IN';
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
    return text;
  } catch { return null; }
};
