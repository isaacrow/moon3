/**
 * Majmūʿ and other aggregates (Phase 13 S12): one volume (one Instance) holding several works, as Arabic
 * manuscripts and printed collections often do. BIBFRAME 3.0.1 has no aggregate class, so Moon follows
 * LC's MARC conversion: the volume's Work names each work inside it with bf:hasPart (a bf:Work with its own
 * title and author, and its Moon or LC address when it has one); MARC export writes them as 700/710 $t or
 * 740, and import reads them back. Whoever gathered the volume is a contribution with the role compiler.
 * The OPAC lists them on the record and finds the volume by each work's own title.
 */

export interface ContainedWork { title: string; creator?: string; creatorUri?: string; uri?: string; locator?: string }

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const text = (v: any): string => {
  for (const x of list(v)) {
    if (typeof x === 'string' && x.trim()) return x.trim();
    if (x && typeof x === 'object') {
      if (typeof x['@value'] === 'string' && x['@value'].trim()) return x['@value'].trim();
      const inner = text(x['bf:mainTitle'] ?? x.mainTitle ?? x['rdfs:label'] ?? x.label);
      if (inner) return inner;
    }
  }
  return '';
};
const isUri = (s?: string) => !!s && /^https?:\/\/\S+$/.test(s);

/** The works a volume contains, from its Work's bf:hasPart (records from MARC, the editor or elsewhere). */
export function containedWorks(work: any): ContainedWork[] {
  return list(work?.['bf:hasPart'] ?? work?.hasPart).map((p: any): ContainedWork | null => {
    if (typeof p === 'string') return p.trim() ? { title: p.trim() } : null;
    const title = text(p['bf:title'] ?? p.title) || text(p['rdfs:label'] ?? p.label) || text(p['bflc:marcKey'] ? '' : '');
    if (!title) return null;
    const c = list(p['bf:contribution'] ?? p.contribution)[0];
    const agent = c?.['bf:agent'] ?? c?.agent;
    const creator = text(agent?.['rdfs:label'] ?? agent?.label ?? agent);
    const locator = text(p['bf:partNumber'] ?? p['bf:note']?.['rdfs:label']);
    return {
      title,
      ...(creator ? { creator } : {}),
      ...(isUri(agent?.['@id']) ? { creatorUri: agent['@id'] } : {}),
      ...(isUri(p['@id']) ? { uri: p['@id'] } : {}),
      ...(locator ? { locator } : {}),
    };
  }).filter((x): x is ContainedWork => !!x);
}

/** One contained work as a BIBFRAME node. */
export function partNode(w: ContainedWork): any {
  const node: any = { '@type': 'bf:Work', 'bf:title': { '@type': 'bf:Title', 'bf:mainTitle': w.title.trim() } };
  if (isUri(w.uri)) node['@id'] = w.uri;
  if (w.creator?.trim() || isUri(w.creatorUri)) {
    node['bf:contribution'] = {
      '@type': ['bf:Contribution', 'bf:PrimaryContribution'],
      'bf:agent': { ...(isUri(w.creatorUri) ? { '@id': w.creatorUri } : {}), '@type': 'bf:Person', ...(w.creator?.trim() ? { 'rdfs:label': w.creator.trim() } : {}) },
      'bf:role': { '@id': 'http://id.loc.gov/vocabulary/relators/aut', 'rdfs:label': 'author' },
    };
  }
  if (w.locator?.trim()) node['bf:note'] = { '@type': 'bf:Note', 'rdfs:label': w.locator.trim() };
  return node;
}

/** The Work with its contained works replaced (none: bf:hasPart removed). */
export function withContainedWorks(work: any, works: ContainedWork[]): any {
  const { 'bf:hasPart': _a, hasPart: _b, ...rest } = work || {};
  const parts = works.filter((w) => w.title?.trim()).map(partNode);
  return parts.length ? { ...rest, 'bf:hasPart': parts } : rest;
}

const COMPILER = 'http://id.loc.gov/vocabulary/relators/com';
/** The volume's compiler (role com), if it has one. */
export function compilerOf(work: any): string {
  const c = list(work?.['bf:contribution']).find((x: any) => list(x?.['bf:role']).some((r: any) => r?.['@id'] === COMPILER || /compiler|جامع/i.test(text(r))));
  return c ? text(c['bf:agent']?.['rdfs:label'] ?? c['bf:agent']) : '';
}

/** The Work with its compiler set (empty: removed). Other contributions are left as they are. */
export function withCompiler(work: any, name: string): any {
  const others = list(work?.['bf:contribution']).filter((x: any) => !list(x?.['bf:role']).some((r: any) => r?.['@id'] === COMPILER));
  const next = name.trim()
    ? [...others, { '@type': 'bf:Contribution', 'bf:agent': { '@type': 'bf:Person', 'rdfs:label': name.trim() }, 'bf:role': { '@id': COMPILER, 'rdfs:label': 'compiler' } }]
    : others;
  const { 'bf:contribution': _c, ...rest } = work || {};
  return next.length ? { ...rest, 'bf:contribution': next } : rest;
}
