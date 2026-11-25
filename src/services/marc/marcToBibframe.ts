/**
 * MARC 21 bibliographic record → BIBFRAME Work, Instance and Item as the editor holds them (the same
 * shapes the Category Cards store), so an imported record opens in Moon Studio and exports like any other.
 * The reverse of bibframeToMarc for the fields it writes, plus 260 (pre-RDA publication) and ISBD
 * punctuation as Koha and other systems export it.
 */
import type { DataField, MarcRecord } from './marcRecord';
import { isControl } from './marcRecord';
import { toMarcKey } from './marcKey';

const VOCAB = 'http://id.loc.gov/vocabulary';
const data = (r: MarcRecord, tag: string) => r.fields.filter((f): f is DataField => f.tag === tag && !isControl(f));
const control = (r: MarcRecord, tag: string) => (r.fields.find((f) => f.tag === tag && isControl(f)) as any)?.data as string | undefined;
const subs = (f: DataField | undefined, code: string) => (f ? f.subfields.filter(([c]) => c === code).map(([, v]) => v) : []);
const sub = (f: DataField | undefined, code: string) => subs(f, code)[0] || '';
const link = (f: DataField) => subs(f, '0').find((v) => /^https?:\/\//.test(v)) || '';

/** Drops ISBD punctuation at the end of a value: " /", " :", " ;", ",", " =", and a closing period. */
export function clean(value: string): string {
  // Arabic punctuation too: "دار الشؤون الثقافية،" and "؛" end a field as "," and ";" do.
  let v = value.trim().replace(/\s*[\/:;,=،؛]+$/, '').trim();
  // A final period ends the field in ISBD; keep it after an initial or an abbreviation ("J.", "ed.", "p.").
  // (Unicode-aware: \b only knows ASCII letters, so "Qabasāt." would look like the initial "t.")
  if (/\.$/.test(v) && !/(?<![\p{L}\p{M}])(\p{L}|ed|p|cm|ca|vol|no)\.$/iu.test(v)) v = v.slice(0, -1);
  return v.trim();
}

const LEADER_CONTENT: Record<string, [string, string]> = { a: ['txt', 'text'], t: ['txt', 'text'], c: ['ntm', 'notated music'], d: ['ntm', 'notated music'], e: ['cri', 'cartographic image'], f: ['cri', 'cartographic image'], k: ['sti', 'still image'], i: ['spw', 'spoken word'], j: ['prm', 'performed music'], g: ['tdi', 'two-dimensional moving image'], m: ['cod', 'computer dataset'] };
const LEADER_ISSUANCE: Record<string, [string, string]> = { m: ['mono', 'single unit'], s: ['serl', 'serial'], i: ['intg', 'integrating resource'], a: ['mono', 'single unit'] };
const PROVISION_TYPE: Record<string, string> = { '0': 'bf:Production', '1': 'bf:Publication', '2': 'bf:Distribution', '3': 'bf:Manufacture' };
const NAME_TYPE: Record<string, string> = { '00': 'bf:Person', '10': 'bf:Organization', '11': 'bf:Meeting' };

const vocabNode = (path: string, label: string) => ({ '@id': `${VOCAB}/${path}`, 'rdfs:label': label });

/**
 * A Hub (bf:Hub) from a MARC title or name-title heading, as LC's marc2bibframe2 builds them (BIBFRAME
 * primer, Appendix A): Hubs stand for 130 and 1XX + 240 (the uniform title of the record's own work) and
 * for 6XX/7XX/8XX with $t and 630/730/830 (other works the record is about, relates to or belongs to).
 * The Hub keeps the heading as its authorized access point (bflc:aap, "Homer. Odyssey. English"), its title
 * parts, its creator as a primary contribution, and its URI when the field has one ($0/$1).
 */
const TITLE_PART_CODES = /[nplskfmor]/;
function hubOf(titleField: DataField, titleCode: 'a' | 't', nameField?: DataField): any | null {
  // The name as the heading has it ("Shakespeare, William, 1564-1616"), without its closing punctuation.
  const name = nameField ? clean([sub(nameField, 'a'), sub(nameField, 'b'), sub(nameField, 'c'), sub(nameField, 'q'), sub(nameField, 'd')].filter(Boolean).map((v) => v.trim()).join(' ')) : '';
  const main = clean(sub(titleField, titleCode));
  if (!main) return null;
  const after = titleField.subfields.slice(titleField.subfields.findIndex(([c]) => c === titleCode) + 1);
  const parts = after.filter(([c]) => TITLE_PART_CODES.test(c)).map(([c, v]) => [c, clean(v)] as [string, string]).filter(([, v]) => v);
  const title: any = { '@type': 'bf:Title', 'bf:mainTitle': [main, ...parts.filter(([c]) => !/[np]/.test(c)).map(([, v]) => v)].join('. ') };
  const partNumber = parts.filter(([c]) => c === 'n').map(([, v]) => v);
  const partName = parts.filter(([c]) => c === 'p').map(([, v]) => v);
  if (partNumber.length) title['bf:partNumber'] = partNumber.length === 1 ? partNumber[0] : partNumber;
  if (partName.length) title['bf:partName'] = partName.length === 1 ? partName[0] : partName;
  const hub: any = {
    '@type': 'bf:Hub',
    'bflc:aap': [name, main, ...parts.map(([, v]) => v)].filter(Boolean).join('. '),
    'bf:title': title,
  };
  const uri = [...subs(titleField, '1'), ...subs(titleField, '0')].find((v) => /^https?:\/\/id\.loc\.gov\/resources\/hubs\//.test(v) || /^https?:\/\//.test(v) && /hub|work/i.test(v));
  if (uri) hub['@id'] = uri;
  if (nameField) {
    const agent: any = { '@type': NAME_TYPE[nameField.tag.slice(1)] || 'bf:Agent', 'rdfs:label': name };
    const agentUri = nameField === titleField ? '' : link(nameField);
    if (agentUri) agent['@id'] = agentUri;
    hub['bf:contribution'] = { '@type': ['bf:Contribution', 'bf:PrimaryContribution'], 'bf:agent': agent };
  }
  // The field the Work was named in (130/240, 7XX $t, 730, 6XX $t, 8XX), as LC keeps it, so it goes back out.
  hub['bflc:marcKey'] = toMarcKey(titleField);
  return hub;
}

/** Tags Moon reads into BIBFRAME (and 880, read with the field it pairs); every other data field is kept. */
const MAPPED = /^(010|020|022|024|035|040|043|050|082|1(00|10|11|30)|24[05]|246|250|26[04]|300|33[678]|490|50[0-6]|52[01]|540|546|58[68]|6(00|10|11|30|48|50|51|53|55)|7(00|10|11|30)|8(00|10|11|30)|856|880)$/;

/** Mapped, but with subfields BIBFRAME does not hold here; kept as well (see above). */
export const PARTLY_MAPPED = /^(020|082|250|260|502|505|856)$/;

export interface ImportedMarcRecord { work: any; instance: any; item: any; title: string }

export function marcToBibframe(r: MarcRecord): ImportedMarcRecord {
  // Parallel scripts: a field with $6 880-NN has its Arabic form in the 880 whose $6 is TAG-NN.
  const linked = (f: DataField | undefined): DataField | undefined => {
    const n = (sub(f, '6').match(/^880-(\d+)/) || [])[1];
    return n && f ? data(r, '880').find((x) => sub(x, '6').startsWith(`${f.tag}-${n}`)) : undefined;
  };
  const both = (main: string, alt: string | undefined): string | string[] => {
    const m = clean(main);
    const a = alt ? clean(alt) : '';
    return a && a !== m ? [m, a] : m;
  };
  const pair = (f: DataField | undefined, code: string) => both(sub(f, code), sub(linked(f), code));
  const work: any = { '@type': 'bf:Work' };
  const instance: any = { '@type': 'bf:Instance' };
  const item: any = { '@type': 'bf:Item' };
  const leader = r.leader.padEnd(24, ' ');
  const f008 = (control(r, '008') || '').padEnd(40, ' ');

  // ---- Title and statements (245, 250) ----
  const t = data(r, '245')[0];
  if (t) {
    const title: any = { '@type': 'bf:Title', 'bf:mainTitle': pair(t, 'a') };
    if (sub(t, 'b')) title['bf:subtitle'] = pair(t, 'b');
    if (sub(t, 'n')) title['bf:partNumber'] = pair(t, 'n');
    if (sub(t, 'p')) title['bf:partName'] = pair(t, 'p');
    if (/^[1-9]$/.test(t.ind2)) title['bflc:nonSortNum'] = t.ind2;
    work['bf:title'] = title;
    instance['bf:title'] = { ...title };
    if (sub(t, 'c')) instance['bf:responsibilityStatement'] = pair(t, 'c');
  }
  // Variant titles (246), typed as LC's marc2bibframe2 types them from the second indicator.
  const VARIANT_246: Record<string, [string, string?]> = {
    '0': ['bf:VariantTitle', 'por'], '1': ['bf:ParallelTitle'], '2': ['bf:VariantTitle', 'dis'], '4': ['bf:VariantTitle', 'cov'],
    '5': ['bf:VariantTitle', 'atp'], '6': ['bf:VariantTitle', 'cap'], '7': ['bf:VariantTitle', 'run'], '8': ['bf:VariantTitle', 'spi'],
  };
  const variants = data(r, '246').map((f) => {
    const main = pair(f, 'a');
    if (!(Array.isArray(main) ? main.length : main)) return null;
    const [cls, code] = VARIANT_246[f.ind2] || ['bf:VariantTitle'];
    const v: any = { '@type': code ? [cls, `http://id.loc.gov/vocabulary/vartitletype/${code}`] : cls, 'bf:mainTitle': main };
    if (sub(f, 'b')) v['bf:subtitle'] = pair(f, 'b');
    if (sub(f, 'n')) v['bf:partNumber'] = clean(sub(f, 'n'));
    if (sub(f, 'p')) v['bf:partName'] = clean(sub(f, 'p'));
    const kind = clean(sub(f, 'i').replace(/:\s*$/, ''));
    if (kind) v['bf:variantType'] = kind;
    return v;
  }).filter(Boolean);
  if (variants.length) instance['bf:title'] = [instance['bf:title'], ...variants].filter(Boolean);
  const f250 = data(r, '250')[0];
  if (sub(f250, 'a')) instance['bf:editionStatement'] = pair(f250, 'a');

  // ---- Names (1XX primary, 7XX others) ----
  const contributions: any[] = [];
  for (const f of r.fields) {
    if (isControl(f) || !/^[17](00|10|11)$/.test(f.tag)) continue;
    if (f.tag.startsWith('7') && sub(f, 't')) continue;
    const nameOf = (x: DataField | undefined) => clean([sub(x, 'a'), sub(x, 'b'), sub(x, 'c'), sub(x, 'd')].filter(Boolean).join(' '));
    const name = nameOf(f);
    if (!name) continue;
    const agent: any = { '@type': NAME_TYPE[f.tag.slice(1)] || 'bf:Agent', 'rdfs:label': both(name, nameOf(linked(f))) };
    if (link(f)) agent['@id'] = link(f);
    // The name's own MARC (its parts in their subfields), as LC keeps it; roles ($e $4) are rebuilt from bf:role.
    agent['bflc:marcKey'] = toMarcKey(f, /^[01468e]$/);
    const roles = [...subs(f, '4').filter((c) => /^[a-z]{3}$/.test(c)), ...(subs(f, '4').length ? [] : subs(f, 'e').map(clean))];
    contributions.push({
      '@type': f.tag.startsWith('1') ? ['bf:Contribution', 'bf:PrimaryContribution'] : 'bf:Contribution',
      'bf:agent': agent,
      // A role is a node (BIBFRAME 3.0.1): the LC relator for a code, a labelled bf:Role for a term.
      ...(roles.length ? { 'bf:role': roles.map((r) => (/^[a-z]{3}$/.test(r) ? { '@id': `${VOCAB}/relators/${r}`, '@type': 'bf:Role', 'rdfs:label': r } : { '@type': 'bf:Role', 'rdfs:label': r })) } : {}),
    });
  }
  if (contributions.length) work['bf:contribution'] = contributions;

  // ---- Hubs: the work this record expresses (130, 1XX + 240), related works (7XX $t, 730) and series (8XX) ----
  const mainName = r.fields.find((f): f is DataField => !isControl(f) && /^1(00|10|11)$/.test(f.tag));
  const f130 = data(r, '130')[0];
  const f240 = data(r, '240')[0];
  const ownHub = f130 ? hubOf(f130, 'a') : f240 ? hubOf(f240, 'a', mainName) : null;
  if (ownHub) work['bf:expressionOf'] = ownHub;
  const relations: any[] = [];
  const parts: any[] = [];
  for (const f of r.fields) {
    if (isControl(f)) continue;
    const isNameTitle = /^7(00|10|11)$/.test(f.tag) && sub(f, 't');
    if (!isNameTitle && f.tag !== '730') continue;
    const hub = isNameTitle ? hubOf(f, 't', f) : hubOf(f, 'a');
    if (!hub) continue;
    // Second indicator 2: an analytical entry, a work contained in this one.
    if (f.ind2 === '2') { parts.push(hub); continue; }
    const relationship = clean(sub(f, 'i').replace(/:\s*$/, ''));
    relations.push({
      '@type': 'bf:Relation',
      ...(relationship ? { 'bf:relationship': { 'rdfs:label': relationship } } : {}),
      'bf:associatedResource': hub,
    });
  }
  for (const f of r.fields) {
    if (isControl(f) || !/^8(00|10|11|30)$/.test(f.tag)) continue;
    const hub = f.tag === '830' ? hubOf(f, 'a') : hubOf(f, 't', f);
    if (!hub) continue;
    const numbering = clean(sub(f, 'v'));
    relations.push({
      '@type': 'bf:Relation',
      'bf:relationship': { '@id': 'http://id.loc.gov/vocabulary/relationship/series', 'rdfs:label': 'series' },
      'bf:associatedResource': hub,
      ...(numbering ? { 'bf:seriesEnumeration': numbering } : {}),
    });
  }
  if (relations.length) work['bf:relation'] = relations;
  if (parts.length) work['bf:hasPart'] = parts;

  // ---- Language, content, media, carrier, issuance ----
  // The 008 language first, then every text language in 041 $a/$d (each code three letters; old records
  // run several together in one $a: "araeng").
  const langs: string[] = [];
  const lang = f008.slice(35, 38).trim();
  if (/^[a-z]{3}$/.test(lang) && !['und', 'zxx', 'mul'].includes(lang)) langs.push(lang);
  for (const f of data(r, '041')) {
    for (const v of [...subs(f, 'a'), ...subs(f, 'd')]) for (const code of v.trim().toLowerCase().match(/[a-z]{3}/g) || []) if (!langs.includes(code) && !['und', 'zxx', 'mul'].includes(code)) langs.push(code);
  }
  if (langs.length) work['bf:language'] = langs.length === 1 ? { '@id': `${VOCAB}/languages/${langs[0]}` } : langs.map((l) => ({ '@id': `${VOCAB}/languages/${l}` }));
  // Geographic area codes (043 $a "a-iq---") as the Work's geographic coverage.
  const areas = data(r, '043').flatMap((f) => subs(f, 'a')).map((v) => v.trim().replace(/-+$/, '')).filter((v) => /^[a-z]{1,3}(-[a-z]{2,3})?$/.test(v));
  if (areas.length) work['bf:geographicCoverage'] = areas.map((a) => ({ '@id': `${VOCAB}/geographicAreas/${a}` }));
  const rdaNode = (tag: string, vocab: string) => {
    const f = data(r, tag)[0];
    const code = sub(f, 'b');
    return f && code ? vocabNode(`${vocab}/${code}`, clean(sub(f, 'a')) || code) : null;
  };
  work['bf:content'] = rdaNode('336', 'contentTypes') || (LEADER_CONTENT[leader[6]] ? vocabNode(`contentTypes/${LEADER_CONTENT[leader[6]][0]}`, LEADER_CONTENT[leader[6]][1]) : undefined);
  instance['bf:media'] = rdaNode('337', 'mediaTypes') || undefined;
  instance['bf:carrier'] = rdaNode('338', 'carriers') || undefined;
  const issuance = LEADER_ISSUANCE[leader[7]];
  if (issuance) instance['bf:issuance'] = vocabNode(`issuance/${issuance[0]}`, issuance[1]);
  if (leader[6] === 't') instance['@type'] = ['bf:Instance', 'bf:Manuscript'];

  // ---- Numbers ----
  const identifiers: any[] = [];
  const number = (v: string) => v.replace(/\s*\(.*\)\s*$/, '').replace(/[^0-9Xx\-]/g, '').replace(/-/g, '');
  for (const f of data(r, '010')) if (sub(f, 'a')) identifiers.push({ '@type': 'bf:Lccn', 'rdf:value': sub(f, 'a').trim() });
  for (const f of data(r, '020')) if (number(sub(f, 'a'))) identifiers.push({ '@type': 'bf:Isbn', 'rdf:value': number(sub(f, 'a')) });
  for (const f of data(r, '022')) if (sub(f, 'a')) identifiers.push({ '@type': 'bf:Issn', 'rdf:value': sub(f, 'a').trim() });
  // Other standard numbers (024), by first indicator; 7 names its scheme in $2 (doi, hdl, uri …).
  const STANDARD: Record<string, string> = { '0': 'bf:Isrc', '1': 'bf:Upc', '2': 'bf:Ismn', '3': 'bf:Ean', '4': 'bf:Sici' };
  const SCHEME: Record<string, string> = { doi: 'bf:Doi', hdl: 'bf:Hdl', isni: 'bf:Isni', orcid: 'bf:Identifier', uri: 'bf:Identifier' };
  for (const f of data(r, '024')) {
    const value = sub(f, 'a').trim();
    if (!value) continue;
    const scheme = sub(f, '2').trim().toLowerCase();
    const type = STANDARD[f.ind1] || SCHEME[scheme] || 'bf:Identifier';
    identifiers.push({ '@type': type, 'rdf:value': value, ...(type === 'bf:Identifier' && scheme ? { 'bf:source': { '@type': 'bf:Source', 'rdfs:label': scheme } } : {}) });
  }
  // System control numbers (035 "(OCoLC)12345"): local identifiers, with the agency in the parentheses.
  for (const f of data(r, '035')) {
    const m = sub(f, 'a').trim().match(/^\(([^)]+)\)\s*(.+)$/);
    const value = m ? m[2] : sub(f, 'a').trim();
    if (value) identifiers.push({ '@type': 'bf:Local', 'rdf:value': value, ...(m ? { 'bf:assigner': { '@type': 'bf:Organization', 'rdfs:label': m[1] } } : {}) });
  }
  if (identifiers.length) instance['bf:identifiedBy'] = identifiers;

  // ---- Classification ----
  const classes: any[] = [];
  for (const f of data(r, '050')) if (sub(f, 'a')) classes.push({ '@type': 'bf:ClassificationLcc', 'bf:classificationPortion': sub(f, 'a'), ...(sub(f, 'b') ? { 'bf:itemPortion': sub(f, 'b') } : {}) });
  for (const f of data(r, '082')) if (sub(f, 'a')) classes.push({ '@type': 'bf:ClassificationDdc', 'bf:classificationPortion': sub(f, 'a').replace(/\//g, '') });
  if (classes.length) work['bf:classification'] = classes;

  // ---- Publication (264, or 260 in older records) ----
  const country = f008.slice(15, 18).trim();
  const provisions = [...data(r, '264'), ...data(r, '260')].map((f) => {
    const p: any = { '@type': f.tag === '260' ? 'bf:Publication' : PROVISION_TYPE[f.ind2] || 'bf:Publication' };
    const alt = linked(f);
    const places = subs(f, 'a').map((v, i) => both(v, subs(alt, 'a')[i])).filter((v) => (Array.isArray(v) ? v.length : v));
    if (places.length) p['bf:place'] = places.map((label, i) => (i === 0 && /^[a-z]{2,3}$/.test(country) && country !== 'xx'
      ? { '@id': `${VOCAB}/countries/${country}`, 'rdfs:label': label } : { 'rdfs:label': label }));
    const agents = subs(f, 'b').map((v, i) => both(v, subs(alt, 'b')[i])).filter((v) => (Array.isArray(v) ? v.length : v));
    if (agents.length) p['bf:agent'] = agents.map((label) => ({ 'rdfs:label': label }));
    if (sub(f, 'c')) p['bf:date'] = clean(sub(f, 'c'));
    return p;
  }).filter((p) => Object.keys(p).length > 1);
  if (provisions.length) instance['bf:provisionActivity'] = provisions;

  // ---- Description, series, notes ----
  const f300 = data(r, '300')[0];
  if (sub(f300, 'a')) instance['bf:extent'] = { '@type': 'bf:Extent', 'rdfs:label': clean([sub(f300, 'a').replace(/\s*:\s*$/, ''), sub(f300, 'b')].filter(Boolean).join(' : ')) };
  if (sub(f300, 'c')) instance['bf:dimensions'] = clean(sub(f300, 'c'));
  const series = data(r, '490').flatMap((f) => {
    const s = (x: DataField | undefined) => [sub(x, 'a'), sub(x, 'v')].filter(Boolean).join(' ; ');
    const v = both(s(f), s(linked(f)));
    return Array.isArray(v) ? v : [v];
  }).filter(Boolean);
  if (series.length) instance['bf:seriesStatement'] = series.length === 1 ? series[0] : series;
  const notes = data(r, '500').map((f) => sub(f, 'a')).filter(Boolean);
  if (notes.length) work['bf:note'] = notes.map((n) => ({ '@type': 'bf:Note', 'rdfs:label': n }));
  const summaries = data(r, '520').map((f) => sub(f, 'a')).filter(Boolean);
  if (summaries.length) work['bf:summary'] = summaries.map((v) => ({ '@type': 'bf:Summary', 'rdfs:label': v }));
  // Notes with their own BIBFRAME homes, as LC's marc2bibframe2 places them.
  const label = (tag: string, codes = 'a') => data(r, tag).map((f) => f.subfields.filter(([c]) => codes.includes(c)).map(([, v]) => v.trim()).filter(Boolean).join(' ')).filter(Boolean);
  const dissertations = data(r, '502').map((f) => {
    const d: any = { '@type': 'bf:Dissertation' };
    if (sub(f, 'a')) d['rdfs:label'] = clean(sub(f, 'a'));
    if (sub(f, 'b')) d['bf:degree'] = clean(sub(f, 'b'));
    if (sub(f, 'c')) d['bf:grantingInstitution'] = { '@type': 'bf:Organization', 'rdfs:label': clean(sub(f, 'c')) };
    if (sub(f, 'd')) d['bf:date'] = clean(sub(f, 'd'));
    return Object.keys(d).length > 1 ? d : null;
  }).filter(Boolean);
  if (dissertations.length) work['bf:dissertation'] = dissertations;
  const bibliographies = label('504');
  if (bibliographies.length) instance['bf:supplementaryContent'] = bibliographies.map((v) => ({
    '@type': 'bf:SupplementaryContent', '@id': `${VOCAB}/msupplcont/bibliography`, 'rdfs:label': 'bibliography', 'bf:note': { '@type': 'bf:Note', 'rdfs:label': v },
  }));
  const contents = label('505', 'agrt');
  if (contents.length) work['bf:tableOfContents'] = contents.map((v) => ({ '@type': 'bf:TableOfContents', 'rdfs:label': v }));
  const audiences = label('521');
  if (audiences.length) work['bf:intendedAudience'] = audiences.map((v) => ({ '@type': 'bf:IntendedAudience', 'rdfs:label': v }));
  const policies = [
    ...label('506').map((v) => ({ '@type': 'bf:AccessPolicy', 'rdfs:label': v })),
    ...label('540').map((v) => ({ '@type': 'bf:UsePolicy', 'rdfs:label': v })),
  ];
  if (policies.length) instance['bf:usageAndAccessPolicy'] = policies;
  const typedNotes = [
    ...label('546', 'ab').map((v) => ({ '@type': 'bf:Note', 'bf:noteType': 'language', 'rdfs:label': v })),
    ...label('588').map((v) => ({ '@type': 'bf:Note', 'bf:noteType': 'description source', 'rdfs:label': v })),
    ...label('586').map((v) => ({ '@type': 'bf:Note', 'bf:noteType': 'awards', 'rdfs:label': v })),
  ];
  if (typedNotes.length) instance['bf:note'] = typedNotes;

  // ---- Subjects and genre ----
  const SUBJECT_TYPE: Record<string, string> = { '600': 'bf:Person', '610': 'bf:Organization', '611': 'bf:Meeting', '630': 'bf:Hub', '650': 'bf:Topic', '651': 'bf:Place' };
  const subjects = r.fields.filter((f): f is DataField => !isControl(f) && !!SUBJECT_TYPE[f.tag]).map((f) => {
    // A heading with subdivisions ($x $y $z $v) is one subject, as LC writes it: "Philosophy--History".
    // A work as subject with no subdivisions is the work's Hub; with subdivisions LC keeps one heading.
    const subdivided = f.subfields.some(([c]) => /[xyzv]/.test(c));
    if (!subdivided && (f.tag === '630' || (/^6(00|10|11)$/.test(f.tag) && sub(f, 't')))) {
      const hub = f.tag === '630' ? hubOf(f, 'a') : hubOf(f, 't', f);
      if (hub) return hub;
    }
    const heading = f.subfields.filter(([c]) => /[abcdtxyzv]/.test(c)).map(([, v]) => clean(v)).filter(Boolean).join('--');
    const node: any = { '@type': SUBJECT_TYPE[f.tag] === 'bf:Hub' || sub(f, 't') ? 'bf:Topic' : SUBJECT_TYPE[f.tag], 'rdfs:label': heading };
    if (link(f)) node['@id'] = link(f);
    node['bflc:marcKey'] = toMarcKey(f);
    return heading ? node : null;
  }).filter(Boolean);
  // Chronological terms (648) and uncontrolled index terms (653).
  for (const f of data(r, '648')) {
    const heading = f.subfields.filter(([c]) => /[axyzv]/.test(c)).map(([, v]) => clean(v)).filter(Boolean).join('--');
    if (heading) subjects.push({ '@type': 'bf:Temporal', 'rdfs:label': heading, ...(link(f) ? { '@id': link(f) } : {}) });
  }
  for (const f of data(r, '653')) for (const v of subs(f, 'a').map(clean).filter(Boolean)) {
    subjects.push({ '@type': 'bf:Topic', 'rdfs:label': v, 'bf:source': { '@type': 'bf:Source', 'rdfs:label': 'uncontrolled' } });
  }
  if (subjects.length) work['bf:subject'] = subjects;
  const genres = data(r, '655').map((f) => {
    const node: any = { '@type': 'bf:GenreForm', 'rdfs:label': clean(sub(f, 'a')) };
    if (link(f)) node['@id'] = link(f);
    node['bflc:marcKey'] = toMarcKey(f);
    return node['rdfs:label'] ? node : null;
  }).filter(Boolean);
  if (genres.length) work['bf:genreForm'] = genres;

  const urls = data(r, '856').map((f) => sub(f, 'u')).filter(Boolean);
  if (urls.length) item['bf:electronicLocator'] = urls;

  // Fields Moon has no BIBFRAME for (773 host item, 041 language codes, 340, 56X provenance, local 9XX …)
  // are kept as they are, so they go back out on export instead of being lost.
  // Fields Moon maps only in part (020 $q $c, 082 prime marks, 250 $b, 260 as it was, 502 $b-$d, 505 $t $r, 856 $d $f $z …) are kept too: on export the kept
  // field is used while it still says what the record says (see bibframeToMarc), else Moon's own is.
  const kept = r.fields.filter((f): f is DataField => !isControl(f) && (!MAPPED.test(f.tag) || PARTLY_MAPPED.test(f.tag))).map((f) => toMarcKey(f, /^$/));
  if (kept.length) instance['moonext:marcField'] = kept;

  for (const node of [work, instance]) for (const k of Object.keys(node)) if (node[k] === undefined) delete node[k];
  const title = work['bf:title']?.['bf:mainTitle'] || control(r, '001') || 'Untitled';
  return { work, instance, item, title };
}
