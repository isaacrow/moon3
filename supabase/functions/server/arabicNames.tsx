/**
 * Arabic personal names (Phase 11, step 3). A classical Arabic name is built of parts — kunya (أبو …),
 * ism (the given name), nasab (بن … بن …), laqab (… الدين), nisba (البغدادي) — and a person is known by one
 * of them (the shuhra: ابن خلدون, الطوسي). LC enters the name inverted at that element, in romanization:
 * "Ibn Khaldūn, ʻAbd al-Raḥmān ibn Muḥammad, 1332-1406". Catalogues, LC, VIAF and Wikidata therefore hold
 * the same person under forms that share no first word.
 *
 * This splits a name (Arabic script or ALA-LC romanization, direct or inverted) into its parts, builds keys
 * that compare forms written differently (ابن/بن/ibn/b., al-/ال, عبد الرحمن/عبدالرحمن, hamza, diacritics),
 * scores how well two forms name the same person, and proposes the variant forms an entity should carry.
 */

const ARABIC = /[؀-ۿ]/;
const TASHKEEL = /[ً-ْٰـ]/g;

export interface NameParts {
  /** The element LC enters the name under (before its comma), when inverted. */
  entry?: string;
  kunya?: string;
  ism?: string;
  /** Father, grandfather …, in order (without بن / ibn). */
  nasab: string[];
  laqab?: string;
  nisba: string[];
  /** Dates as given ("1332-1406", "732-808 هـ"). */
  dates?: string;
  script: 'arabic' | 'latin';
}

/** Arabic letters folded as people type them interchangeably. */
export function foldArabic(s: string): string {
  return s.replace(TASHKEEL, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
}

/** Romanization folded to plain letters: ā → a, ḥ → h, ʻ ʼ removed, lower case. */
export function foldLatin(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[ʻʼʿʾ'’`]/g, '').toLowerCase();
}

// ---- Tokens ----
const AR_KUNYA = /^(ابو|ابي|ابا|ام)$/;
const AR_IBN = /^(بن|ابن|بنت|ابنه)$/;
const LA_KUNYA = /^(abu|abi|aba|umm)$/;
const LA_IBN = /^(ibn|bin|bint|b\.?|ben)$/;

/** Joins "عبد" / "Abd al-" with the word after it, and "ال" / "al-" with what follows, into one token. */
function tokens(s: string, script: 'arabic' | 'latin'): string[] {
  const words = s.split(/[\s،,]+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const f = script === 'arabic' ? foldArabic(w) : foldLatin(w);
    const isAbd = script === 'arabic' ? /^عبد$/.test(f) : /^(ʻ?abd|abdul|abdel|abdal|abd-al|abd-el|abd)$/.test(f.replace(/-$/, ''));
    if (isAbd && words[i + 1]) { out.push(`${w} ${words[i + 1]}`); i++; continue; }
    if (script === 'latin' && /^(al|el|ul)-?$/.test(f) && words[i + 1]) { out.push(`${w}${w.endsWith('-') ? '' : '-'}${words[i + 1]}`); i++; continue; }
    out.push(w);
  }
  return out;
}

const isNisba = (w: string, script: 'arabic' | 'latin') => script === 'arabic'
  ? /^ال.{2,}(ي|يه)$/.test(foldArabic(w))
  : /^(al|el)-.{2,}(i|iyah|iyya)$/.test(foldLatin(w));
const isLaqab = (w: string, script: 'arabic' | 'latin') => script === 'arabic'
  ? /(الدين|الدوله|الملك|الاسلام)$/.test(foldArabic(w))
  : /(al-din|ad-din|ud-din|uddin|al-dawlah|al-mulk|al-islam)$/.test(foldLatin(w));

/** Splits a name into its parts. LC's inverted form ("Ibn Khaldūn, ʻAbd al-Raḥmān ibn Muḥammad, 1332-1406") too. */
export function parseArabicName(raw: string): NameParts {
  const text = String(raw || '').trim().replace(/[.\s]+$/, '');
  const script: NameParts['script'] = ARABIC.test(text) ? 'arabic' : 'latin';
  let body = text;
  let dates: string | undefined;
  const dm = body.match(/[,،]?\s*((?:ت\.?\s*)?[\d٠-٩]{2,4}\??\s*-\s*(?:[\d٠-٩]{2,4}\??)?(?:\s*(?:هـ|ه|م|AH|A\.H\.))?)\s*$/);
  if (dm) { dates = dm[1].trim(); body = body.slice(0, dm.index).trim(); }
  let entry: string | undefined;
  const parts = body.split(/\s*[,،]\s*/).filter(Boolean);
  if (parts.length > 1) { entry = parts[0]; body = parts.slice(1).join(' '); }
  const out: NameParts = { nasab: [], nisba: [], script, ...(entry ? { entry } : {}), ...(dates ? { dates } : {}) };
  const ws = tokens(body, script);
  const fold = (w: string) => (script === 'arabic' ? foldArabic(w) : foldLatin(w));
  const kunyaRe = script === 'arabic' ? AR_KUNYA : LA_KUNYA;
  const ibnRe = script === 'arabic' ? AR_IBN : LA_IBN;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (kunyaRe.test(fold(w)) && ws[i + 1] && !out.kunya) { out.kunya = `${w} ${ws[i + 1]}`; i++; continue; }
    if (ibnRe.test(fold(w)) && ws[i + 1]) { out.nasab.push(ws[i + 1]); i++; continue; }
    if (isNisba(w, script) && (out.ism || out.kunya || out.nasab.length || i > 0)) { out.nisba.push(w); continue; }
    if (isLaqab(w, script) && !out.laqab) { out.laqab = w; continue; }
    if (!out.ism) { out.ism = w; continue; }
    // A second plain word after the ism with no ibn: part of a compound name or the nasab written without ibn.
    out.nasab.push(w);
  }
  return out;
}

/** Comparison key for one word: folded, without the article, ibn/bin as one, Abd joined. */
function wordKey(w: string, script: 'arabic' | 'latin'): string {
  if (script === 'arabic') {
    return foldArabic(w).replace(/\s+/g, '').replace(/^ال/, '').replace(/^عبدال/, 'عبد').replace(/^(ابن|بن)$/, 'بن').replace(/^(ابو|ابي|ابا)$/, 'ابو');
  }
  return foldLatin(w).replace(/[\s-]+/g, '').replace(/^(al|el|ul)(?=[a-z]{3})/, '').replace(/^abd(ul|el|al|ul)/, 'abd').replace(/^(ibn|bin|b\.?)$/, 'bn').replace(/^(abu|abi|aba)$/, 'abu');
}

/** Keys that identify a name however it is written; two forms of one name share at least one strong key. */
export function nameKeys(raw: string): string[] {
  const p = parseArabicName(raw);
  const k = (w?: string) => (w ? wordKey(w, p.script) : '');
  const ibn = p.script === 'arabic' ? 'بن' : 'bn';
  const keys = new Set<string>();
  const chain = [k(p.ism), ...p.nasab.map(k)].filter(Boolean);
  if (chain.length >= 2) keys.add(`chain:${chain.slice(0, 3).join(` ${ibn} `)}`);
  // The element a person is known by: the entry (LC), else "ابن X" / the last nisba / the laqab.
  if (p.entry) keys.add(`known:${p.entry.split(/\s+/).map((w) => k(w)).join(' ')}`);
  else if (p.ism && !p.nasab.length && !p.kunya && !p.nisba.length && !p.laqab) keys.add(`known:${k(p.ism)}`);
  const firstWord = (p.script === 'arabic' ? foldArabic(String(raw)) : foldLatin(String(raw))).trim().split(/[\s,،]+/)[0];
  if (/^(ابن|ibn)$/.test(firstWord) && p.nasab[0]) keys.add(`known:${ibn} ${k(p.nasab[0])}`);
  if (p.nisba.length) keys.add(`nisba:${k(p.nisba[p.nisba.length - 1])}`);
  if (p.laqab) keys.add(`laqab:${k(p.laqab)}`);
  if (p.kunya) keys.add(`kunya:${p.kunya.split(/\s+/).map((w) => k(w)).join(' ')}`);
  keys.add(`full:${[p.kunya, p.ism, ...p.nasab, p.laqab, ...p.nisba].filter(Boolean).map((w) => k(w)).join(' ')}`);
  return [...keys];
}

/**
 * How surely two forms name the same person, 0–1: the same ism-and-nasab chain or the same full name is
 * sure; the same known-by element (ابن خلدون / Ibn Khaldūn as entry) is strong; a nisba or laqab alone is
 * weak (many scholars share البغدادي). Both forms must be in the same script.
 */
export function sameNameScore(a: string, b: string): number {
  const ka = new Set(nameKeys(a));
  const kb = nameKeys(b);
  const shared = kb.filter((x) => ka.has(x));
  if (shared.some((x) => x.startsWith('full:') || x.startsWith('chain:'))) return 1;
  if (shared.some((x) => x.startsWith('known:'))) return 0.85;
  if (shared.some((x) => x.startsWith('kunya:')) && shared.some((x) => x.startsWith('nisba:') || x.startsWith('laqab:'))) return 0.7;
  if (shared.some((x) => x.startsWith('nisba:') || x.startsWith('laqab:') || x.startsWith('kunya:'))) return 0.3;
  return 0;
}

/**
 * Variant forms an entity should carry so it is found however it is searched: direct and inverted order,
 * بن and ابن, with and without the article on the known-by element, and the name without diacritics.
 */
export function nameVariants(raw: string): string[] {
  const p = parseArabicName(raw);
  const ar = p.script === 'arabic';
  const ibn = ar ? 'بن' : 'ibn';
  const out = new Set<string>();
  const direct = [p.kunya, p.ism, ...p.nasab.map((n) => `${ibn} ${n}`), p.laqab, ...p.nisba].filter(Boolean).join(' ');
  if (direct) out.add(direct);
  if (p.entry && direct) out.add(`${p.entry}${ar ? '، ' : ', '}${direct}`);
  if (p.entry) out.add(p.entry);
  if (p.ism && p.nasab.length) out.add([p.ism, ...p.nasab.map((n) => `${ibn} ${n}`)].join(' '));
  if (ar && p.nasab.length) out.add(`ابن ${p.nasab[p.nasab.length - 1]}`);
  if (ar) for (const v of [...out]) { out.add(v.replace(/(^|\s)بن(\s)/g, '$1ابن$2')); out.add(foldArabic(v)); }
  else for (const v of [...out]) out.add(foldLatin(v).replace(/(^|\s)\S/g, (m) => m.toUpperCase()));
  out.delete(String(raw).trim());
  return [...out].filter((v) => v.trim().length > 1);
}
