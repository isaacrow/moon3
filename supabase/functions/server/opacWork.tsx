/**
 * The catalogue's record reader: a stored BIBFRAME record (as the published list gives it) read into the work the
 * catalogue shows, searches and counts in its filters — title, author and contributors, subjects, editions with
 * their year, format and copies, relations, genres, category. Pure and free of the browser, so the catalogue page
 * (src/services/wolfMoonOpacService.ts) and the server read a record by exactly the same rules. Moved here unchanged
 * from the page's service; the only difference is that the address entity URIs are built on is a parameter
 * (the page passes its own origin + /entity).
 */
import { normalizeForOpac } from './opacNormalizeGraph.tsx';
import { namesAgree } from './nameTokens.tsx';
import { nodeToCopy, hasCopyData } from './itemCopies.tsx';
import type { TransmissionEvent } from './transmission.tsx';
import { containedWorks as readContainedWorks, type ContainedWork } from './majmu.tsx';
import { categoryOf, formatOf, type CategoryId, type FormatId } from './opacCategory.tsx';
import { isRelationTerm, LC_RELATIONSHIP, readWorkRelations, relationWords } from './workRelations.tsx';

/**
 * Normalizes Arabic text for diacritic-insensitive, hamza-insensitive searching
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel / harakat
    .replace(/[إأآا]/g, 'ا') // normalize alef variants
    .replace(/[يى]/g, 'ي') // normalize yaa / alef maksura
    .replace(/[ة]/g, 'ه') // normalize taa marbuta
    .replace(/\u0640/g, '') // remove tatweel / kashida
    .replace(/\s+/g, ' ')
    .trim();
}

export type EntityKind = 'work' | 'instance' | 'item' | 'agent' | 'subject' | 'publisher';

/** An entity's address under `base` (".../entity"): the id without its "person-"/"subj-" … prefix. */
export function entityIri(base: string, type: EntityKind, id: string): string {
  const cleanId = encodeURIComponent(id.replace(/^[a-z]+-/, ''));
  return `${base}/${type}/${cleanId}`;
}

export interface OpacPersonEntity {
  id: string;
  uri: string;
  canonicalMoonUri: string;
  name: string;
  nameArabic: string;
  nameEnglish?: string;
  birthDate?: string;
  deathDate?: string;
  lifespan?: string;
  role: string;
  viafUri?: string;
  locUri?: string;
  isniUri?: string;
  wikidataId?: string;
  /** The person's links in the records (LC, VIAF, Wikidata, their Moon entity …), for their photo and links. */
  authorityLinks?: string[];
  /** Other headings the records give them ("درويش، محمود، 1941-2008"). */
  otherNames?: string[];
  bioArabic?: string;
  bioEnglish?: string;
  disciplines?: string[];
  affiliation?: string;
  city?: string;
  avatarUrl?: string;
  worksCount: number;
  workIds: string[];
  suggestedWorks?: string[];
}

export interface OpacSubjectEntity {
  id: string;
  uri: string;
  label: string;
  labelEnglish?: string;
  scheme: 'lcsh' | 'fast' | 'arabic-authority' | 'dewey';
  notationDdc?: string;
  notationLcc?: string;
  broader?: string;
  narrower?: string[];
  related?: string[];
  worksCount: number;
  workIds: string[];
}

export interface OpacPublisherEntity {
  id: string;
  name: string;
  city?: string;
  country?: string;
  worksCount: number;
  workIds: string[];
}

export interface OpacInstanceEntity {
  id: string;
  uri: string;
  title: string;
  subtitle?: string;
  workId: string;
  workTitle: string;
  publisher?: string;
  publicationPlace?: string;
  publicationYear?: string;
  extent?: string;
  dimensions?: string;
  isbn?: string;
  carrierType?: string;
  mediaType?: string;
  issuance?: string;
  /** Printed, Handwritten, Online … (category.ts), from the Instance's type, media and carrier. */
  format?: FormatId;
  callNumber?: string;
  shelfLocation?: string;
  holdingStatus?: 'available' | 'checked_out' | 'paged' | 'reference_only' | 'digital_access' | 'not_connected';
  folioInstanceId?: string;
  folioHrid?: string;
  coverUrl?: string;
  items?: OpacHoldingItem[];
}

export interface OpacBibframeRelation {
  predicate: string;
  predicateLabel: string;
  targetTitle: string;
  targetUri?: string;
  targetType?: string;
  details?: string;
}

export interface OpacHoldingItem {
  id: string;
  uri?: string;
  instanceId?: string;
  folioInstanceId?: string;
  heldBy?: string;
  shelfMark?: string;
  barcode?: string;
  copyNumber?: string;
  immediateAcquisition?: string;
  acquisitionSource?: string;
  extent?: string;
  dimensions?: string;
  notation?: string;
  notes?: string[];
  /** The manuscript's notes as events (ijāzah, samāʿ, ownership, waqf …). */
  events?: TransmissionEvent[];
  status?: 'available' | 'checked_out' | 'paged' | 'reference_only' | 'digital_access' | 'not_connected';
  dueDate?: string;
  patronName?: string;
  accessUrl?: string;
  /** The copy's physical description (S24, ARM): binding, condition, markings (seals, stamps …), actions. */
  binding?: string;
  condition?: string;
  marks?: Array<{ kind: string; text: string; place?: string }>;
  actions?: Array<{ kind: string; date?: string; by?: string; note?: string }>;
  /** Placeholder copy the OPAC made up for display because the record has no holdings; never exported. */
  synthetic?: boolean;
}

export interface OpacWorkEntity {
  id: string;
  uri: string;
  canonicalMoonUri: string;
  title: string;
  subtitle?: string;
  language: string;
  languageLabel: string;
  summaryArabic?: string;
  summaryEnglish?: string;
  originDate?: string;
  era?: string;
  coverUrl?: string;
  genreForm?: string[];
  /** Book, Manuscript, Periodical, Map … (category.ts), one for the Work. */
  category?: CategoryId;
  classificationDdc?: string;
  classificationLcc?: string;
  matchReason?: string;
  
  // Linked Entities
  primaryCreator: OpacPersonEntity;
  contributors: OpacPersonEntity[];
  subjects: OpacSubjectEntity[];
  instances: OpacInstanceEntity[];
  publisher?: OpacPublisherEntity;
  
  // Rich BIBFRAME & Manuscript Linked Data
  expressionOfHub?: { uri: string; label: string };
  series?: string;
  tableOfContents?: string;
  notes?: string[];
  incipit?: string; // أوله
  explicit?: string; // آخره
  extent?: string;
  dimensions?: string;
  notation?: string;
  adminMetadata?: string;
  relatedWorks?: OpacBibframeRelation[];
  /** The works this volume contains (a majmūʿ, S12), from bf:hasPart. */
  containedWorks?: ContainedWork[];
  holdingItems?: OpacHoldingItem[];
  rawBibframeTriples?: Array<{ subject: string; predicate: string; object: string; objectUri?: string }>;

  // Raw Data & Source
  source: 'wolf-moon' | 'moon-bibframe' | 'moon-engine' | 'national-authority' | 'seed';
  catalogingInterface?: string;
  createdAt: string;
  modifiedAt: string;
  document?: any;
  turtleRdf?: string;
  marc21?: string;
}

/**
 * One stored record read as the catalogue's work, or null when it is a blank draft or cannot be read.
 * `base` is the address entity URIs are built on (the page's origin + /entity).
 */
export function workFromRecord(recordObj: any, { base }: { base: string }): OpacWorkEntity | null {
  const iri = (type: EntityKind, id: string) => entityIri(base, type, id);
  try {
    const doc = recordObj.record || recordObj.document || recordObj.graphJson || recordObj.data || recordObj;
    let graph: any[] = doc?.['@graph'] || (Array.isArray(doc) ? doc : []);
    if (graph.length === 0 && doc && (doc.work || doc.instance)) {
      graph = [doc.work, doc.instance].filter(Boolean);
    }
    if (!graph || !Array.isArray(graph) || graph.length === 0) {
      if (doc && typeof doc === 'object') {
        graph = [doc];
      } else {
        return null;
      }
    }

    // Records catalogued in MARC or imported hold text in both scripts and lists; read them in one shape.
    graph = normalizeForOpac(graph);

    // 1. Build Node Map for complete graph dereferencing
    const nodeMap = new Map<string, any>();
    for (const node of graph) {
      if (node && typeof node === 'object' && node['@id']) {
        nodeMap.set(node['@id'], node);
      }
    }

    // A reference is either the address as a string or, as JSON-LD usually writes it, { "@id": address } with
    // nothing else; both lead to the full node. (Only the string form was followed before, so a copy listed as
    // bf:hasItem { "@id": … } was read as an empty copy and the full Item node was then skipped.)
    const deref = (val: any): any => {
      if (typeof val === 'string' && nodeMap.has(val)) {
        return nodeMap.get(val);
      }
      if (val && typeof val === 'object' && !Array.isArray(val) && typeof val['@id'] === 'string'
        && Object.keys(val).length === 1 && nodeMap.has(val['@id'])) {
        return nodeMap.get(val['@id']);
      }
      return val;
    };

    // 2. Identify Work and Instance nodes
    const workNode = graph.find((n: any) => {
      if (!n || typeof n !== 'object') return false;
      const t = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
      return t.some((typeStr: string) => typeof typeStr === 'string' && (typeStr.includes('Work') || typeStr.includes('Text')));
    }) || doc?.work || graph[0] || {};

    const instanceNode = graph.find((n: any) => {
      if (!n || typeof n !== 'object') return false;
      const t = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
      return t.some((typeStr: string) => typeof typeStr === 'string' && typeStr.includes('Instance'));
    }) || doc?.instance || {};

    // 3. Resolve Title & Subtitle (handling direct values or dereferenced Title nodes)
    const rawTitleNode = deref(workNode['bf:title'] || workNode['title']);
    let titleStr = recordObj.title || '';
    let subtitleStr = '';

    if (rawTitleNode && typeof rawTitleNode === 'object') {
      const mTitle = rawTitleNode['bf:mainTitle'] || rawTitleNode['mainTitle'] || rawTitleNode['rdfs:label'] || rawTitleNode['value'];
      if (mTitle) titleStr = typeof mTitle === 'object' ? (mTitle.value || JSON.stringify(mTitle)) : String(mTitle);
      const sub = rawTitleNode['bf:subtitle'] || rawTitleNode['subtitle'];
      if (sub) subtitleStr = typeof sub === 'object' ? (sub.value || JSON.stringify(sub)) : String(sub);
    }

    if (!titleStr && typeof workNode['mainTitle'] === 'string') {
      titleStr = workNode['mainTitle'];
    }
    if (!titleStr && typeof workNode['rdfs:label'] === 'string') {
      titleStr = workNode['rdfs:label'];
    }

    // Cleanup trailing punctuation often found in MARC/BIBFRAME (e.g. "Title :")
    titleStr = (titleStr || '').trim().replace(/[\s:;,\/]+$/, '');
    subtitleStr = (subtitleStr || '').trim().replace(/[\s:;,\/]+$/, '');

    // Filter out completely empty or blank placeholder drafts
    if (!titleStr || titleStr.toLowerCase() === 'untitled' || titleStr.toLowerCase() === 'untitled record') {
      const hasSubstantialData = workNode['subject'] || workNode['originDate'] || instanceNode['responsibilityStatement'];
      if (!hasSubstantialData) {
        return null; // Skip blank stubs without content
      }
      titleStr = subtitleStr ? subtitleStr : 'مصنف مكتبي غير معنون';
    }

    // 4. Resolve Creators and Contributors (from responsibility statement, bf:contribution, bf:creator)
    let primaryCreatorName = '';
    let primaryRole = 'Author (مؤلف)';
    const primaryLinks: string[] = [];
    const primaryOtherNames: string[] = [];
    const linksOf = (agent: any): string[] => {
      if (!agent || typeof agent !== 'object') return [];
      const out: string[] = [];
      const id = agent['@id'];
      if (typeof id === 'string' && /^https?:\/\//.test(id)) out.push(id);
      for (const k of ['owl:sameAs', 'sameAs', 'madsrdf:hasExactExternalAuthority']) {
        const v = agent[k];
        for (const x of Array.isArray(v) ? v : v ? [v] : []) {
          const u = typeof x === 'string' ? x : x?.['@id'];
          if (typeof u === 'string' && /^https?:\/\//.test(u)) out.push(u);
        }
      }
      return out;
    };
    const contributorsList: OpacPersonEntity[] = [];

    const respStatement = instanceNode['responsibilityStatement'] || instanceNode['bf:responsibilityStatement'] || '';
    if (respStatement && typeof respStatement === 'string') {
      // e.g. "By Mohammad reza al-Khaghani ; Translator : Yasser Pouresmaeil."
      const parts = respStatement.replace(/^By\s+/i, '').split(';');
      if (parts.length > 0) {
        const authPart = parts[0].trim();
        if (authPart) primaryCreatorName = authPart;
      }
      if (parts.length > 1) {
        for (let i = 1; i < parts.length; i++) {
          const rawPart = parts[i].trim();
          let cRole = 'Contributor (مشارك)';
          let cName = rawPart;
          if (rawPart.toLowerCase().includes('translator')) {
            cRole = 'Translator (مترجم)';
            cName = rawPart.replace(/^Translator\s*:\s*/i, '').trim();
          } else if (rawPart.toLowerCase().includes('editor')) {
            cRole = 'Editor (محرر / محقق)';
            cName = rawPart.replace(/^Editor\s*:\s*/i, '').trim();
          }
          if (cName) {
            const cId = `person-${encodeURIComponent(cName.slice(0, 30))}`;
            contributorsList.push({
              id: cId,
              uri: iri('agent', cId),
              canonicalMoonUri: `moon:person:${cId}`,
              name: cName,
              nameArabic: cName,
              role: cRole,
              worksCount: 1,
              workIds: [recordObj.id]
            });
          }
        }
      }
    }

    // Inspect bf:contribution array
    const rawContributions = workNode['bf:contribution'] || workNode['contribution'];
    const contribArr = Array.isArray(rawContributions) ? rawContributions : (rawContributions ? [rawContributions] : []);
    for (const contrib of contribArr) {
      const cNode = deref(contrib);
      const agentNode = deref(cNode?.['bf:agent'] || cNode?.['agent']);
      const agentLabel = agentNode?.['rdfs:label'] || agentNode?.['name'] || (typeof agentNode === 'string' ? agentNode : '');
      const roleLabel = cNode?.['bf:role']?.['rdfs:label'] || cNode?.['role'] || 'مؤلف';
      const agentLinks = linksOf(agentNode);
      if (agentLabel && typeof agentLabel === 'string') {
        const sameAsAuthor = !!primaryCreatorName && (agentLabel.trim() === primaryCreatorName || namesAgree(agentLabel, primaryCreatorName));
        if (!primaryCreatorName) {
          primaryCreatorName = agentLabel.trim();
          primaryRole = roleLabel;
          primaryLinks.push(...agentLinks);
        } else if (sameAsAuthor) {
          // The statement of responsibility's author and this linked heading are one person.
          primaryLinks.push(...agentLinks);
          if (agentLabel.trim() !== primaryCreatorName) primaryOtherNames.push(agentLabel.trim());
        } else if (agentLabel.trim() !== primaryCreatorName && !contributorsList.some(c => c.nameArabic === agentLabel.trim())) {
          const cId = `person-${encodeURIComponent(agentLabel.trim().slice(0, 30))}`;
          contributorsList.push({
            id: cId,
            uri: iri('agent', cId),
            canonicalMoonUri: `moon:person:${cId}`,
            name: agentLabel.trim(),
            nameArabic: agentLabel.trim(),
            role: roleLabel,
            ...(agentLinks.length ? { authorityLinks: [...new Set(agentLinks)] } : {}),
            worksCount: 1,
            workIds: [recordObj.id]
          });
        }
      }
    }

    // Fallback creator label only if completely missing
    const primaryCreatorFinal = primaryCreatorName || 'مؤلف غير محدد (Unspecified Creator)';
    const personId = `person-${encodeURIComponent(primaryCreatorFinal.slice(0, 35))}`;
    const primaryCreatorEntity: OpacPersonEntity = {
      id: personId,
      uri: iri('agent', personId),
      canonicalMoonUri: `moon:person:${personId}`,
      name: primaryCreatorFinal,
      nameArabic: primaryCreatorFinal,
      role: primaryRole,
      ...(primaryLinks.length ? { authorityLinks: [...new Set(primaryLinks)] } : {}),
      ...(primaryOtherNames.length ? { otherNames: [...new Set(primaryOtherNames)] } : {}),
      worksCount: 1,
      workIds: [recordObj.id || 'work-1']
    };

    // 5. Summary, Table of Contents, and Notes
    const rawSummaryNode = deref(workNode['bf:summary'] || workNode['summary']);
    let summaryStr = '';
    if (rawSummaryNode && typeof rawSummaryNode === 'object') {
      summaryStr = rawSummaryNode['rdfs:label'] || rawSummaryNode['value'] || '';
    } else if (typeof rawSummaryNode === 'string') {
      summaryStr = rawSummaryNode;
    }

    const rawTocNode = deref(workNode['bf:tableOfContents'] || workNode['tableOfContents']);
    let tocStr = '';
    if (rawTocNode && typeof rawTocNode === 'object') {
      tocStr = rawTocNode['rdfs:label'] || rawTocNode['value'] || '';
    } else if (typeof rawTocNode === 'string') {
      tocStr = rawTocNode;
    }

    // 6. Subjects resolution (Zero fabrication: if empty, remains empty)
    const rawSubjects = workNode['bf:subject'] || workNode['subject'] || workNode['topical'] || [];
    const subjectsArr = Array.isArray(rawSubjects) ? rawSubjects : [rawSubjects];
    const subjectsList: OpacSubjectEntity[] = [];

    for (const subj of subjectsArr) {
      const sNode = deref(subj);
      let sLabel = '';
      let sUri = '';

      if (typeof sNode === 'string') {
        sUri = sNode;
        const uriSegments = sNode.split('/');
        sLabel = decodeURIComponent(uriSegments[uriSegments.length - 1] || '');
      } else if (sNode && typeof sNode === 'object') {
        sUri = sNode['@id'] || '';
        sLabel = sNode['rdfs:label'] || sNode['value'] || sNode['label'] || '';
      }

      if (sLabel && !subjectsList.some(s => s.label === sLabel)) {
        const sId = `subj-${encodeURIComponent(sLabel.slice(0, 30))}`;
        subjectsList.push({
          id: sId,
          uri: sUri || iri('subject', sId),
          label: sLabel,
          scheme: sUri.includes('loc.gov') ? 'lcsh' : 'arabic-authority',
          worksCount: 1,
          workIds: [recordObj.id || 'work-1']
        });
      }
    }

    const workId = recordObj.id || (workNode['@id'] ? workNode['@id'].replace(/^.*[/#]/, '') : `work-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`);

    // 7. Instances & Item nodes extraction directly from graph
    // Gather all Instance nodes
    const allInstanceNodes = graph.filter((n: any) => {
      if (!n || typeof n !== 'object') return false;
      const t = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
      return t.some((typeStr: string) => typeof typeStr === 'string' && typeStr.includes('Instance'));
    });
    if (allInstanceNodes.length === 0 && instanceNode && Object.keys(instanceNode).length > 0) {
      allInstanceNodes.push(instanceNode);
    }
    // One plain category for the Work and a format for each edition (B1), from what the record says.
    const workCategory = categoryOf(workNode, allInstanceNodes);

    // Gather all Item nodes present in graph
    const allItemNodes = graph.filter((n: any) => {
      if (!n || typeof n !== 'object') return false;
      const t = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
      return t.some((typeStr: string) => typeof typeStr === 'string' && typeStr.includes('Item'));
    });

    const instancesList: OpacInstanceEntity[] = [];
    const workHoldingItems: OpacHoldingItem[] = [];

    allInstanceNodes.forEach((instN: any, instIdx: number) => {
      const instId = instN['@id'] ? instN['@id'].replace(/^.*[/#]/, '') : `inst-${workId}-${instIdx + 1}`;
      const instTitleNode = deref(instN['bf:title'] || instN['title']);
      let instTitleStr = titleStr;
      let instSubStr = subtitleStr;
      if (instTitleNode && typeof instTitleNode === 'object') {
        const mt = instTitleNode['bf:mainTitle'] || instTitleNode['mainTitle'] || instTitleNode['rdfs:label'];
        if (mt) instTitleStr = typeof mt === 'object' ? (mt.value || JSON.stringify(mt)) : String(mt);
        const st = instTitleNode['bf:subtitle'] || instTitleNode['subtitle'];
        if (st) instSubStr = typeof st === 'object' ? (st.value || JSON.stringify(st)) : String(st);
      }

      // Provision activity / publication (no fabrication: undefined if missing)
      const provAgent = instN['bf:provisionActivity']?.['bf:agent']?.['rdfs:label'] ||
        instN['provisionActivity']?.['agent'] ||
        instN['publisher'];
      const publisherName = provAgent && typeof provAgent === 'string' ? provAgent.trim() : undefined;

      const provDate = instN['bf:provisionActivity']?.['bf:date'] ||
        instN['bf:provisionActivity']?.['bflc:simpleDate'] ||
        instN['publicationYear'] ||
        instN['publicationDate'] ||
        instN['copyrightDate'] ||
        workNode['originDate'];
      const pubYear = provDate && typeof provDate === 'string' ? provDate.trim() : undefined;

      const provPlace = instN['bf:provisionActivity']?.['bf:place']?.['rdfs:label'] ||
        instN['place'] ||
        instN['placeOfPublication'] ||
        instN['publicationPlace'];
      const pubPlace = provPlace && typeof provPlace === 'string' ? provPlace.trim() : undefined;

      // Extent & Carrier
      const extRaw = instN['extent'] || instN['bf:extent']?.['rdfs:label'] || instN['bf:extent']?.['value'];
      const extentVal = extRaw && typeof extRaw === 'string' ? extRaw.trim() : undefined;

      const carrierRaw = instN['carrier'] || instN['carrierType'] || instN['bf:carrier']?.['rdfs:label'];
      const carrierVal = carrierRaw && typeof carrierRaw === 'string' ? carrierRaw.trim() : undefined;

      const dimRaw = instN['dimensions'] || instN['bf:dimensions'];
      const dimVal = dimRaw && typeof dimRaw === 'string' ? dimRaw.trim() : undefined;

      // Classification & Call Number
      const shelfRaw = instN['shelfMark'] || instN['classification'] || instN['bf:classification']?.['rdfs:label'];
      const shelfMarkVal = shelfRaw && typeof shelfRaw === 'string' ? shelfRaw.trim() : undefined;

      const locRaw = instN['shelfLocation'] || instN['heldBy'];
      const shelfLocVal = locRaw && typeof locRaw === 'string' ? locRaw.trim() : undefined;

      // ISBN
      let isbnVal: string | undefined = instN['isbn'] || instN['identifiedBy']?.['isbn'];
      if (!isbnVal && Array.isArray(instN['bf:identifiedBy'])) {
        const isbnObj = instN['bf:identifiedBy'].find((x: any) => x && (x['@type'] === 'bf:Isbn' || x['@type'] === 'Isbn'));
        if (isbnObj) isbnVal = isbnObj['rdf:value'] || isbnObj['value'];
      }

      // Real items connected to this instance
      const instanceItems: OpacHoldingItem[] = [];

      // Check embedded bf:hasItem
      const rawHasItem = instN['bf:hasItem'] || instN['hasItem'];
      const embeddedItems = Array.isArray(rawHasItem) ? rawHasItem : (rawHasItem ? [rawHasItem] : []);

      // Also check graph items referencing this instance
      const matchedGraphItems = allItemNodes.filter((itNode: any) => {
        const itOf = itNode['bf:itemOf'] || itNode['itemOf'];
        const itOfId = typeof itOf === 'object' ? itOf?.['@id'] : itOf;
        return itOfId === instN['@id'] || (allInstanceNodes.length === 1);
      });

      const combinedItemCandidates = [...embeddedItems, ...matchedGraphItems];
      const seenItemIds = new Set<string>();

      combinedItemCandidates.forEach((rawIt, itIdx) => {
        const itNode = deref(rawIt);
        if (!itNode || typeof itNode !== 'object') return;
        const itemId = itNode['@id'] ? itNode['@id'].replace(/^.*[/#]/, '') : `item-${instId}-${itIdx + 1}`;
        if (seenItemIds.has(itemId)) return;
        seenItemIds.add(itemId);

        // The copy as the editor's Copies panel writes it (bf:heldBy, bf:shelfMark, bf:Barcode …).
        const copy = nodeToCopy(itNode);
        const itAccessUrlRaw = itNode['accessUrl'] || itNode['bf:electronicLocator'];
        const itAccessUrl = typeof itAccessUrlRaw === 'string' ? itAccessUrlRaw : itAccessUrlRaw?.['@id'];
        // An empty Item (the form's placeholder) is not a copy a reader can ask for.
        if (!hasCopyData(copy) && !itAccessUrl && !shelfMarkVal && !shelfLocVal) return;
        const itHeldBy = [copy.library, copy.location].filter(Boolean).join(' — ') || shelfLocVal;
        const itShelfMark = copy.shelfMark || shelfMarkVal;
        const itBarcode = copy.barcode || undefined;

        // Honest status determination: only 'digital_access' if URL exists, or reference_only if marked
        let itStatus: 'available' | 'reference_only' | 'digital_access' | 'not_connected' = 'not_connected';
        if (itAccessUrl) {
          itStatus = 'digital_access';
        } else if (copy.referenceOnly || instN['holdingStatus'] === 'reference_only') {
          itStatus = 'reference_only';
        } else if (itNode['status'] === 'available') {
          itStatus = 'available';
        }

        const itemEntity: OpacHoldingItem = {
          id: itemId,
          uri: iri('item', itemId),
          instanceId: instId,
          heldBy: itHeldBy,
          shelfMark: itShelfMark,
          barcode: itBarcode,
          copyNumber: copy.copyNumber || undefined,
          immediateAcquisition: itNode['immediateAcquisition'] || itNode['bf:immediateAcquisition'],
          acquisitionSource: itNode['acquisitionSource'] || itNode['bf:acquisitionSource'],
          extent: itNode['extent'] || extentVal,
          dimensions: itNode['dimensions'] || dimVal,
          notation: itNode['notation'] || instN['notation'],
          notes: Array.isArray(itNode['notes']) ? itNode['notes'] : (copy.note ? [copy.note] : []),
          status: itStatus,
          accessUrl: itAccessUrl,
          ...(copy.events?.length ? { events: copy.events } : {}),
          ...(copy.binding ? { binding: copy.binding } : {}),
          ...(copy.condition ? { condition: copy.condition } : {}),
          ...(copy.marks?.length ? { marks: copy.marks } : {}),
          ...(copy.actions?.length ? { actions: copy.actions } : {}),
        };

        instanceItems.push(itemEntity);
        workHoldingItems.push(itemEntity);
      });

      // Determine Instance holdingStatus honestly
      let instHoldingStatus: 'available' | 'reference_only' | 'digital_access' | 'not_connected' = 'not_connected';
      if (instanceItems.some(it => it.status === 'digital_access')) {
        instHoldingStatus = 'digital_access';
      } else if (instanceItems.some(it => it.status === 'reference_only')) {
        instHoldingStatus = 'reference_only';
      } else if (instanceItems.some(it => it.status === 'available')) {
        instHoldingStatus = 'available';
      }

      instancesList.push({
        id: instId,
        uri: iri('instance', instId),
        title: instTitleStr,
        subtitle: instSubStr || undefined,
        workId: workId,
        workTitle: titleStr,
        publisher: publisherName,
        publicationPlace: pubPlace,
        publicationYear: pubYear,
        extent: extentVal,
        dimensions: dimVal,
        carrierType: carrierVal,
        format: formatOf(instN, workCategory),
        callNumber: shelfMarkVal,
        shelfLocation: shelfLocVal,
        isbn: isbnVal,
        holdingStatus: instHoldingStatus,
        items: instanceItems
      });
    });

    // 8. Extract real BIBFRAME relationships (only when present in source data)
    const relatedWorks: OpacBibframeRelation[] = [];

    const exprOfNode = deref(workNode['bf:expressionOf'] || workNode['expressionOf']);
    if (exprOfNode) {
      const hUri = typeof exprOfNode === 'object' ? (exprOfNode['@id'] || '') : String(exprOfNode);
      const hLabel = typeof exprOfNode === 'object' ? (exprOfNode['bflc:aap'] || exprOfNode['rdfs:label'] || exprOfNode['title'] || '') : String(exprOfNode);
      if (hLabel || hUri) {
        relatedWorks.push({
          predicate: 'bf:expressionOf',
          predicateLabel: 'المجمع التعبيري العام (Expression Hub)',
          targetTitle: hLabel || `${titleStr} — مجمع تعبيري`,
          targetUri: hUri || undefined,
          targetType: 'bf:Hub'
        });
      }
    }

    const relToNode = deref(workNode['bf:relatedTo'] || workNode['relatedTo'] || instanceNode['bf:relatedTo'] || instanceNode['relatedTo']);
    if (relToNode) {
      const rUri = typeof relToNode === 'object' ? relToNode['@id'] : undefined;
      const rLabel = typeof relToNode === 'object' ? (relToNode['rdfs:label'] || relToNode['title'] || '') : String(relToNode);
      if (rLabel || rUri) {
        relatedWorks.push({
          predicate: 'bf:relatedTo',
          predicateLabel: 'عمل مرجعي وتوثيق ببليوغرافي (Related Work)',
          targetTitle: rLabel || 'عمل مرجعي مرتبط',
          targetUri: rUri,
          targetType: 'bf:Work'
        });
      }
    }

    // LC's longer form (marc2bibframe2, Moon's MARC import): bf:relation → bf:Relation with its
    // relationship and the related work (often a bf:Hub) as bf:associatedResource.
    const nodeOf = (v: any) => (v && typeof v === 'object' && v['@id'] && nodeMap.has(v['@id']) ? nodeMap.get(v['@id']) : deref(v));
    const textOf = (v: any): string => {
      const x = Array.isArray(v) ? v[0] : v;
      return typeof x === 'string' ? x : x && typeof x === 'object' ? String(x['@value'] ?? x['rdfs:label'] ?? x['bf:mainTitle'] ?? '') : '';
    };
    const hubLabel = (h: any) => textOf(h?.['bflc:aap']) || textOf(nodeOf(h?.['bf:title'])?.['bf:mainTitle']) || textOf(h?.['rdfs:label']);
    for (const rel of ([] as any[]).concat(workNode['bf:relation'] || workNode['relation'] || [])) {
      const relNode = nodeOf(rel);
      const target = nodeOf(relNode?.['bf:associatedResource']);
      if (!target) continue;
      const rLabel = hubLabel(target);
      const kind = nodeOf(relNode?.['bf:relationship']);
      const kindId = String(kind?.['@id'] || '');
      const kindLabel = textOf(kind?.['rdfs:label']);
      const isSeries = /\/relationship\/series$/.test(kindId) || /^series$/i.test(kindLabel);
      // A relation Moon knows by its LC term (translation of, commentary on …) is read below, with its words.
      if (!isSeries && isRelationTerm(kindId.replace(LC_RELATIONSHIP, ''))) continue;
      const num = textOf(relNode?.['bf:seriesEnumeration']);
      if (!rLabel && !target['@id']) continue;
      relatedWorks.push({
        predicate: isSeries ? 'bf:hasSeries' : 'bf:relation',
        predicateLabel: isSeries ? 'السلسلة (Series)' : kindLabel ? `${kindLabel}` : 'عمل مرتبط (Related Work)',
        targetTitle: rLabel + (num ? ` ؛ ${num}` : ''),
        targetUri: typeof target['@id'] === 'string' && !target['@id'].startsWith('_:') ? target['@id'] : undefined,
        targetType: [].concat(target['@type'] || []).map(String).some((t: string) => t.endsWith('Hub')) ? 'bf:Hub' : 'bf:Work',
      });
    }

    // Every work-to-work relation (translation of, commentary on, contained in, continuation of, other edition …),
    // in bf:relation form or as a direct property, every value (see workRelations.tsx). The direct "related to",
    // "part of" and "has part" with a text label only are read above as before.
    for (const r of readWorkRelations(workNode, nodeOf)) {
      if (r.from === 'direct' && ['relatedwork', 'partof', 'part'].includes(r.term)) continue;
      relatedWorks.push({
        predicate: `rel:${r.term}`,
        predicateLabel: relationWords(r.term, 'en') || r.term,
        targetTitle: r.targetTitle,
        targetUri: r.targetUri,
        targetType: 'bf:Work',
      });
    }

    // The Hub this Work expresses (bf:expressionOf): groups editions and translations, and has its own page.
    const ownHubNode = nodeOf(workNode['bf:expressionOf'] || workNode['expressionOf']);
    const ownHubLabel = ownHubNode && typeof ownHubNode === 'object' ? hubLabel(ownHubNode) : '';
    const ownHubId = ownHubNode && typeof ownHubNode === 'object' && typeof ownHubNode['@id'] === 'string' && !ownHubNode['@id'].startsWith('_:')
      ? ownHubNode['@id'] : typeof ownHubNode === 'string' && /^https?:/.test(ownHubNode) ? ownHubNode : '';
    // A Hub with no URI (from MARC without $0) is still a group: keyed by its access point.
    const expressionOfHub = ownHubId || ownHubLabel
      ? { uri: ownHubId || `hub:${normalizeArabic(ownHubLabel).toLowerCase().replace(/\s+/g, ' ').trim()}`, label: ownHubLabel || titleStr || ownHubId }
      : undefined;

    const derivNode = deref(workNode['bf:hasDerivative'] || workNode['hasDerivative']);
    if (derivNode) {
      const dUri = typeof derivNode === 'object' ? derivNode['@id'] : undefined;
      const dLabel = typeof derivNode === 'object' ? (derivNode['rdfs:label'] || derivNode['title'] || '') : String(derivNode);
      if (dLabel || dUri) {
        relatedWorks.push({
          predicate: 'bf:hasDerivative',
          predicateLabel: 'شرح / مصنف مشتق (Derivative Work)',
          targetTitle: dLabel || 'مصنف مشتق',
          targetUri: dUri,
          targetType: 'bf:Work'
        });
      }
    }

    // The work's genres and forms (bf:genreForm: "History", "Poetry", "شعر" …), by their labels. They were not read
    // before, so the catalogue showed no genre at all; a genre given only as an address with no label is left out.
    const genreFormList = [...new Set(([] as any[]).concat(workNode['bf:genreForm'] ?? workNode['genreForm'] ?? [])
      .map((g: any) => nodeOf(g)).map((g: any) => (typeof g === 'string' && !/^https?:/.test(g) ? g.trim() : textOf(g?.['rdfs:label'] ?? g?.['madsrdf:authoritativeLabel'])))
      .filter((s: string) => !!s && s.length <= 120))].slice(0, 12) as string[];

    const seriesNode = deref(workNode['bf:hasSeries'] || workNode['hasSeries'] || instanceNode['bf:hasSeries'] || instanceNode['hasSeries']);
    let seriesStr: string | undefined = undefined;
    if (seriesNode) {
      const sLabel = typeof seriesNode === 'object' ? (seriesNode['bf:title'] || seriesNode['title'] || seriesNode['rdfs:label'] || '') : String(seriesNode);
      const sNum = typeof seriesNode === 'object' ? seriesNode['number'] : '';
      seriesStr = sLabel ? `${sLabel}${sNum ? ' — ' + sNum : ''}` : undefined;
      if (sLabel) {
        relatedWorks.push({
          predicate: 'bf:hasSeries',
          predicateLabel: 'سلسلة ببليوغرافية (Monographic Series)',
          targetTitle: seriesStr || sLabel,
          targetType: 'bf:Series',
          details: sNum ? `رقم السلسلة: ${sNum}` : undefined
        });
      }
    }
    // A series given only as a statement (bf:seriesStatement, as MARC 490 gives it: "Dirāsāt fī al-adab al-ʻArabī ; 27").
    if (!seriesStr) {
      const statement = ([] as any[]).concat(instanceNode['bf:seriesStatement'] ?? instanceNode['seriesStatement'] ?? [], workNode['bf:seriesStatement'] ?? [])
        .map((v: any) => (typeof v === 'string' ? v.trim() : textOf(v))).find(Boolean);
      if (statement) seriesStr = statement;
    }

    const partOfNode = deref(workNode['bf:partOf'] || workNode['partOf'] || instanceNode['bf:partOf'] || instanceNode['partOf']);
    if (partOfNode) {
      const pLabel = typeof partOfNode === 'object' ? (partOfNode['rdfs:label'] || '') : String(partOfNode);
      if (pLabel) {
        relatedWorks.push({
          predicate: 'bf:partOf',
          predicateLabel: 'مجموعة وحاوية الحفظ (Collection / Fond)',
          targetTitle: pLabel,
          targetType: 'bf:Collection'
        });
      }
    }

    const hasPartNode = deref(workNode['bf:hasPart'] || workNode['hasPart'] || instanceNode['bf:hasPart'] || instanceNode['hasPart']);
    if (hasPartNode) {
      const hpLabel = typeof hasPartNode === 'object' ? (hasPartNode['rdfs:label'] || '') : String(hasPartNode);
      if (hpLabel) {
        relatedWorks.push({
          predicate: 'bf:hasPart',
          predicateLabel: 'قسم / جزء من العمل (Constituent Part)',
          targetTitle: hpLabel,
          targetType: 'bf:Part'
        });
      }
    }

    const hasExpNode = deref(workNode['bf:hasExpression'] || workNode['hasExpression']);
    if (hasExpNode) {
      const heLabel = typeof hasExpNode === 'object' ? (hasExpNode['rdfs:label'] || '') : String(hasExpNode);
      if (heLabel) {
        relatedWorks.push({
          predicate: 'bf:hasExpression',
          predicateLabel: 'تعبير محفوظ معتمد (Realized Expression)',
          targetTitle: heLabel,
          targetType: 'bf:Instance'
        });
      }
    }

    // 9. Codicological & Bibliographic Notes
    const notesList: string[] = [];
    let incipitStr: string | undefined = undefined;
    let explicitStr: string | undefined = undefined;

    const rawNotes = [
      ...(Array.isArray(workNode['bf:note']) ? workNode['bf:note'] : [workNode['bf:note']]),
      ...(Array.isArray(instanceNode['bf:note']) ? instanceNode['bf:note'] : [instanceNode['bf:note']]),
      ...(Array.isArray(workNode['note']) ? workNode['note'] : (typeof workNode['note'] === 'string' ? workNode['note'].split('\n') : [])),
      ...(Array.isArray(instanceNode['note']) ? instanceNode['note'] : (typeof instanceNode['note'] === 'string' ? instanceNode['note'].split('\n') : []))
    ].filter(Boolean);

    for (const n of rawNotes) {
      const nLabel = typeof n === 'object' ? (n['rdfs:label'] || n['value'] || '') : String(n);
      if (nLabel && !notesList.includes(nLabel)) {
        notesList.push(nLabel);
        if (nLabel.includes('أوله') || nLabel.includes('Incipit')) incipitStr = nLabel;
        if (nLabel.includes('آخره') || nLabel.includes('Explicit')) explicitStr = nLabel;
      }
    }

    // 10. Origin Date & Era
    const originDateVal = typeof workNode['originDate'] === 'string' ? workNode['originDate'] : (instancesList[0]?.publicationYear || undefined);
    let eraStr: string | undefined = undefined;
    if (originDateVal) {
      const yearNum = parseInt(originDateVal.replace(/[^0-9]/g, '').slice(0, 4), 10);
      if (yearNum > 0) {
        if (yearNum >= 2000) eraStr = 'القرن الحادي والعشرون (2000+)';
        else if (yearNum >= 1900) eraStr = 'القرن العشرون';
        else if (yearNum >= 1800) eraStr = 'القرن التاسع عشر';
        else if (yearNum >= 1600) eraStr = 'القرن السابع عشر الميلادي';
        else if (yearNum >= 1000) eraStr = 'العصر الإسلامي الوسيط';
      }
    }

    // 11. Raw RDF Triples (derived strictly from real properties)
    const rawTriples: Array<{ subject: string; predicate: string; object: string; objectUri?: string }> = [
      { subject: workId, predicate: 'rdf:type', object: 'bf:Work / bf:Text', objectUri: 'http://id.loc.gov/ontologies/bibframe/Work' },
      { subject: workId, predicate: 'bf:title', object: titleStr }
    ];

    if (primaryCreatorName) {
      rawTriples.push({
        subject: workId,
        predicate: 'bf:contribution',
        object: `${primaryCreatorName} (${primaryRole})`,
        objectUri: primaryCreatorEntity.uri
      });
    }

    const langCode = workNode['bf:language']?.['@id'] || workNode['language'] || 'ara';
    rawTriples.push({
      subject: workId,
      predicate: 'bf:language',
      object: langCode === 'ara' ? 'العربية (ara)' : langCode,
      objectUri: `http://id.loc.gov/vocabulary/languages/${langCode}`
    });

    const classLccVal = workNode['classification'] || workNode['bf:classification']?.['rdfs:label'] || instancesList[0]?.callNumber;
    if (classLccVal) {
      rawTriples.push({ subject: workId, predicate: 'bf:classification', object: classLccVal });
    }

    subjectsList.forEach(s => {
      rawTriples.push({ subject: workId, predicate: 'bf:subject', object: s.label, objectUri: s.uri });
    });

    relatedWorks.forEach(rw => {
      rawTriples.push({ subject: workId, predicate: rw.predicate, object: rw.targetTitle, objectUri: rw.targetUri });
    });

    instancesList.forEach(inst => {
      rawTriples.push({ subject: inst.id, predicate: 'bf:instanceOf', object: workId });
      (inst.items || []).forEach(it => {
        rawTriples.push({
          subject: inst.id,
          predicate: 'bf:hasItem',
          object: `${it.heldBy || 'Item'} [${it.shelfMark || it.id}]`,
          objectUri: it.uri
        });
      });
    });

    const firstPublisherName = instancesList[0]?.publisher;
    const publisherEntity: OpacPublisherEntity | undefined = firstPublisherName ? {
      id: `pub-${encodeURIComponent(firstPublisherName.slice(0, 30))}`,
      name: firstPublisherName,
      city: instancesList[0]?.publicationPlace,
      worksCount: 1,
      workIds: [workId]
    } : undefined;

    return {
      id: workId,
      ...(expressionOfHub ? { expressionOfHub } : {}),
      // The cover stored for the record (uploaded, or from Open Library / Google Books), if any.
      ...(typeof recordObj.coverUrl === 'string' && recordObj.coverUrl ? { coverUrl: recordObj.coverUrl } : {}),
      uri: iri('work', workId),
      canonicalMoonUri: `moon:work:${workId}`,
      title: titleStr,
      subtitle: subtitleStr || undefined,
      language: langCode,
      languageLabel: langCode === 'ara' ? 'العربية (Arabic)' : (langCode === 'eng' ? 'الإنجليزية (English)' : langCode),
      summaryArabic: summaryStr || undefined,
      originDate: originDateVal,
      era: eraStr,
      primaryCreator: primaryCreatorEntity,
      contributors: contributorsList,
      subjects: subjectsList,
      instances: instancesList,
      publisher: publisherEntity,
      classificationDdc: workNode['classificationDdc'] || workNode['bf:classificationDdc'],
      classificationLcc: classLccVal,
      tableOfContents: tocStr || undefined,
      series: seriesStr,
      ...(genreFormList.length ? { genreForm: genreFormList } : {}),
      category: workCategory,
      notes: notesList,
      incipit: incipitStr,
      explicit: explicitStr,
      extent: instancesList[0]?.extent,
      dimensions: instancesList[0]?.dimensions,
      notation: workNode['notation'] || instanceNode['notation'],
      adminMetadata: workNode['adminMetadata'] || 'Wolf Moon OPAC | BIBFRAME 2.0',
      relatedWorks: relatedWorks,
      containedWorks: readContainedWorks({ 'bf:hasPart': ([] as any[]).concat(workNode['bf:hasPart'] || workNode['hasPart'] || []).map(deref) }),
      holdingItems: workHoldingItems,
      rawBibframeTriples: rawTriples,
      source: recordObj.source || 'wolf-moon',
      catalogingInterface: recordObj.metadata?.catalogingInterface || 'Wolf Moon Cataloger',
      createdAt: recordObj.metadata?.created || recordObj.metadata?.createdAt || recordObj.createdAt || recordObj.saved || new Date().toISOString(),
      modifiedAt: recordObj.metadata?.modified || recordObj.saved || new Date().toISOString(),
      document: doc
    };
  } catch (err) {
    console.warn('Error parsing BIBFRAME document for OPAC:', err);
    return null;
  }
}
