// Cross-script search keys: "Ibn Khaldun" finds "ابن خلدون", and "جلجامش" finds "Gilgamesh".
//
// Arabic script does not write short vowels, and Latin spellings of Arabic names differ in their vowels
// (Mahfouz / Maḥfūẓ / Mahfuz) and in a few consonants (Naguib / Najib). So each word on both
// sides is reduced to its consonants in one shared alphabet, with the letters that romanizations confuse put
// together (ح and ه are both "h"; ق stays "q" and ك "k", so Quran never meets the name Karen; ط and ت both "t"; Egyptian "g" is ج ...). The long vowels and
// the weak letters (ا و ي ى ة ء) and Latin vowels, w and y are left out on both sides. A word matches only a whole
// word with the same key, and keys shorter than two letters never count, so short words cannot match by chance.
// Pure, so it can be tested.

const ARABIC_KEY: Record<string, string> = {
  'ب': 'b', 'پ': 'b', 'ت': 't', 'ط': 't', 'ث': 't', 'ج': 'j', 'چ': 'j', 'ح': 'h', 'ه': 'h', 'خ': 'x',
  'د': 'd', 'ذ': 'd', 'ض': 'd', 'ر': 'r', 'ز': 'z', 'ظ': 'z', 'س': 's', 'ص': 's', 'ش': 'c', 'غ': 'g',
  'ف': 'f', 'ڤ': 'f', 'ق': 'q', 'ك': 'k', 'گ': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  // Left out: vowels and weak letters, hamza and ayn (Latin usually writes neither). و and ي are decided in
  // arabicKey: a consonant (w, y) at the start of a word or before an alif, a long vowel (left out) elsewhere.
  'ا': '', 'أ': '', 'إ': '', 'آ': '', 'ٱ': '', 'ؤ': '', 'ى': '', 'ئ': '', 'ة': '', 'ء': '', 'ع': '',
};
const ALIF = /[اآىأ]/;

const ARABIC = /[؀-ۿ]/;
// The article and the one-letter prefixes written onto an Arabic word: ال، وال، بال، فال، كال، لل.
const ARABIC_PREFIX = /^(?:[وفبك]?ال|لل)(?=[ء-ي]{2,})/;

/** The key of one Arabic word. */
function arabicKey(word: string): string {
  const w = [...word.replace(/[ً-ٰٟـ]/g, '').replace(ARABIC_PREFIX, '')];
  let out = '';
  w.forEach((ch, i) => {
    // و and ي are consonants (Karawan كروان, Yahya يحيى) at the start or before an alif; long vowels
    // (Mahfouz محفوظ, Naguib نجيب) elsewhere.
    if (ch === 'و' || ch === 'ي') { if (i === 0 || ALIF.test(w[i + 1] || '')) out += ch === 'و' ? 'w' : 'y'; return; }
    out += ARABIC_KEY[ch] ?? '';
  });
  return out.replace(/(.)\1+/g, '$1');
}

/** An Arabic word with a one-letter prefix (و ف ب ل ك) read both with and without it ("ودمنة" is "و" + "دمنة"). */
function arabicKeys(word: string): string[] {
  const keys = [arabicKey(word)];
  if (/^[وفبلك][ء-ي]{3,}$/.test(word)) keys.push(arabicKey(word.slice(1)));
  return keys;
}

/** The key of one Latin word (romanized Arabic, or an English or French spelling). */
function latinKey(word: string): string {
  let w = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[ʻʼʾʿ‘’'`´]/g, '');
  // The article written onto a name: al-Din, el-Sayed, ad-Din, ash-Shafi'i (hyphen kept by the caller).
  w = w.replace(/^(?:a|e)(?:l|[tdrzsn]|sh|th|dh)-/, '');
  w = w.replace(/-/g, '');
  w = w
    // A hard c (Cairo) is k, done before sh / ch so those keep their own letter; q stays q (ق).
    .replace(/ck|c(?=[aou])/g, 'k')
    // gh (غ) is held as "G" while a lone g becomes j: Egyptian and older spellings write ج as g (Naguib, Gamal).
    .replace(/kh/g, 'x').replace(/gh/g, 'G').replace(/sh|ch/g, 'c').replace(/th/g, 't').replace(/dh/g, 'd')
    .replace(/dj/g, 'j').replace(/p/g, 'b').replace(/v/g, 'f')
    .replace(/g/g, 'j').replace(/G/g, 'g');
  // A final h after a vowel is the ta marbuta (Fatimah = فاطمة): left out like ة.
  w = w.replace(/([aeiou])h$/, '$1');
  // w and y are consonants at the start or before a vowel (Karawan, Yahya), as و and ي are; otherwise vowels.
  w = w.replace(/[wy](?![aeiou])/g, (m, i) => (i === 0 ? m : ''));
  w = w.replace(/[aeiou]/g, '').replace(/[^a-z]/g, '');
  return w.replace(/(.)\1+/g, '$1');
}

/** The key of a word in either script; '' when it has fewer than two consonants (too short to compare). */
export function crossKey(word: string): string {
  const k = ARABIC.test(word) ? arabicKey(word) : latinKey(word);
  return k.length >= 2 ? k : '';
}

/** Words of a text, keeping the hyphen inside a Latin name ("al-Din") so the article can be recognised. */
const words = (text: string) => text.split(/[^\p{L}\p{M}\-ʻʼʾʿ‘’'`]+/u).map((w) => w.replace(/^-+|-+$/g, '')).filter(Boolean);

/** The keys of every word of the texts. */
export function crossKeys(...texts: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) if (typeof t === 'string') for (const w of words(t)) for (const k of ARABIC.test(w) ? arabicKeys(w) : [crossKey(w)]) if (k.length >= 2) out.add(k);
  return out;
}

/**
 * True when every word typed (that is long enough to compare) has a word with the same key in the texts, and the
 * query is in one script while the texts hold the other: this is for crossing scripts, not for loosening the
 * ordinary search.
 */
export function crossScriptMatch(query: string, keys: Set<string>, textHasArabic: boolean, textHasLatin: boolean): boolean {
  const qArabic = ARABIC.test(query);
  if (qArabic ? !textHasLatin : !textHasArabic) return false;
  const typed = words(query).filter((w) => ARABIC.test(w) === qArabic);
  // Words with fewer than two consonants ("Ali" علي, "Duaa" دعاء) cannot be compared and are left out; the
  // others must all match, and at least one of them must have three consonants or more, so "Ibn" (key "bn")
  // alone is never the whole of a match.
  const wanted = typed.map(crossKey).filter(Boolean);
  if (!wanted.length || Math.max(...wanted.map((k) => k.length)) < 3) return false;
  return wanted.every((k) => keys.has(k));
}
