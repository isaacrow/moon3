/**
 * Citations and reference-manager exports for a catalogue record: APA (7th), Chicago (author-date), MLA (9th),
 * BibTeX and RIS (EndNote, Zotero, Mendeley, RefWorks). The author is given in the script of the book's own
 * title (an Arabic book cites its author in Arabic, an English book in Latin letters), and the year is the
 * edition's publication year, Hijri years kept as the book prints them.
 */

type Person = { name?: string; nameArabic?: string; nameEnglish?: string; role?: string };
export interface CiteWork {
  id: string;
  uri?: string;
  title: string;
  subtitle?: string;
  language?: string;
  originDate?: string;
  primaryCreator?: Person;
  contributors?: Person[];
  subjects?: Array<{ label?: string }>;
  series?: string;
  instances?: Array<{ publisher?: string; publicationPlace?: string; publicationYear?: string; isbn?: string; extent?: string; edition?: string }>;
}

export interface Citations { apa: string; chicago: string; mla: string; bibtex: string; ris: string }

const ARABIC = /[؀-ۿ]/;
const UNKNOWN = /^(unknown|anonymous|غير معروف|مؤلف غير معروف|مؤلف غير محدد|مجهول)$/i;

/** The author's name in the book's own script, or '' when there is none. */
export function citeName(p: Person | undefined, arabicBook: boolean): string {
  if (!p) return '';
  const forms = arabicBook ? [p.nameArabic, p.name, p.nameEnglish] : [p.nameEnglish, p.name, p.nameArabic];
  const pick = forms.map((x) => (x || '').trim()).find((x) => x && !UNKNOWN.test(x) && (arabicBook ? true : !ARABIC.test(x)))
    || forms.map((x) => (x || '').trim()).find((x) => x && !UNKNOWN.test(x)) || '';
  // Authority forms end with dates ("Irwin, Robert, 1946-"): a citation leaves them out.
  return pick.replace(/,?\s*(\d{3,4}|\d{3,4}\s*-\s*\d{0,4}|\d{3,4}-)\s*\.?$/, '').replace(/,\s*$/, '').trim();
}

/** The year as printed, its first four digits (Latin or Arabic-Indic), or ''. */
export function citeYear(raw: string | undefined): string {
  const s = String(raw || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return s.match(/\d{4}/)?.[0] || '';
}

const end = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);
const bibEscape = (s: string) => s.replace(/[{}]/g, '');

export function generateCitations(w: CiteWork): Citations {
  const arabicBook = ARABIC.test(w.title);
  const inst = (w.instances || [])[0] || {};
  const authors = [w.primaryCreator, ...(w.contributors || []).filter((c) => /author|مؤلف/i.test(c.role || ''))]
    .map((p) => citeName(p, arabicBook)).filter(Boolean)
    .filter((n, i, all) => all.indexOf(n) === i);
  const author = authors.join(arabicBook ? '، ' : '; ');
  const fullTitle = w.subtitle ? `${w.title}: ${w.subtitle}` : w.title;
  const year = citeYear(inst.publicationYear) || citeYear(w.originDate);
  const yearOrNd = year || (arabicBook ? 'د.ت' : 'n.d.');
  const publisher = (inst.publisher || '').trim();
  const place = (inst.publicationPlace || '').trim();
  const edition = (inst.edition || '').trim();
  const url = w.uri || '';
  // A language given as an address (id.loc.gov/vocabulary/languages/eng) is cited by its code.
  const language = (w.language || '').split('/').pop() || '';

  const apa = [
    author ? end(author) : '',
    `(${yearOrNd}).`,
    end(fullTitle) + (edition ? ` (${edition}).` : ''),
    publisher ? end(publisher) : '',
    url,
  ].filter(Boolean).join(' ');

  const chicago = [
    author ? end(author) : '',
    end(yearOrNd),
    end(fullTitle),
    edition ? end(edition) : '',
    [place, publisher].filter(Boolean).join(': ') ? end([place, publisher].filter(Boolean).join(': ')) : '',
    url,
  ].filter(Boolean).join(' ');

  const mla = [
    author ? end(author) : '',
    end(fullTitle),
    edition ? `${edition},` : '',
    publisher ? `${publisher},` : '',
    end(yearOrNd),
  ].filter(Boolean).join(' ');

  const bib: Array<[string, string]> = [
    ['author', authors.join(' and ')], ['title', fullTitle], ['year', year], ['edition', edition],
    ['publisher', publisher], ['address', place], ['isbn', inst.isbn || ''], ['series', w.series || ''],
    ['language', language], ['url', url],
  ];
  const bibtex = `@book{${w.id.replace(/[^A-Za-z0-9_:-]/g, '')},\n${bib.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${bibEscape(v)}}`).join(',\n')}\n}`;

  const ris = [
    'TY  - BOOK',
    ...authors.map((a) => `AU  - ${a}`),
    `TI  - ${fullTitle}`,
    year && `PY  - ${year}`,
    edition && `ET  - ${edition}`,
    publisher && `PB  - ${publisher}`,
    place && `CY  - ${place}`,
    inst.isbn && `SN  - ${inst.isbn}`,
    w.series && `T3  - ${w.series}`,
    language && `LA  - ${language}`,
    ...(w.subjects || []).map((s) => s.label).filter(Boolean).map((k) => `KW  - ${k}`),
    url && `UR  - ${url}`,
    'ER  - ',
  ].filter(Boolean).join('\r\n');

  return { apa, chicago, mla, bibtex, ris };
}
