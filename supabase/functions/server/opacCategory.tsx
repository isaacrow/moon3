/**
 * The category model (plan step B1, after Libris 2024-2026): a reader sees one plain category (Book, Manuscript,
 * Periodical, Map, Music score, Sound recording, Video, Image, Software or data) and one format (Printed,
 * Handwritten, Online, Microform, Audio, Video, Braille), worked out from what the record already says: the types
 * of the Work and the Instance, the Work's content type and genres, the Instance's issuance, media and carrier.
 * Nothing new to catalogue; the raw genres stay as their own facet. Pure and free of the browser, so it is tested on
 * JSON-LD nodes and the server can use it too.
 */

export type CategoryId = 'book' | 'manuscript' | 'periodical' | 'article' | 'map' | 'score' | 'audio' | 'video' | 'image' | 'software' | 'object';
export type FormatId = 'print' | 'handwritten' | 'online' | 'microform' | 'audio' | 'video' | 'braille' | 'object';

export const CATEGORIES: Record<CategoryId, { ar: string; en: string }> = {
  book: { ar: 'كتاب', en: 'Book' },
  manuscript: { ar: 'مخطوط', en: 'Manuscript' },
  periodical: { ar: 'دورية', en: 'Periodical' },
  article: { ar: 'مقالة أو فصل', en: 'Article or chapter' },
  map: { ar: 'خريطة', en: 'Map' },
  score: { ar: 'مدوّنة موسيقية', en: 'Music score' },
  audio: { ar: 'تسجيل صوتي', en: 'Sound recording' },
  video: { ar: 'فيديو أو فيلم', en: 'Video or film' },
  image: { ar: 'صورة', en: 'Image' },
  software: { ar: 'برنامج أو بيانات', en: 'Software or data' },
  object: { ar: 'مجسّم أو قطعة', en: 'Object' },
};

export const FORMATS: Record<FormatId, { ar: string; en: string }> = {
  print: { ar: 'مطبوع', en: 'Printed' },
  handwritten: { ar: 'مخطوط باليد', en: 'Handwritten' },
  online: { ar: 'على الإنترنت', en: 'Online' },
  microform: { ar: 'مصغّرات فيلمية', en: 'Microform' },
  audio: { ar: 'صوت', en: 'Audio' },
  video: { ar: 'فيديو', en: 'Video' },
  braille: { ar: 'برايل', en: 'Braille' },
  object: { ar: 'قطعة', en: 'Object' },
};

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
/** Everything a value says: strings, addresses and labels, lower-cased. */
function words(v: any, depth = 0): string[] {
  if (v == null || depth > 3) return [];
  if (typeof v === 'string' || typeof v === 'number') return [String(v).toLowerCase()];
  if (Array.isArray(v)) return v.flatMap((x) => words(x, depth + 1));
  if (typeof v === 'object') {
    return [v['@id'], v['@value'], v.code, v.value, v['rdfs:label'], v.label, v['madsrdf:authoritativeLabel'], v['rdf:value']]
      .flatMap((x) => words(x, depth + 1));
  }
  return [];
}
const prop = (n: any, name: string) => [...list(n?.[`bf:${name}`]), ...list(n?.[name])];
const typesOf = (n: any) => list(n?.['@type']).filter((t) => typeof t === 'string').map((t: string) => t.replace(/^.*[/#:]/, '').toLowerCase());
/** The code at the end of an id.loc.gov vocabulary address (…/contentTypes/txt is "txt"), with the labels. */
const codesIn = (vocab: string, v: any) => words(v).map((w) => (w.includes(`/${vocab.toLowerCase()}/`) ? w.replace(/^.*\//, '') : w));

const any = (xs: string[], re: RegExp) => xs.some((x) => re.test(x));

/** The Work's category, from the Work and its Instances. */
export function categoryOf(work: any, instances: any[] = []): CategoryId {
  const wt = typesOf(work);
  const it = instances.flatMap(typesOf);
  const content = codesIn('contenttypes', prop(work, 'content'));
  const genres = words(prop(work, 'genreForm'));
  const issuance = instances.flatMap((i) => codesIn('issuance', prop(i, 'issuance')));

  if (it.includes('manuscript') || any(genres, /manuscript|مخطوط/)) return 'manuscript';
  if (wt.includes('cartography') || any(content, /^(cri|crd|crf|crm|crn|crt)$|cartographic|خريط/)) return 'map';
  if (wt.includes('notatedmusic') || any(content, /^(ntm|tcm)$|notated music|مدوّنة موسيق|نوتة/)) return 'score';
  if (wt.includes('audio') || wt.includes('musicaudio') || any(content, /^(prm|spw|snd)$|performed music|spoken word|sounds|صوت/)) return 'audio';
  if (wt.includes('movingimage') || any(content, /^(tdi|tdm|tdf)$|moving image|فيديو|فيلم/)) return 'video';
  if (wt.includes('stillimage') || any(content, /^(sti|tci)$|still image|صورة/)) return 'image';
  if (wt.includes('multimedia') || any(content, /^(cod|cop)$|computer (dataset|program)/)) return 'software';
  if (wt.includes('object') || any(content, /^(tdf|tcf)$|three-dimensional form/)) return 'object';
  if (wt.includes('serial') || any(issuance, /^serl$|serial/) || any(genres, /periodical|journal|newspaper|magazine|دوري|مجلة|صحيفة|جريدة/)) return 'periodical';
  if (any(genres, /^(articles?|book chapters?|مقال|مقالات|فصل)$|journal article/)) return 'article';
  return 'book';
}

/** An Instance's format. */
export function formatOf(instance: any, category?: CategoryId): FormatId | undefined {
  const t = typesOf(instance);
  const media = codesIn('mediatypes', prop(instance, 'media'));
  const carrier = codesIn('carriers', prop(instance, 'carrier'));
  const said = [...media, ...carrier, ...words(instance?.carrierType), ...words(instance?.mediaType)];

  if (t.includes('electronic') || any(said, /^(c|cr|cz|ck|cd)$|online|electronic|computer|إلكترون|رقمي/)) return 'online';
  if (t.includes('microform') || any(said, /^(h|h[a-z])$|microform|microfilm|microfiche|ميكرو|مصغ/)) return 'microform';
  if (t.includes('tactile') || any(said, /braille|برايل/)) return 'braille';
  if (any(said, /^(s|s[a-z])$|audio|sound|صوت/)) return 'audio';
  if (any(said, /^(v|v[a-z]|g|g[a-z])$|video|film|فيديو/)) return 'video';
  if (t.includes('manuscript') || category === 'manuscript' || any(said, /manuscript|مخطوط/)) return 'handwritten';
  if (any(said, /^nr$|object|مجسم/)) return 'object';
  if (t.includes('print') || any(said, /^(n|nc|nb|no)$|unmediated|volume|print|sheet|مجلد|مطبوع|ورق/)) return 'print';
  return undefined;
}

export const categoryLabel = (id: string, en: boolean) => (CATEGORIES as any)[id]?.[en ? 'en' : 'ar'] ?? id;
export const formatLabel = (id: string, en: boolean) => (FORMATS as any)[id]?.[en ? 'en' : 'ar'] ?? id;
