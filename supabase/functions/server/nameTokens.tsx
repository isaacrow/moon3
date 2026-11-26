/**
 * Do two names belong to one person? Words of a name folded (no diacritics, one alef, "al-" dropped) and compared.
 * Pure and free of the browser: the catalogue's record reader (opacWork.tsx) uses it to tell when a statement of
 * responsibility and a linked heading name the same author, on the page and on the server alike.
 */

const AR_DIACRITICS = /[ً-ٰٟـ]/g;

/** Words of a name, folded: no diacritics, alef/yaa/taa marbuta unified, "al-"/"ال" dropped, Latin accents gone. */
export function nameTokens(name: string): string[] {
  const s = (name || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(AR_DIACRITICS, '')
    .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[ʻʼ'’`‘]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ');
  return s.split(' ')
    .map((w) => w.replace(/^(al|el)(?=[a-z]{3,})/, '').replace(/^ال(?=\p{L}{3,})/u, ''))
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !['dr', 'د'].includes(w));
}

/** Two names share a real word (so "Darwish, Mahmoud" and "Mahmoud Darwish" match, "Eberhard, Birgit" does not). */
export function namesAgree(a: string, b: string): boolean {
  const x = new Set(nameTokens(a));
  return nameTokens(b).some((w) => x.has(w));
}
