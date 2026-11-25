/**
 * Arabic genre and form terms (plan step B2, after Libris's SAOGF, 2025): a small open scheme of the genres and forms
 * Arabic and Islamic collections are catalogued by, رواية, ديوان, شرح, فتاوى …, each with its Arabic and English
 * label, its romanization, and its exact LCGFT term where LC has one (looked up on id.loc.gov by
 * scripts/arabic-genres.mts; a term with no exact match stays unmapped, never guessed). Published as SKOS
 * (/resource/genres-ar.ttl, CC0); the catalogue shows LCGFT genres by their Arabic label to Arabic readers.
 */
import { LCGFT_MATCHES } from "./arabicGenres.generated.tsx";

export interface GenreTerm { id: string; ar: string; en: string; romanized: string; note?: string; lcgft?: string; broader?: string }

export const ARABIC_GENRES: GenreTerm[] = [
  // Literature
  { id: "novels", ar: "رواية", en: "Novels", romanized: "riwāyah", lcgft: "Novels" },
  { id: "short-stories", ar: "قصة قصيرة", en: "Short stories", romanized: "qiṣṣah qaṣīrah", lcgft: "Short stories" },
  { id: "poetry", ar: "شعر", en: "Poetry", romanized: "shiʻr", lcgft: "Poetry" },
  { id: "diwan", ar: "ديوان", en: "Diwan (collected poems)", romanized: "dīwān", note: "A poet's collected poems.", lcgft: "Poetry", broader: "poetry" },
  { id: "love-poetry", ar: "غزل", en: "Love poetry", romanized: "ghazal", lcgft: "Love poetry", broader: "poetry" },
  { id: "elegies", ar: "رثاء", en: "Elegies", romanized: "rithāʼ", lcgft: "Elegies (Poetry)", broader: "poetry" },
  { id: "religious-poetry", ar: "مدائح", en: "Religious poetry", romanized: "madāʼiḥ", lcgft: "Religious poetry", broader: "poetry" },
  { id: "didactic-poetry", ar: "منظومة", en: "Didactic poetry", romanized: "manẓūmah", note: "A teaching text in verse (urjūzah, alfīyah).", lcgft: "Didactic poetry", broader: "poetry" },
  { id: "maqamat", ar: "مقامات", en: "Maqamat", romanized: "maqāmāt", note: "Rhymed prose tales of a rogue and a narrator.", lcgft: "Maqāmāt" },
  { id: "drama", ar: "مسرحية", en: "Drama", romanized: "masraḥīyah", lcgft: "Drama" },
  { id: "folk-tales", ar: "حكايات شعبية", en: "Folk tales", romanized: "ḥikāyāt shaʻbīyah", lcgft: "Folk tales" },
  { id: "anecdotes", ar: "نوادر", en: "Anecdotes", romanized: "nawādir", lcgft: "Anecdotes" },
  { id: "proverbs", ar: "أمثال", en: "Proverbs", romanized: "amthāl", lcgft: "Sayings" },
  { id: "essays", ar: "مقالات", en: "Essays", romanized: "maqālāt", lcgft: "Essays" },
  { id: "letters", ar: "رسائل", en: "Personal correspondence", romanized: "rasāʼil", lcgft: "Personal correspondence" },
  // Religion and law
  { id: "commentaries", ar: "شرح", en: "Commentaries", romanized: "sharḥ", note: "A commentary on another work; a ḥāshiyah is a gloss on a commentary.", lcgft: "Commentaries" },
  { id: "tafsir", ar: "تفسير", en: "Qurʼanic commentaries", romanized: "tafsīr", lcgft: "Commentaries", broader: "commentaries" },
  { id: "fatwas", ar: "فتاوى", en: "Fatwas", romanized: "fatāwá", lcgft: "Fatwas" },
  { id: "sermons", ar: "خطب", en: "Sermons", romanized: "khuṭab", lcgft: "Sermons" },
  { id: "prayers", ar: "أدعية", en: "Prayers", romanized: "adʻiyah", lcgft: "Prayers" },
  { id: "devotional", ar: "أوراد وأذكار", en: "Devotional literature", romanized: "awrād wa-adhkār", lcgft: "Devotional literature" },
  // Life and history
  { id: "biographies", ar: "سيرة وتراجم", en: "Biographies", romanized: "sīrah wa-tarājim", lcgft: "Biographies" },
  { id: "autobiographies", ar: "سيرة ذاتية ومذكرات", en: "Autobiographies", romanized: "sīrah dhātīyah", lcgft: "Autobiographies" },
  { id: "histories", ar: "تاريخ", en: "Histories", romanized: "tārīkh", note: "LCGFT has no general term for histories; LCSH subdivides by --History." },
  { id: "genealogies", ar: "أنساب", en: "Genealogies", romanized: "ansāb", note: "LCGFT has Family histories and Genealogical tables, neither the same as ansāb." },
  { id: "travel-writing", ar: "أدب الرحلات", en: "Travel writing", romanized: "riḥlah", lcgft: "Travel writing" },
  { id: "diaries", ar: "يوميات", en: "Diaries", romanized: "yawmīyāt", lcgft: "Diaries" },
  // Reference and learning
  { id: "dictionaries", ar: "معجم", en: "Dictionaries", romanized: "muʻjam", lcgft: "Dictionaries" },
  { id: "encyclopedias", ar: "موسوعة", en: "Encyclopedias", romanized: "mawsūʻah", lcgft: "Encyclopedias" },
  { id: "bibliographies", ar: "ببليوغرافيا", en: "Bibliographies", romanized: "bībliyūghrāfiyā", lcgft: "Bibliographies" },
  { id: "catalogs", ar: "فهرس", en: "Catalogs", romanized: "fihris", lcgft: "Catalogs" },
  { id: "textbooks", ar: "كتاب مدرسي", en: "Textbooks", romanized: "kitāb madrasī", lcgft: "Textbooks" },
  { id: "handbooks", ar: "دليل", en: "Handbooks and manuals", romanized: "dalīl", lcgft: "Handbooks and manuals" },
  { id: "theses", ar: "رسالة جامعية", en: "Academic theses", romanized: "risālah jāmiʻīyah", lcgft: "Academic theses" },
  { id: "proceedings", ar: "وقائع مؤتمر", en: "Conference papers and proceedings", romanized: "waqāʼiʻ muʼtamar", lcgft: "Conference papers and proceedings" },
  { id: "atlases", ar: "أطلس", en: "Atlases", romanized: "aṭlas", lcgft: "Atlases" },
  { id: "maps", ar: "خرائط", en: "Maps", romanized: "kharāʼiṭ", lcgft: "Maps" },
  { id: "periodicals", ar: "دورية", en: "Periodicals", romanized: "dawrīyah", lcgft: "Periodicals" },
  { id: "manuscripts", ar: "مخطوطات", en: "Manuscripts", romanized: "makhṭūṭāt", note: "Handwritten books; for manuscripts in Moon, the category Manuscript says this too.", lcgft: "Manuscripts" },
];

const BASE = "https://mooon.site/resource/genres-ar";
export const termUri = (id: string) => `${BASE}/${id}`;
export const lcgftOf = (id: string) => LCGFT_MATCHES[id];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const BY_LABEL = new Map<string, GenreTerm>();
for (const t of ARABIC_GENRES) {
  for (const l of [t.en, t.ar, t.romanized, LCGFT_MATCHES[t.id]?.label].filter(Boolean) as string[]) if (!BY_LABEL.has(fold(l))) BY_LABEL.set(fold(l), t);
}
/** The scheme's term for a genre as a record names it (English, Arabic, romanized, or LCGFT's label). */
export const termFor = (label: string) => BY_LABEL.get(fold(label));

const lit = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The scheme as SKOS Turtle (CC0): labels in Arabic, English and romanized; exact matches to LCGFT. */
export function toTurtle(): string {
  const head = [
    "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
    "@prefix dct: <http://purl.org/dc/terms/> .",
    "",
    `<${BASE}> a skos:ConceptScheme ;`,
    `  dct:title "Arabic genre and form terms"@en , ${lit("مصطلحات النوع والشكل العربية")}@ar ;`,
    `  dct:license <https://creativecommons.org/publicdomain/zero/1.0/> ;`,
    `  dct:publisher <https://mooon.site/> .`,
    "",
  ];
  const body = ARABIC_GENRES.map((t) => {
    const lines = [
      `<${termUri(t.id)}> a skos:Concept ;`,
      `  skos:inScheme <${BASE}> ;`,
      `  skos:prefLabel ${lit(t.ar)}@ar , ${lit(t.en)}@en ;`,
      `  skos:altLabel ${lit(t.romanized)}@ar-Latn`,
    ];
    if (t.note) lines.push(`  ; skos:scopeNote ${lit(t.note)}@en`);
    if (t.broader) lines.push(`  ; skos:broader <${termUri(t.broader)}>`);
    const m = LCGFT_MATCHES[t.id];
    // A term narrower than its LCGFT match (a dīwān is poetry, not only poetry) is a broad match, not an exact one.
    if (m) lines.push(`  ; skos:${t.broader ? "broadMatch" : "exactMatch"} <${m.uri}>`);
    return lines.join("\n") + " .";
  });
  return [...head, ...body, ""].join("\n");
}
