/**
 * The catalogue's pages for a publisher, a series and a genre (OPAC plan, stage 3): which books belong to each, and
 * the list of all of them, the way placesOf / worksAtPlace do for places. Names are compared folded (case, accents,
 * punctuation and Arabic letter forms ignored), so "Penguin Books" and "Penguin books," are one publisher; each is
 * shown as most of its books write it. A series is named without its number ("Dirāsāt fī al-adab al-ʻArabī ; 27"
 * is number 27 of "Dirāsāt fī al-adab al-ʻArabī"), and its books are listed in number order. Pure, so it is tested.
 */
import { fold } from './searchIndex';

export interface GroupWork {
  id: string;
  series?: string;
  genreForm?: string[];
  publisher?: { name?: string };
  instances?: Array<{ publisher?: string }>;
}

export interface Group { name: string; count: number }

/** "Name ; 27" → { name: "Name", number: "27" }; "Name — القسم الفلسفي 14" keeps its part name. */
export function seriesParts(raw: string | undefined): { name: string; number: string } {
  const s = String(raw || '').trim();
  const m = s.match(/^(.*?)\s*[;؛]\s*(.+)$/);
  return m ? { name: m[1].trim(), number: m[2].trim() } : { name: s, number: '' };
}

const publishersOfWork = (w: GroupWork) => [...new Set([...(w.instances || []).map(i => i.publisher), w.publisher?.name]
  .map(p => String(p || '').trim().replace(/[,;:.\s]+$/, '')).filter(Boolean))];
const seriesOfWork = (w: GroupWork) => (w.series ? [seriesParts(w.series).name].filter(Boolean) : []);
const genresOfWork = (w: GroupWork) => [...new Set((w.genreForm || []).map(g => g.trim()).filter(Boolean))];

type Kind = 'publisher' | 'series' | 'genre';
const capitals = (s: string) => (s.match(/\p{Lu}/gu) || []).length;
const NAMES: Record<Kind, (w: GroupWork) => string[]> = { publisher: publishersOfWork, series: seriesOfWork, genre: genresOfWork };

/** Every publisher, series or genre in the catalogue, with how many books it has, most books first. */
export function groupsOf(kind: Kind, works: GroupWork[]): Group[] {
  const byKey = new Map<string, { forms: Map<string, number>; ids: Set<string> }>();
  for (const w of works) {
    for (const name of NAMES[kind](w)) {
      const k = fold(name);
      if (!k) continue;
      if (!byKey.has(k)) byKey.set(k, { forms: new Map(), ids: new Set() });
      const g = byKey.get(k)!;
      g.forms.set(name, (g.forms.get(name) || 0) + 1);
      g.ids.add(w.id);
    }
  }
  return [...byKey.values()]
    // The form most books write; on a tie, the one with more capitals ("Penguin Books" over "Penguin books").
    .map(g => ({ name: [...g.forms.entries()].sort((a, b) => b[1] - a[1] || capitals(b[0]) - capitals(a[0]) || a[0].localeCompare(b[0]))[0][0], count: g.ids.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The books of one publisher, series or genre; a series in number order (books without a number last). */
export function worksOfGroup<T extends GroupWork>(kind: Kind, works: T[], name: string): T[] {
  const k = fold(kind === 'series' ? seriesParts(name).name : name);
  if (!k) return [];
  const found = works.filter(w => NAMES[kind](w).some(n => fold(n) === k));
  if (kind !== 'series') return found;
  const num = (w: T) => { const n = parseFloat(seriesParts(w.series).number.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/^\D+/, '')); return Number.isFinite(n) ? n : Infinity; };
  return [...found].sort((a, b) => num(a) - num(b));
}
