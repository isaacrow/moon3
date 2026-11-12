/**
 * The OPAC's two languages: Arabic (right to left, the default) and English. The reader's choice is
 * kept in localStorage; `t(ar, en)` picks the text for the current one. The catalogue's own data
 * (titles, names, subjects) is shown as catalogued, in whatever script it was written in.
 */
export type OpacLang = 'ar' | 'en';

const KEY = 'moon-opac-lang';

function initialLang(): OpacLang {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl === 'en' || fromUrl === 'ar') return fromUrl;
    // Only the reader's own choice in the catalogue counts. The Studio keeps its own language setting
    // ('moon-language'); a cataloguer who works in English there must still find the catalogue in Arabic.
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    // No window (tests) or storage blocked: Arabic.
  }
  return 'ar';
}

let current: OpacLang = typeof window === 'undefined' ? 'ar' : initialLang();

export function opacLang(): OpacLang {
  return current;
}

export function setOpacLang(lang: OpacLang): void {
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* storage blocked */ }
}

/** The Arabic or English text, for the reader's language. */
export function t(ar: string, en: string): string {
  return current === 'en' ? en : ar;
}
