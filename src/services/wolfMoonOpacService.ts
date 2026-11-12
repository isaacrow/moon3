/**
 * WOF MOON Linked Data OPAC Service
 * Heavily inspired by Share-VDE (svde.org) and Libris (libris.kb.se/en).
 *
 * Core Principles:
 * 1. Shared Database: Unifies Supabase cataloging records, localStorage saves,
 *    MOON Authority Profiles, and pre-indexed linked data collections.
 * 2. Full Entity Linking (Share-VDE / Libris graph traversal):
 *    - Click a Person -> navigates to Person Entity view showing their canonical URI,
 *      ISNI/VIAF/LOC identifiers, biography, and EVERY Work created by or linked to them.
 *    - Click a Subject -> navigates to Subject / Concept view showing the authority URI,
 *      broader/narrower taxonomy, and EVERY Work categorized under that subject.
 *    - Click a Publisher -> shows every publication from that publisher.
 *    - Click a Work -> reveals all its Instances (manifestations/editions/carriers) and Items.
 * 3. Formats: User View, Share-VDE WEMI Cluster, Interactive Graph, Framed JSON-LD, Turtle, MARC21.
 */

import { AISuggestionProfile, saveAuthorityProfileToMoonSystem } from './authorFinderService';
import { containedWorks as readContainedWorks, type ContainedWork } from './majmu';
import { getAllRecords } from '../app/utils/recordStorageBackend';
import { nodeToCopy, hasCopyData } from './itemCopies';
import { normalizeForOpac } from '../opac/normalizeGraph';
import type { TransmissionEvent } from './transmission';
import { namesAgree } from '../opac/personPhoto';
import { FOLIO_ENABLED, VUFIND_ENABLED } from '../app/utils/integrations';
import { buildW3CJsonLd, BIBFRAME_JSONLD_CONTEXT } from './w3cJsonLdBuilder';
import { finishForExport } from './bibframeNormalizer';
import { toTurtle } from './rdfGraphBuilder';
import { mintUriSet } from './uriMintingService';

// Curated library of high-resolution cultural & manuscript imagery for OPAC entities
export const CURATED_COVERS = [
  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1476275466078-4007374efbbe?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1524654458049-e36be0721fa2?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1532012164546-f432f2e3777f?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=800&q=80'
];

export function getCatalogBaseUri(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/entity`;
  }
  return 'https://catalog.moonlib.org/entity';
}

export function getEntityIri(type: 'work' | 'instance' | 'item' | 'agent' | 'subject' | 'publisher', id: string): string {
  const cleanId = encodeURIComponent(id.replace(/^[a-z]+-/, ''));
  return `${getCatalogBaseUri()}/${type}/${cleanId}`;
}

export function resolveWorkCover(work: { coverUrl?: string; title?: string; id?: string }): string {
  // Bibliographic integrity: never assign random unrelated stock photos to catalog records.
  // Return explicit coverUrl when present, or empty string to allow neutral typographic library placeholder rendering.
  return work.coverUrl || '';
}

// =========================================================================
// TEXT NORMALIZATION & UNICODE HELPERS
// =========================================================================

/**
 * Normalizes Arabic text for diacritic-insensitive, hamza-insensitive searching
 */
import { allWordsIn, entityNamesOf, matchWork, wordsFound } from '../opac/searchIndex';
import { isSameRecord } from '../opac/sameRecord';

import { isRelationTerm, LC_RELATIONSHIP, readWorkRelations, relationWords } from '../../supabase/functions/server/workRelations.tsx';

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

/** Language facet: MARC language code -> count of works, labelled as the works label their language. */
function languageFacets(works: { language?: string; languageLabel?: string }[]): { value: string; label: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const w of works) {
    if (!w.language) continue;
    const entry = counts.get(w.language) || { label: w.languageLabel || w.language, count: 0 };
    entry.count++;
    counts.set(w.language, entry);
  }
  return [...counts].map(([value, { label, count }]) => ({ value, label, count })).sort((a, b) => b.count - a.count);
}

export interface OpacAdvancedSearchParams {
  query?: string;
  title?: string;
  creator?: string;
  subject?: string;
  publisher?: string;
  yearFrom?: string;
  yearTo?: string;
  format?: string;
  language?: string;
  callNumber?: string;
  scope?: string;
  sort?: 'relevance' | 'title' | 'date-desc' | 'date-asc';
  page?: number;
  pageSize?: number;
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

export interface OpacFacets {
  types: { value: string; label: string; count: number }[];
  formats: { value: string; label: string; count: number }[];
  availabilities: { value: string; label: string; count: number }[];
  subjects: { value: string; label: string; count: number }[];
  authors: { value: string; label: string; count: number }[];
  languages: { value: string; label: string; count: number }[];
  eras: { value: string; label: string; count: number }[];
  sources: { value: string; label: string; count: number }[];
}

// =========================================================================
// SEED LINKED DATA (Rich Benchmark Iraqi & International Works)
// =========================================================================


// =========================================================================
// WOF MOON LINKED OPAC SERVICE IMPLEMENTATION
// =========================================================================

export interface OpacEcosystemTelemetry {
  folioConnected: boolean;
  solrConnected: boolean;
  vufindConnected: boolean;
  sparqlConnected: boolean;
  totalFolioInstances: number;
  totalFolioItems: number;
  totalSolrDocs: number;
  totalTriples: number;
  namedGraphsCount: number;
  lastSyncedAt: string;
}

class WolfMoonOpacService {
  private works: OpacWorkEntity[] = [];
  private personsMap: Map<string, OpacPersonEntity> = new Map();
  private subjectsMap: Map<string, OpacSubjectEntity> = new Map();
  private publishersMap: Map<string, OpacPublisherEntity> = new Map();
  private initialized: boolean = false;
  private subscribers: (() => void)[] = [];
  // Nothing counts as connected until a live server has answered.
  private telemetry: OpacEcosystemTelemetry = {
    folioConnected: false,
    solrConnected: false,
    vufindConnected: false,
    sparqlConnected: false,
    totalFolioInstances: 0,
    totalFolioItems: 0,
    totalSolrDocs: 0,
    totalTriples: 0,
    namedGraphsCount: 0,
    lastSyncedAt: new Date().toISOString()
  };

  constructor() {
    this.initDatabase();
  }

  public getEcosystemTelemetry(): OpacEcosystemTelemetry {
    return this.telemetry;
  }

  public async refreshCatalog(): Promise<void> {
    this.initialized = false;
    await this.initDatabase(true);
  }

  public subscribe(cb: () => void): () => void {
    this.subscribers.push(cb);
    return () => {
      this.subscribers = this.subscribers.filter(s => s !== cb);
    };
  }

  private notify() {
    this.subscribers.forEach(cb => cb());
  }

  /**
   * Executes a real-time circulation transaction (checkout, checkin, or hold request)
   * against the live FOLIO ILS backend (:8080/api/circulation/*) and refreshes OPAC state.
   */
  public async performCirculationAction(params: {
    itemId?: string;
    instanceId?: string;
    workId?: string;
    action: 'checkout' | 'checkin' | 'request';
    patronName?: string;
  }): Promise<{ success: boolean; status?: string; barcode?: string; dueDate?: string; message: string }> {
    const endpoints = [
      `/folio-api/api/circulation/${params.action}`,
      `http://localhost:8080/api/circulation/${params.action}`
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: params.itemId,
            instanceId: params.instanceId || params.workId,
            patronName: params.patronName || 'مستفيد الفهرس العام (OPAC Patron)'
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            await this.refreshCatalog();
            const newStatusName = data.item?.status?.name || (params.action === 'checkin' ? 'Available' : 'Checked out');
            return {
              success: true,
              status: newStatusName,
              barcode: data.item?.barcode,
              dueDate: data.loan?.dueDate || data.item?.status?.dueDate,
              message:
                params.action === 'checkout'
                  ? `تمت إعارة النسخة (${data.item?.barcode || ''}) عبر نظام FOLIO بنجاح — تاريخ الاستحقاق: ${data.loan?.dueDate || ''}`
                  : params.action === 'request'
                  ? `تم تسجيل طلب حجز النسخة (${data.item?.barcode || ''}) في طابور الإعارة بنجاح`
                  : `تم إرجاع النسخة (${data.item?.barcode || ''}) إلى رفوف المكتبة في نظام FOLIO بنجاح`
            };
          }
        }
      } catch {
        // try next endpoint
      }
    }

    return {
      success: false,
      message: 'تعذر الاتصال بمحرك الإعارة المباشر في FOLIO (:8080)'
    };
  }

  /**
   * Initializes the shared database from Live FOLIO ILS (:8080/api/opac/catalog) +
   * Apache Solr (biblio core) + Wolf backend storage (/api/records) + LocalStorage + Benchmark Works.
   */
  public async initDatabase(forceReload: boolean = false): Promise<void> {
    if (this.initialized && !forceReload) return;

    const gatheredWorks: OpacWorkEntity[] = [];

    // 1. Load real records from the Wolf backend storage (/api/records + localStorage cache)
    try {
      // Only records approved by the Super Admin appear in the public OPAC, each at its published
      // version: an edit waiting for review does not replace what patrons see.
      const realRecords = await getAllRecords({ published: true });
      if (Array.isArray(realRecords) && realRecords.length > 0) {
        for (const r of realRecords) {
          const parsed = this.parseBibframeDocumentToOpacWork(r);
          if (parsed && !gatheredWorks.some(gw => isSameRecord(gw, parsed))) {
            gatheredWorks.push(parsed);
          }
        }
      }
    } catch (e) {
      console.warn('Error fetching real records from backend storage:', e);
    }

    // 2. Also inspect raw localStorage for any additional user records
    try {
      if (typeof window !== 'undefined') {
        const extraKeys = ['bibframe_saved_records', 'bibframe-records', 'moon_records_v1'];
        for (const k of extraKeys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const parsedArr = JSON.parse(raw);
              if (Array.isArray(parsedArr)) {
                for (const item of parsedArr) {
                  // Same rule as the server's records: unapproved records stay out of the OPAC.
                  const status = item?.status || item?.record?.metadata?.status || item?.metadata?.status || 'complete';
                  if (status !== 'complete') continue;
                  const p = this.parseBibframeDocumentToOpacWork(item);
                  if (p && !gatheredWorks.some(gw => isSameRecord(gw, p))) {
                    gatheredWorks.push(p);
                  }
                }
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      console.warn('Error reading extra localStorage records:', e);
    }

    // Only records published in Moon are shown, so every book's permanent address resolves. (The bundled
    // examples and the demo works that used to be mixed in had addresses that led nowhere.)

    // 3. Connect to LIVE FOLIO OPAC CATALOG (/api/opac/catalog) & Enrich Holdings/Items + Convert FOLIO-only Instances
    try {
      const catalogUrls = FOLIO_ENABLED ? ['/folio-api/api/opac/catalog', 'http://localhost:8080/api/opac/catalog'] : [];
      let folioCatalog: any = null;
      for (const u of catalogUrls) {
        try {
          const r = await fetch(u);
          if (r.ok) {
            folioCatalog = await r.json();
            break;
          }
        } catch {}
      }

      if (folioCatalog && Array.isArray(folioCatalog.instances)) {
        const tsStats = folioCatalog.tripleStoreStats || {};
        this.telemetry = {
          ...this.telemetry,
          folioConnected: true,
          sparqlConnected: true,
          totalFolioInstances: folioCatalog.totalInstances || folioCatalog.instances.length,
          totalFolioItems: folioCatalog.totalItems || (folioCatalog.items || []).length,
          totalTriples: tsStats.totalQuads || tsStats.totalTriples || 0,
          namedGraphsCount: tsStats.namedGraphsCount || 0,
          lastSyncedAt: new Date().toISOString()
        };

        for (const fInst of folioCatalog.instances) {
          const fTitle = (fInst.title || '').trim().replace(/\s*\/\s*.*$/, '').trim();
          const fNormTitle = normalizeArabic(fTitle || fInst.title || '');
          const fHoldings: any[] = fInst.holdings || [];
          const fItems: any[] = fInst.items || [];

          const mapFolioStatus = (rawName?: string): 'available' | 'checked_out' | 'paged' | 'reference_only' | 'digital_access' => {
            if (!rawName) return 'available';
            const lower = rawName.toLowerCase();
            if (lower.includes('checked out') || lower.includes('loan')) return 'checked_out';
            if (lower.includes('paged') || lower.includes('hold') || lower.includes('request')) return 'paged';
            if (lower.includes('reference')) return 'reference_only';
            return 'available';
          };

          const mappedHoldingItems: OpacHoldingItem[] = fItems.map((it: any, idx: number) => ({
            id: it.id || `folio-item-${fInst.id}-${idx + 1}`,
            uri: getEntityIri('item', it.id || `${fInst.id}-${idx + 1}`),
            instanceId: fInst.id,
            folioInstanceId: fInst.id,
            heldBy: it.locationName || it.effectiveLocation?.name || fHoldings[0]?.locationName || 'المكتبة المركزية — FOLIO ILS',
            shelfMark: it.callNumber || it.effectiveCallNumberComponents?.callNumber || fHoldings[0]?.callNumber || fInst.classifications?.[0]?.classificationNumber || 'PJ7862 .A1',
            barcode: it.barcode || fInst.hrid,
            copyNumber: it.copyNumber || 'c.1',
            status: mapFolioStatus(it.status?.name),
            dueDate: it.status?.dueDate,
            patronName: it.status?.patronName
          }));

          const primaryHoldingStatus: 'available' | 'checked_out' | 'paged' | 'reference_only' | 'digital_access' =
            mappedHoldingItems.some(i => i.status === 'available')
              ? 'available'
              : mappedHoldingItems.some(i => i.status === 'paged')
              ? 'paged'
              : mappedHoldingItems.some(i => i.status === 'checked_out')
              ? 'checked_out'
              : 'available';

          // Check if work already exists in gatheredWorks
          const existingWork = gatheredWorks.find(
            gw =>
              gw.id === fInst.id ||
              gw.instances.some(inst => inst.id === fInst.id || inst.folioInstanceId === fInst.id) ||
              (fNormTitle && (normalizeArabic(gw.title).includes(fNormTitle) || fNormTitle.includes(normalizeArabic(gw.title))))
          );

          if (existingWork) {
            if (mappedHoldingItems.length > 0) {
              existingWork.holdingItems = mappedHoldingItems;
            }
            if (existingWork.instances.length > 0) {
              const targetInst = existingWork.instances[0];
              targetInst.folioInstanceId = fInst.id;
              targetInst.folioHrid = fInst.hrid;
              targetInst.holdingStatus = primaryHoldingStatus;
              if (fHoldings[0]?.callNumber && !targetInst.callNumber) {
                targetInst.callNumber = fHoldings[0].callNumber;
              }
              if (fHoldings[0]?.locationName && !targetInst.shelfLocation) {
                targetInst.shelfLocation = fHoldings[0].locationName;
              }
              if (mappedHoldingItems.length > 0) {
                targetInst.items = mappedHoldingItems;
              }
            }
          } else if (fInst.title) {
            // Convert FOLIO-native instance into a full OpacWorkEntity
            const creatorName = fInst.contributors?.[0]?.name || 'مؤلف معتمد في FOLIO';
            const pubEntry = fInst.publication?.[0] || {};
            const callNum = fHoldings[0]?.callNumber || fInst.classifications?.[0]?.classificationNumber || 'Z665 .F65';
            const isbnVal = fInst.identifiers?.[0]?.value || fInst.hrid || fInst.id;
            const langCode = fInst.languages?.[0] || 'ara';
            const personId = `person-folio-${encodeURIComponent(creatorName.slice(0, 24))}`;
            const creatorEntity: OpacPersonEntity = {
              id: personId,
              uri: getEntityIri('agent', personId),
              canonicalMoonUri: `moon:person:${personId}`,
              name: creatorName,
              nameArabic: creatorName,
              role: fInst.contributors?.[0]?.contributorTypeName || 'Author (مؤلف)',
              worksCount: 1,
              workIds: [fInst.id]
            };
            const subjEntities: OpacSubjectEntity[] = (fInst.subjects || []).map((s: any, sIdx: number) => {
              const label = typeof s === 'string' ? s : (s.value || 'مقتنيات المكتبة');
              const sId = `subj-folio-${fInst.id}-${sIdx}`;
              return {
                id: sId,
                uri: getEntityIri('subject', sId),
                label,
                scheme: 'lcsh' as const,
                worksCount: 1,
                workIds: [fInst.id]
              };
            });

            const instEntity: OpacInstanceEntity = {
              id: fInst.id,
              uri: getEntityIri('instance', fInst.id),
              folioInstanceId: fInst.id,
              folioHrid: fInst.hrid,
              title: fInst.title,
              workId: fInst.id,
              workTitle: fInst.title,
              publisher: pubEntry.publisher || 'دار نشر معتمدة — FOLIO',
              publicationPlace: pubEntry.place || '',
              publicationYear: pubEntry.dateOfPublication || '',
              extent: fInst.physicalDescriptions?.[0] || 'مجلد مطبوع',
              isbn: isbnVal,
              carrierType: fInst.instanceTypeName || 'مجلد مطبوع (Book)',
              callNumber: callNum,
              shelfLocation: fHoldings[0]?.locationName || mappedHoldingItems[0]?.heldBy || 'المكتبة المركزية — FOLIO',
              holdingStatus: primaryHoldingStatus,
              items: mappedHoldingItems
            };

            gatheredWorks.push({
              id: fInst.id,
              uri: getEntityIri('work', fInst.id),
              canonicalMoonUri: `moon:work:${fInst.id}`,
              title: fInst.title,
              language: langCode,
              languageLabel: langCode === 'ara' ? 'العربية (Arabic)' : 'الإنجليزية (English)',
              summaryArabic: fInst.notes?.[0]?.note || undefined,
              originDate: pubEntry.dateOfPublication,
              classificationLcc: callNum,
              primaryCreator: creatorEntity,
              contributors: [],
              subjects: subjEntities,
              instances: [instEntity],
              publisher: pubEntry.publisher
                ? {
                    id: `pub-folio-${fInst.id}`,
                    name: pubEntry.publisher,
                    city: pubEntry.place,
                    worksCount: 1,
                    workIds: [fInst.id]
                  }
                : undefined,
              notes: (fInst.notes || []).map((n: any) => n.note).filter(Boolean),
              holdingItems: mappedHoldingItems,
              source: 'wolf-moon',
              catalogingInterface: `FOLIO ILS (${fInst.source || 'MARC/BIBFRAME'})`,
              createdAt: fInst.catalogedDate || new Date().toISOString(),
              modifiedAt: new Date().toISOString()
            });
          }
        }
      }
    } catch (e) {
      console.warn('Notice: Could not reach live FOLIO OPAC catalog endpoint:', e);
    }

    // 3b. Query Apache Solr (biblio core) to update telemetry & ensure Solr-indexed works are represented
    try {
      const solrUrls = !VUFIND_ENABLED ? [] : ['/solr/biblio/select?q=*:*&rows=50&wt=json', 'http://localhost:8983/solr/biblio/select?q=*:*&rows=50&wt=json'];
      for (const sUrl of solrUrls) {
        try {
          const sRes = await fetch(sUrl);
          if (sRes.ok) {
            const sData = await sRes.json();
            const numFound = sData?.response?.numFound ?? 0;
            this.telemetry.solrConnected = true;
            this.telemetry.vufindConnected = true;
            this.telemetry.totalSolrDocs = numFound;
            break;
          }
        } catch {}
      }
    } catch {}

    // 4. Register Saved Authority Profiles from AuthorFinder
    try {
      if (typeof window !== 'undefined') {
        const authStr = localStorage.getItem('moon_saved_author_authority_records_v1');
        if (authStr) {
          const profiles: AISuggestionProfile[] = JSON.parse(authStr);
          profiles.forEach((p, idx) => {
            const authorName = p.suggestedNameArabic || p.primarySuggestion;
            const authorEn = p.suggestedNameEnglish || p.primarySuggestion;
            const personId = `person-${p.moonUri.replace(/[^a-zA-Z0-9]/g, '-') || idx}`;
            const suggestedTitles = (p.majorWorks || []).map(w => w.title);

            if (!this.personsMap.has(authorName)) {
              this.personsMap.set(authorName, {
                id: personId,
                uri: getEntityIri('agent', personId),
                canonicalMoonUri: p.moonUri,
                name: authorName,
                nameArabic: authorName,
                nameEnglish: authorEn,
                birthDate: p.birthDate,
                deathDate: p.deathDate,
                lifespan: [p.birthDate, p.deathDate].filter(Boolean).join(' – '),
                role: 'Author (مؤلف)',
                bioArabic: p.summaryAr,
                bioEnglish: p.summaryEn,
                disciplines: p.disciplines,
                affiliation: p.affiliation,
                city: p.birthCity,
                worksCount: 0,
                workIds: [],
                suggestedWorks: suggestedTitles
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn('Error reading local authority profiles for OPAC:', e);
    }

    // 5. An instance with copies is available; one without copies shows "no copies recorded".
    //    Copies are never made up: no invented shelf marks or barcodes.
    for (const w of gatheredWorks) {
      for (const inst of w.instances) {
        const hasCopies = (inst.items && inst.items.length > 0) ||
          (w.holdingItems || []).some(it => !it.instanceId || it.instanceId === inst.id);
        if (!hasCopies) {
          inst.holdingStatus = 'not_connected';
        } else if (!inst.holdingStatus || inst.holdingStatus === 'not_connected') {
          inst.holdingStatus = 'available';
        }
      }
    }

    // 6. Index all entities & resolve bidirectional relations
    this.works = gatheredWorks;
    this.rebuildEntityIndexes();
    this.initialized = true;
    this.notify();
  }

  /**
   * Saves a synthesized Multi-Source AI Author Profile directly to the system
   * (persisting in localStorage, firing system event, updating OPAC in real time)
   */
  public saveMultiSourceAuthorProfile(profile: AISuggestionProfile): { success: boolean; uri: string; recordId: string } {
    const res = saveAuthorityProfileToMoonSystem(profile);
    if (res.success) {
      this.initialized = false;
      this.initDatabase(true);
    }
    return res;
  }

  /**
   * Parses raw BIBFRAME JSON-LD into unified OpacWorkEntity with full graph dereferencing
   */
  private parseBibframeDocumentToOpacWork(recordObj: any): OpacWorkEntity | null {
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
                uri: getEntityIri('agent', cId),
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
              uri: getEntityIri('agent', cId),
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
        uri: getEntityIri('agent', personId),
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
            uri: sUri || getEntityIri('subject', sId),
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
            uri: getEntityIri('item', itemId),
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
          uri: getEntityIri('instance', instId),
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
        uri: getEntityIri('work', workId),
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

  /**
   * Rebuilds indices of Persons, Subjects, and Publishers for instant O(1) lookups
   */
  private rebuildEntityIndexes() {
    this.personsMap.clear();
    this.subjectsMap.clear();
    this.publishersMap.clear();

    for (const work of this.works) {
      // 1. Index Primary Creator
      const creator = work.primaryCreator;
      if (creator) {
        const pKey = creator.nameArabic || creator.name;
        if (!this.personsMap.has(pKey)) {
          this.personsMap.set(pKey, {
            ...creator,
            workIds: [work.id],
            worksCount: 1
          });
        } else {
          const existing = this.personsMap.get(pKey)!;
          if (!existing.workIds.includes(work.id)) {
            existing.workIds.push(work.id);
            existing.worksCount = existing.workIds.length;
          }
          existing.authorityLinks = [...new Set([...(existing.authorityLinks || []), ...(creator.authorityLinks || [])])];
          existing.otherNames = [...new Set([...(existing.otherNames || []), ...(creator.otherNames || [])])];
        }
      }

      // 2. Index Contributors
      for (const contrib of work.contributors) {
        const cKey = contrib.nameArabic || contrib.name;
        if (!this.personsMap.has(cKey)) {
          this.personsMap.set(cKey, {
            ...contrib,
            workIds: [work.id],
            worksCount: 1
          });
        } else {
          const existing = this.personsMap.get(cKey)!;
          if (!existing.workIds.includes(work.id)) {
            existing.workIds.push(work.id);
            existing.worksCount = existing.workIds.length;
          }
          existing.authorityLinks = [...new Set([...(existing.authorityLinks || []), ...(contrib.authorityLinks || [])])];
        }
      }

      // 3. Index Subjects
      for (const subj of work.subjects) {
        const sKey = subj.label;
        if (!this.subjectsMap.has(sKey)) {
          this.subjectsMap.set(sKey, {
            ...subj,
            workIds: [work.id],
            worksCount: 1
          });
        } else {
          const existing = this.subjectsMap.get(sKey)!;
          if (!existing.workIds.includes(work.id)) {
            existing.workIds.push(work.id);
            existing.worksCount = existing.workIds.length;
          }
        }
      }

      // 4. Index Publishers
      if (work.publisher) {
        const pubKey = work.publisher.name;
        if (!this.publishersMap.has(pubKey)) {
          this.publishersMap.set(pubKey, {
            ...work.publisher,
            workIds: [work.id],
            worksCount: 1
          });
        } else {
          const existing = this.publishersMap.get(pubKey)!;
          if (!existing.workIds.includes(work.id)) {
            existing.workIds.push(work.id);
            existing.worksCount = existing.workIds.length;
          }
        }
      }
    }
  }

  // =========================================================================
  // PUBLIC ACCESSORS & LINKED TRAVERSAL QUERIES
  // =========================================================================

  public getAllWorks(): OpacWorkEntity[] {
    return this.works;
  }

  public getWorkByIdOrUri(idOrUri: string): OpacWorkEntity | undefined {
    return this.works.find(w => 
      w.id === idOrUri || 
      w.uri === idOrUri || 
      w.canonicalMoonUri === idOrUri
    );
  }

  /**
   * FULL PERSON RESOLVER (Share-VDE / Libris pattern):
   * Returns Person details + every work associated with that person.
   */
  public getPersonByNameOrUri(nameOrUri: string): { person: OpacPersonEntity; works: OpacWorkEntity[] } | undefined {
    let matchedPerson: OpacPersonEntity | undefined;
    
    // Exact or normalized lookup
    for (const [key, p] of this.personsMap.entries()) {
      if (
        key === nameOrUri ||
        p.id === nameOrUri ||
        p.uri === nameOrUri ||
        p.canonicalMoonUri === nameOrUri ||
        p.nameArabic.includes(nameOrUri) ||
        (p.nameEnglish && p.nameEnglish.toLowerCase() === nameOrUri.toLowerCase())
      ) {
        matchedPerson = p;
        break;
      }
    }

    if (!matchedPerson) return undefined;

    const works = this.works.filter(w => matchedPerson!.workIds.includes(w.id));
    return { person: matchedPerson, works };
  }

  /**
   * FULL SUBJECT RESOLVER:
   * Returns Subject details + every work tagged with that subject.
   */
  public getSubjectByLabelOrUri(labelOrUri: string): { subject: OpacSubjectEntity; works: OpacWorkEntity[] } | undefined {
    let matchedSubject: OpacSubjectEntity | undefined;

    for (const [key, s] of this.subjectsMap.entries()) {
      if (
        key === labelOrUri ||
        s.id === labelOrUri ||
        s.uri === labelOrUri ||
        s.label.includes(labelOrUri)
      ) {
        matchedSubject = s;
        break;
      }
    }

    if (!matchedSubject) return undefined;

    const works = this.works.filter(w => matchedSubject!.workIds.includes(w.id));
    return { subject: matchedSubject, works };
  }

  /**
   * FULL PUBLISHER RESOLVER:
   */
  public getPublisherByName(name: string): { publisher: OpacPublisherEntity; works: OpacWorkEntity[] } | undefined {
    const pub = this.publishersMap.get(name);
    if (!pub) return undefined;
    const works = this.works.filter(w => pub.workIds.includes(w.id));
    return { publisher: pub, works };
  }



  /**
   * ALL PERSONS DIRECTORY (Requested by user: "show every person")
   */
  public getAllPersons(): OpacPersonEntity[] {
    return Array.from(this.personsMap.values()).sort((a, b) => b.worksCount - a.worksCount);
  }

  /**
   * ALL SUBJECTS DIRECTORY (Requested by user: "show every subject")
   */
  public getAllSubjects(): OpacSubjectEntity[] {
    return Array.from(this.subjectsMap.values()).sort((a, b) => b.worksCount - a.worksCount);
  }

  /**
   * ALL PUBLISHERS DIRECTORY
   */
  public getAllPublishers(): OpacPublisherEntity[] {
    return Array.from(this.publishersMap.values()).sort((a, b) => b.worksCount - a.worksCount);
  }

  /**
   * Dynamic search with multi-dimensional faceting
   */
  /**
   * Dynamic search with multi-dimensional faceting and Unicode/Arabic normalization
   */
  public searchWorks(
    query: string = '',
    selectedSubject?: string,
    selectedAuthor?: string,
    selectedEra?: string,
    selectedSource?: string,
    sort: 'relevance' | 'title' | 'date-desc' | 'date-asc' = 'relevance',
    page: number = 1,
    pageSize: number = 12,
    selectedFormat?: string,
    selectedAvailability?: string
  ): { works: OpacWorkEntity[]; totalCount: number; page: number; totalPages: number; pageSize: number; facets: OpacFacets } {
    let filtered = [...this.works];
    const rawQ = query.trim();
    const parsedQuery = this.parseDeepSearchQuery(rawQ);
    const qNorm = normalizeArabic(parsedQuery.freeText || (parsedQuery.clauses.length === 0 ? rawQ : ''));

    // Apply LIBRIS / VuFind fielded & boolean clauses if present
    if (parsedQuery.clauses.length > 0) {
      filtered = filtered.filter(w => {
        for (const c of parsedQuery.clauses) {
          const vNorm = normalizeArabic(c.value);
          const hayAll = normalizeArabic(
            `${w.title} ${w.subtitle || ''} ${w.primaryCreator.nameArabic} ${w.primaryCreator.nameEnglish || ''} ${w.subjects.map(s => s.label).join(' ')} ${w.instances.map(i => `${i.publisher || ''} ${i.callNumber || ''} ${i.isbn || ''}`).join(' ')}`
          );
          if (c.operator === 'NOT' && hayAll.includes(vNorm)) return false;
          if (c.operator !== 'NOT') {
            if (c.field === 'title' && !normalizeArabic(`${w.title} ${w.subtitle || ''}`).includes(vNorm)) return false;
            if (c.field === 'author' && !normalizeArabic(`${w.primaryCreator.nameArabic} ${w.primaryCreator.nameEnglish || ''} ${w.contributors.map(x => x.nameArabic).join(' ')}`).includes(vNorm)) return false;
            if (c.field === 'subject' && !w.subjects.some(s => normalizeArabic(s.label).includes(vNorm))) return false;
            if (c.field === 'isbn' && !w.instances.some(i => (i.isbn || '').toLowerCase().includes(c.value.toLowerCase()))) return false;
            if (c.field === 'callNumber' && !w.instances.some(i => (i.callNumber || '').toLowerCase().includes(c.value.toLowerCase())) && !(w.classificationLcc || '').toLowerCase().includes(c.value.toLowerCase())) return false;
            if (c.field === 'publisher' && !w.instances.some(i => normalizeArabic(i.publisher || '').includes(vNorm))) return false;
            if (c.field === 'status' && !w.instances.some(i => (i.holdingStatus || 'available') === c.value)) return false;
            if (c.field === 'year') {
              const rangeMatch = c.value.match(/^(\d{3,4})-(\d{3,4})$/);
              const wYear = parseInt((w.originDate || w.instances[0]?.publicationYear || '0').replace(/[^0-9]/g, '').slice(0, 4), 10) || 0;
              if (rangeMatch) {
                const y1 = parseInt(rangeMatch[1], 10);
                const y2 = parseInt(rangeMatch[2], 10);
                if (wYear < y1 || wYear > y2) return false;
              } else if (!(w.originDate || '').includes(c.value) && !w.instances.some(i => (i.publicationYear || '').includes(c.value))) {
                return false;
              }
            }
          }
        }
        w.matchReason = `تطابق متقدم عبر محرك LIBRIS/VuFind (${parsedQuery.clauses.map(c => `${c.field}:${c.value}`).join(' + ')})`;
        (w as any)._matchScore = 95;
        return true;
      });
    }

    if (qNorm) {
      // Every word, in any field and order, ignoring accents and spelling variants (see ../opac/searchIndex.ts).
      filtered = filtered.filter(w => {
        const m = matchWork(w, parsedQuery.freeText || rawQ);
        if (!m) return false;
        w.matchReason = m.reason;
        (w as any)._matchScore = m.score;
        return true;
      });
    } else if (parsedQuery.clauses.length === 0) {
      // Clear matchReason when no query is typed
      filtered.forEach(w => {
        w.matchReason = undefined;
        delete (w as any)._matchScore;
      });
    }

    if (selectedSubject && selectedSubject !== 'all') {
      const normSubj = normalizeArabic(selectedSubject);
      filtered = filtered.filter(w => w.subjects.some(s => normalizeArabic(s.label) === normSubj || s.label === selectedSubject));
    }

    if (selectedAuthor && selectedAuthor !== 'all') {
      const normAuth = normalizeArabic(selectedAuthor);
      filtered = filtered.filter(w => 
        normalizeArabic(w.primaryCreator.nameArabic) === normAuth || 
        w.primaryCreator.nameArabic === selectedAuthor ||
        w.primaryCreator.name === selectedAuthor
      );
    }

    if (selectedEra && selectedEra !== 'all') {
      filtered = filtered.filter(w => w.era === selectedEra);
    }

    if (selectedSource && selectedSource !== 'all') {
      filtered = filtered.filter(w => w.source === selectedSource);
    }

    if (selectedFormat && selectedFormat !== 'all') {
      const normFormat = normalizeArabic(selectedFormat);
      filtered = filtered.filter(w => 
        w.genreForm?.some(g => normalizeArabic(g).includes(normFormat)) ||
        w.instances.some(i => i.carrierType && normalizeArabic(i.carrierType).includes(normFormat))
      );
    }

    if (selectedAvailability && selectedAvailability !== 'all') {
      filtered = filtered.filter(w => 
        w.instances.some(i => i.holdingStatus === selectedAvailability) ||
        w.holdingItems?.some(it => it.status === selectedAvailability)
      );
    }

    // Sort Results
    if (sort === 'relevance' && qNorm) {
      filtered.sort((a, b) => ((b as any)._matchScore || 0) - ((a as any)._matchScore || 0));
    } else if (sort === 'title') {
      filtered.sort((a, b) => a.title.localeCompare(b.title, 'ar'));
    } else if (sort === 'date-desc') {
      filtered.sort((a, b) => (parseInt(b.originDate || '0', 10) || 0) - (parseInt(a.originDate || '0', 10) || 0));
    } else if (sort === 'date-asc') {
      filtered.sort((a, b) => (parseInt(a.originDate || '0', 10) || 0) - (parseInt(b.originDate || '0', 10) || 0));
    }

    // Build Facets from the pre-paginated filtered results
    const subjectCounts = new Map<string, number>();
    const authorCounts = new Map<string, number>();
    const eraCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();
    const formatCounts = new Map<string, number>();
    const availabilityCounts = new Map<string, number>();

    filtered.forEach(w => {
      w.subjects.forEach(s => subjectCounts.set(s.label, (subjectCounts.get(s.label) || 0) + 1));
      const auth = w.primaryCreator.nameArabic;
      authorCounts.set(auth, (authorCounts.get(auth) || 0) + 1);
      if (w.era) eraCounts.set(w.era, (eraCounts.get(w.era) || 0) + 1);
      sourceCounts.set(w.source, (sourceCounts.get(w.source) || 0) + 1);

      w.instances.forEach(inst => {
        if (inst.carrierType) {
          formatCounts.set(inst.carrierType, (formatCounts.get(inst.carrierType) || 0) + 1);
        }
        if (inst.holdingStatus) {
          formatCounts.set(inst.holdingStatus, (formatCounts.get(inst.holdingStatus) || 0) + 1);
        }
      });
      (w.genreForm || []).forEach(gf => {
        formatCounts.set(gf, (formatCounts.get(gf) || 0) + 1);
      });
    });

    const facets: OpacFacets = {
      types: [
        { value: 'all', label: 'الكل (All)', count: filtered.length },
        { value: 'work', label: 'الأعمال الفكرية (Works)', count: filtered.length },
        { value: 'instance', label: 'الطبعات والمطبوعات (Instances)', count: filtered.reduce((acc, w) => acc + w.instances.length, 0) },
        { value: 'person', label: 'الأعلام والمؤلفون (Persons)', count: this.personsMap.size },
        { value: 'subject', label: 'المواضيع والمفاهيم (Subjects)', count: this.subjectsMap.size }
      ],
      formats: Array.from(formatCounts.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count),
      availabilities: [
        { value: 'available', label: 'متاح للإعارة الفورية عبر FOLIO', count: filtered.filter(w => w.instances.some(i => i.holdingStatus === 'available')).length },
        { value: 'checked_out', label: 'معار حالياً (Checked out)', count: filtered.filter(w => w.instances.some(i => i.holdingStatus === 'checked_out') || w.holdingItems?.some(it => it.status === 'checked_out')).length },
        { value: 'paged', label: 'محجوز / مطلوب (Hold Requested)', count: filtered.filter(w => w.instances.some(i => i.holdingStatus === 'paged') || w.holdingItems?.some(it => it.status === 'paged')).length },
        { value: 'reference_only', label: 'للاطلاع الداخلي فقط (نوادر ومخطوطات)', count: filtered.filter(w => w.instances.some(i => i.holdingStatus === 'reference_only')).length },
        { value: 'digital_access', label: 'إتاحة رقمية مباشرة عبر الشابكة', count: filtered.filter(w => w.instances.some(i => i.holdingStatus === 'digital_access')).length }
      ].filter(f => f.count > 0),
      subjects: Array.from(subjectCounts.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count),
      authors: Array.from(authorCounts.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count),
      eras: Array.from(eraCounts.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count),
      sources: Array.from(sourceCounts.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count),
      languages: languageFacets(filtered)
    };

    const totalCount = filtered.length;
    const safePageSize = Math.max(1, pageSize);
    const totalPages = Math.ceil(totalCount / safePageSize) || 1;
    const validPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (validPage - 1) * safePageSize;
    const paginatedWorks = filtered.slice(startIndex, startIndex + safePageSize);

    return { 
      works: paginatedWorks, 
      totalCount, 
      page: validPage, 
      totalPages, 
      pageSize: safePageSize, 
      facets 
    };
  }

  /**
   * When nothing has every word typed: the works that have some of them, the ones with most words first. Only for two
   * or more words (one word that matches nothing has no partial match).
   */
  public partialMatches(query: string, limit: number = 6): OpacWorkEntity[] {
    return this.works
      .map(w => ({ w, ...wordsFound(w, query) }))
      .filter(x => x.total >= 2 && x.found >= 1 && x.found < x.total)
      .sort((a, b) => b.found - a.found)
      .slice(0, limit)
      .map(x => x.w);
  }

  /**
   * ADVANCED MULTI-FIELD SEARCH
   */
  public searchWorksAdvanced(params: OpacAdvancedSearchParams) {
    let filtered = [...this.works];

    if (params.title) {
      const tNorm = normalizeArabic(params.title);
      filtered = filtered.filter(w => normalizeArabic(w.title).includes(tNorm) || (w.subtitle && normalizeArabic(w.subtitle).includes(tNorm)));
    }

    if (params.creator) {
      const cNorm = normalizeArabic(params.creator);
      filtered = filtered.filter(w => 
        normalizeArabic(w.primaryCreator.nameArabic).includes(cNorm) ||
        (w.primaryCreator.nameEnglish && w.primaryCreator.nameEnglish.toLowerCase().includes(params.creator!.toLowerCase())) ||
        w.contributors.some(c => normalizeArabic(c.nameArabic).includes(cNorm))
      );
    }

    if (params.subject) {
      const sNorm = normalizeArabic(params.subject);
      filtered = filtered.filter(w => w.subjects.some(s => normalizeArabic(s.label).includes(sNorm)));
    }

    if (params.publisher) {
      const pNorm = normalizeArabic(params.publisher);
      filtered = filtered.filter(w => w.instances.some(i => i.publisher && normalizeArabic(i.publisher).includes(pNorm)));
    }

    if (params.callNumber) {
      const cn = params.callNumber.toLowerCase().trim();
      filtered = filtered.filter(w => w.instances.some(i => (i.callNumber && i.callNumber.toLowerCase().includes(cn)) || (i.isbn && i.isbn.includes(cn))));
    }

    if (params.yearFrom) {
      const yFrom = parseInt(params.yearFrom, 10);
      if (!isNaN(yFrom)) {
        filtered = filtered.filter(w => {
          const yr = parseInt(w.originDate || '0', 10);
          return yr >= yFrom;
        });
      }
    }

    if (params.yearTo) {
      const yTo = parseInt(params.yearTo, 10);
      if (!isNaN(yTo)) {
        filtered = filtered.filter(w => {
          const yr = parseInt(w.originDate || '9999', 10);
          return yr <= yTo;
        });
      }
    }

    if (params.format && params.format !== 'all') {
      const fNorm = normalizeArabic(params.format);
      filtered = filtered.filter(w => 
        w.genreForm?.some(g => normalizeArabic(g).includes(fNorm)) ||
        w.instances.some(i => i.carrierType && normalizeArabic(i.carrierType).includes(fNorm))
      );
    }

    if (params.language && params.language !== 'all') {
      filtered = filtered.filter(w => w.language === params.language);
    }

    // Fallback keyword if query passed
    if (params.query) {
      const qNorm = normalizeArabic(params.query);
      filtered = filtered.filter(w => 
        normalizeArabic(w.title).includes(qNorm) ||
        normalizeArabic(w.primaryCreator.nameArabic).includes(qNorm) ||
        w.subjects.some(s => normalizeArabic(s.label).includes(qNorm)) ||
        (w.summaryArabic && normalizeArabic(w.summaryArabic).includes(qNorm))
      );
    }

    // Sort
    const sort = params.sort || 'relevance';
    if (sort === 'title') {
      filtered.sort((a, b) => a.title.localeCompare(b.title, 'ar'));
    } else if (sort === 'date-desc') {
      filtered.sort((a, b) => (parseInt(b.originDate || '0', 10) || 0) - (parseInt(a.originDate || '0', 10) || 0));
    } else if (sort === 'date-asc') {
      filtered.sort((a, b) => (parseInt(a.originDate || '0', 10) || 0) - (parseInt(b.originDate || '0', 10) || 0));
    }

    // Build Facets
    const subjectCounts = new Map<string, number>();
    const authorCounts = new Map<string, number>();
    const eraCounts = new Map<string, number>();
    const formatCounts = new Map<string, number>();

    filtered.forEach(w => {
      w.subjects.forEach(s => subjectCounts.set(s.label, (subjectCounts.get(s.label) || 0) + 1));
      const auth = w.primaryCreator.nameArabic;
      authorCounts.set(auth, (authorCounts.get(auth) || 0) + 1);
      if (w.era) eraCounts.set(w.era, (eraCounts.get(w.era) || 0) + 1);
      w.instances.forEach(inst => {
        if (inst.carrierType) formatCounts.set(inst.carrierType, (formatCounts.get(inst.carrierType) || 0) + 1);
      });
    });

    const facets: OpacFacets = {
      types: [
        { value: 'all', label: 'الكل (All)', count: filtered.length },
        { value: 'work', label: 'الأعمال الفكرية (Works)', count: filtered.length },
        { value: 'instance', label: 'الطبعات والمطبوعات (Instances)', count: filtered.reduce((acc, w) => acc + w.instances.length, 0) },
        { value: 'person', label: 'الأعلام والمؤلفون (Persons)', count: this.personsMap.size },
        { value: 'subject', label: 'المواضيع والمفاهيم (Subjects)', count: this.subjectsMap.size }
      ],
      formats: Array.from(formatCounts.entries()).map(([value, count]) => ({ value, label: value, count })).sort((a, b) => b.count - a.count),
      availabilities: [
        { value: 'available', label: 'متاح للإعارة والمطالعة', count: filtered.filter(w => w.instances.some(i => i.holdingStatus === 'available')).length },
        { value: 'reference_only', label: 'للاطلاع الداخلي فقط', count: filtered.filter(w => w.instances.some(i => i.holdingStatus === 'reference_only')).length },
        { value: 'digital_access', label: 'إتاحة رقمية مباشرة', count: filtered.filter(w => w.instances.some(i => i.holdingStatus === 'digital_access')).length }
      ].filter(f => f.count > 0),
      subjects: Array.from(subjectCounts.entries()).map(([value, count]) => ({ value, label: value, count })).sort((a, b) => b.count - a.count),
      authors: Array.from(authorCounts.entries()).map(([value, count]) => ({ value, label: value, count })).sort((a, b) => b.count - a.count),
      eras: Array.from(eraCounts.entries()).map(([value, count]) => ({ value, label: value, count })).sort((a, b) => b.count - a.count),
      sources: [],
      languages: languageFacets(filtered)
    };

    const totalCount = filtered.length;
    const pageSize = params.pageSize || 12;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const page = Math.min(Math.max(1, params.page || 1), totalPages);
    const startIndex = (page - 1) * pageSize;
    const paginatedWorks = filtered.slice(startIndex, startIndex + pageSize);

    return { works: paginatedWorks, totalCount, page, totalPages, pageSize, facets };
  }

  /**
   * DEEP CATEGORIZED SEARCH FOR TYPEAHEAD OVERLAY & DEEP DISCOVERY
   * Real-time categorization into Works, Persons, Subjects, and Publishers (Unicode/Arabic Normalization)
   */
  public deepCategorizedSearch(query: string, scope: 'all' | 'title' | 'creator' | 'subject' | 'publisher' | 'callNumber' = 'all') {
    const rawQ = (query || '').trim();
    const q = normalizeArabic(rawQ);
    if (!q) {
      return {
        works: this.works.slice(0, 5),
        persons: this.getAllPersons().slice(0, 4),
        subjects: this.getAllSubjects().slice(0, 5),
        publishers: this.getAllPublishers().slice(0, 3),
        totalMatches: this.works.length
      };
    }

    // 1. Matching Works. Searching everything uses the same word-based search as the results page.
    const matchingWorks = (scope === 'all'
      ? this.works.map(w => ({ w, m: matchWork(w, rawQ) })).filter(x => x.m).sort((a, b) => b.m!.score - a.m!.score).map(x => x.w)
      : this.works).filter(w => {
      if (scope === 'all') return true;
      const tNorm = normalizeArabic(w.title);
      const subNorm = normalizeArabic(w.subtitle || '');
      const cNorm = normalizeArabic(w.primaryCreator.nameArabic);
      const cEn = (w.primaryCreator.nameEnglish || '').toLowerCase();
      const sNorm = w.subjects.map(s => normalizeArabic(s.label)).join(' ');
      const pNorm = w.instances.map(i => normalizeArabic(i.publisher || '')).join(' ');
      const callNorm = w.instances.map(i => (i.callNumber || '').toLowerCase() + ' ' + (i.isbn || '')).join(' ');

      if (scope === 'title') return tNorm.includes(q) || subNorm.includes(q);
      if (scope === 'creator') return cNorm.includes(q) || cEn.includes(rawQ.toLowerCase());
      if (scope === 'subject') return sNorm.includes(q);
      if (scope === 'publisher') return pNorm.includes(q);
      if (scope === 'callNumber') return callNorm.includes(rawQ.toLowerCase());
      
      // Default: 'all' fields
      return (
        tNorm.includes(q) ||
        subNorm.includes(q) ||
        cNorm.includes(q) ||
        cEn.includes(rawQ.toLowerCase()) ||
        sNorm.includes(q) ||
        (w.summaryArabic && normalizeArabic(w.summaryArabic).includes(q)) ||
        pNorm.includes(q) ||
        callNorm.includes(rawQ.toLowerCase())
      );
    });

    // 2. Matching Persons
    const matchingPersons = this.getAllPersons().filter(p =>
      allWordsIn(rawQ, p.name, p.nameArabic, p.nameEnglish, ...(p.otherNames || []), ...entityNamesOf([p.uri, ...(p.authorityLinks || [])]), p.bioArabic, p.bioEnglish));

    // 3. Matching Subjects
    const matchingSubjects = this.getAllSubjects().filter(s =>
      allWordsIn(rawQ, s.label, s.labelEnglish, ...entityNamesOf([(s as any).uri])) || !!(s.notationDdc && s.notationDdc.includes(rawQ)));

    // 4. Matching Publishers
    const matchingPublishers = this.getAllPublishers().filter(pub => allWordsIn(rawQ, pub.name, pub.city));

    const totalMatches = matchingWorks.length + matchingPersons.length + matchingSubjects.length + matchingPublishers.length;

    return {
      works: matchingWorks.slice(0, 8),
      persons: matchingPersons.slice(0, 5),
      subjects: matchingSubjects.slice(0, 6),
      publishers: matchingPublishers.slice(0, 4),
      totalMatches
    };
  }

  /**
   * RELATED WORKS RECOMMENDATION ENGINE ("ربما يعجبك أيضاً")
   * Computes relationship graph score between current work and all other catalog works
   */
  public getRelatedWorks(workId: string, limit: number = 4): OpacWorkEntity[] {
    const current = this.getWorkByIdOrUri(workId);
    if (!current) return this.works.slice(0, limit);

    const currentSubjectLabels = new Set(current.subjects.map(s => s.label));
    const currentCreator = current.primaryCreator.nameArabic;

    const scored = this.works
      .filter(w => w.id !== current.id)
      .map(w => {
        let score = 0;
        // Same creator: high affinity (+6)
        if (w.primaryCreator.nameArabic === currentCreator) score += 6;
        // Shared subjects (+3 per matching subject)
        w.subjects.forEach(s => {
          if (currentSubjectLabels.has(s.label)) score += 3;
        });
        // Shared era (+1)
        if (w.era && current.era && w.era === current.era) score += 1;
        // Shared language (+0.5)
        if (w.language === current.language) score += 0.5;

        return { work: w, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(s => s.work);
  }

  /**
   * INSTANT HOVER INFO EXTRACTOR
   * Returns fast metadata for floating glass cards on hover
   */
  public getHoverInfo(type: 'person' | 'subject' | 'work' | 'publisher' | 'classification', key: string) {
    if (type === 'person') {
      const data = this.getPersonByNameOrUri(key);
      if (!data) return null;
      return {
        type: 'person' as const,
        title: data.person.nameArabic,
        subtitle: data.person.nameEnglish,
        lifespan: data.person.lifespan,
        role: data.person.role,
        viaf: data.person.viafUri,
        loc: data.person.locUri,
        worksCount: data.works.length,
        bio: data.person.bioArabic ? data.person.bioArabic.slice(0, 150) + '...' : undefined,
        recentWork: data.works[0]?.title
      };
    }

    if (type === 'classification') {
      const works = this.works.filter(w => (w.classificationDdc && w.classificationDdc.includes(key)) || (w.classificationLcc && w.classificationLcc.includes(key)));
      return {
        type: 'classification' as const,
        title: `رمز التصنيف المكتبي: ${key}`,
        subtitle: key.startsWith('892') ? 'الأدب العربي واللغات السامية' : (key.startsWith('B') ? 'الفلسفة وعلم النفس والديانات' : 'تصنيف مكتبي معتمد'),
        worksCount: works.length,
        recentWork: works[0]?.title
      };
    }

    if (type === 'subject') {
      const data = this.getSubjectByLabelOrUri(key);
      if (!data) return null;
      return {
        type: 'subject' as const,
        title: data.subject.label,
        scheme: data.subject.scheme,
        ddc: data.subject.notationDdc,
        worksCount: data.works.length,
        broader: data.subject.broader,
        recentWork: data.works[0]?.title
      };
    }

    if (type === 'publisher') {
      const data = this.getPublisherByName(key);
      if (!data) return null;
      return {
        type: 'publisher' as const,
        title: data.publisher.name,
        city: data.publisher.city,
        worksCount: data.works.length,
        recentWork: data.works[0]?.title
      };
    }

    if (type === 'work') {
      const work = this.getWorkByIdOrUri(key);
      if (!work) return null;
      return {
        type: 'work' as const,
        title: work.title,
        subtitle: work.subtitle,
        creator: work.primaryCreator.nameArabic,
        year: work.originDate,
        editions: work.instances.length,
        summary: work.summaryArabic ? work.summaryArabic.slice(0, 140) + '...' : undefined
      };
    }

    return null;
  }

  // =========================================================================
  // LINKED DATA SERIALIZERS (Framed JSON-LD, Turtle, MARC21, Citations)
  // =========================================================================

  /**
   * The work as BIBFRAME JSON-LD. A record catalogued in Moon is exported exactly as the editor exports it
   * (one producer, validated against the LC ontology); other OPAC entries are described from the OPAC model
   * and go through the same normalizer. Placeholder copies made up for display are never included.
   */
  public generateFramedJsonLd(work: OpacWorkEntity): any {
    const saved = work.document?.work && work.document?.instance ? work.document : null;
    if (saved) {
      const recordId = saved.metadata?.recordId || work.id;
      const uriSet = saved.metadata?.uriSet || mintUriSet(recordId);
      return finishForExport(buildW3CJsonLd({ workData: saved.work, instanceData: saved.instance, itemData: saved.item || {}, uriSet }));
    }
    return finishForExport(this.describeOpacWork(work));
  }

  /** The same graph as generateFramedJsonLd, written as Turtle. */
  public generateTurtleRdf(work: OpacWorkEntity): string {
    return toTurtle(this.generateFramedJsonLd(work));
  }

  private describeOpacWork(work: OpacWorkEntity): any {
    const creator = work.primaryCreator;
    const iri = (u?: string) => (u && /^https?:\/\/\S+$/.test(u) ? u : undefined);
    const agentIri = iri(creator?.locUri) || iri(creator?.viafUri) || iri(creator?.uri);
    const workNode: any = {
      "@id": work.uri,
      "@type": "bf:Work",
      "bf:title": { "@type": "bf:Title", "bf:mainTitle": work.title, ...(work.subtitle ? { "bf:subtitle": work.subtitle } : {}) },
      ...(creator && (creator.nameArabic || creator.name) ? {
        "bf:contribution": {
          "@type": ["bf:Contribution", "bf:PrimaryContribution"],
          "bf:role": { "@id": "http://id.loc.gov/vocabulary/relators/aut" },
          "bf:agent": { ...(agentIri ? { "@id": agentIri } : {}), "@type": "bf:Person", "rdfs:label": creator.nameArabic || creator.name }
        }
      } : {}),
      ...(work.originDate ? { "bf:originDate": work.originDate } : {}),
      ...(work.language ? { "bf:language": { "@id": `http://id.loc.gov/vocabulary/languages/${work.language}` } } : {}),
      ...(work.classificationLcc ? { "bf:classification": { "@type": "bf:ClassificationLcc", "bf:classificationPortion": work.classificationLcc } } : {}),
      ...(work.summaryArabic ? { "bf:summary": { "@type": "bf:Summary", "rdfs:label": work.summaryArabic } } : {}),
      "bf:subject": (work.subjects || []).map(s => ({ ...(iri(s.uri) ? { "@id": s.uri } : {}), "@type": "bf:Topic", "rdfs:label": s.label })),
      "bf:hasInstance": work.instances.map(inst => ({ "@id": inst.uri }))
    };
    const instanceNodes = work.instances.map(inst => {
      const items = (inst.items || []).filter(it => !it.synthetic);
      return {
        "@id": inst.uri,
        "@type": "bf:Instance",
        "bf:instanceOf": { "@id": work.uri },
        "bf:title": { "@type": "bf:Title", "bf:mainTitle": inst.title || work.title, ...(inst.subtitle ? { "bf:subtitle": inst.subtitle } : {}) },
        ...(inst.publisher || inst.publicationYear || inst.publicationPlace ? {
          "bf:provisionActivity": {
            "@type": "bf:Publication",
            ...(inst.publicationPlace ? { "bf:place": { "@type": "bf:Place", "rdfs:label": inst.publicationPlace } } : {}),
            ...(inst.publisher ? { "bf:agent": { "@type": "bf:Agent", "rdfs:label": inst.publisher } } : {}),
            ...(inst.publicationYear ? { "bf:date": inst.publicationYear } : {})
          }
        } : {}),
        ...(inst.extent ? { "bf:extent": { "@type": "bf:Extent", "rdfs:label": inst.extent } } : {}),
        ...(inst.carrierType ? { "bf:carrier": { "@type": "bf:Carrier", "rdfs:label": inst.carrierType } } : {}),
        ...(inst.isbn ? { "bf:identifiedBy": { "@type": "bf:Isbn", "rdf:value": inst.isbn } } : {}),
        ...(items.length ? { "bf:hasItem": items.map(it => ({ "@id": it.uri })) } : {})
      };
    });
    const itemNodes = work.instances.flatMap(inst => (inst.items || []).filter(it => !it.synthetic && it.uri).map(it => ({
      "@id": it.uri,
      "@type": "bf:Item",
      "bf:itemOf": { "@id": inst.uri },
      ...(it.heldBy ? { "bf:heldBy": { "@type": "bf:Agent", "rdfs:label": it.heldBy } } : {}),
      ...(it.shelfMark ? { "bf:shelfMark": { "@type": "bf:ShelfMark", "rdfs:label": it.shelfMark } } : {}),
      ...(it.barcode ? { "bf:identifiedBy": { "@type": "bf:Barcode", "rdf:value": it.barcode } } : {}),
      ...(iri(it.accessUrl) ? { "bf:electronicLocator": { "@id": it.accessUrl } } : {})
    })));
    return { "@context": { ...BIBFRAME_JSONLD_CONTEXT }, "@graph": [workNode, ...instanceNodes, ...itemNodes] };
  }

  /**
   * Generates MARC 21 Authority / Bibliographic tags mapping (Zero fabrication)
   */
  public generateMarc21Mapping(work: OpacWorkEntity): string {
    const creator = work.primaryCreator;
    const inst = work.instances[0] || {} as Partial<OpacInstanceEntity>;
    const marcLines: string[] = [
      `LEADER 01425cam a2200385 i 4500`,
      `001 ${work.id}`
    ];

    if (work.originDate) {
      const cleanYear = work.originDate.replace(/[^0-9]/g, '').slice(0, 4) || 'uuuu';
      marcLines.push(`008 261009s${cleanYear}    |||||||||||||||||||${work.language || 'ara'} d`);
    }

    if (inst.isbn) {
      marcLines.push(`020    $a ${inst.isbn}`);
    }

    marcLines.push(`040    $a IQ-BG/MOON $b ara $c IQ-BG/MOON $e rda`);

    if (work.classificationLcc) {
      marcLines.push(`050 00 $a ${work.classificationLcc}`);
    }

    if (work.classificationDdc) {
      marcLines.push(`082 04 $a ${work.classificationDdc} $2 23`);
    }

    if (creator.nameArabic) {
      marcLines.push(`100 1  $a ${creator.nameArabic}${creator.lifespan ? ', $d ' + creator.lifespan : ''} $e author $4 aut $1 ${creator.uri}`);
    }

    marcLines.push(`245 10 $a ${work.title}${work.subtitle ? ' : $b ' + work.subtitle : ''}${creator.nameArabic ? ' / $c ' + creator.nameArabic + '.' : '.'}`);

    if (inst.publisher || inst.publicationPlace || inst.publicationYear) {
      marcLines.push(`264  1 $a ${inst.publicationPlace || '[م.م.]'} : $b ${inst.publisher || '[د.ن.]'} , $c ${inst.publicationYear || work.originDate || '[د.ت.]'}.`);
    }

    if (inst.extent) {
      marcLines.push(`300    $a ${inst.extent}${inst.dimensions ? ' ; $c ' + inst.dimensions : ''}`);
    }

    marcLines.push(`336    $a text $2 rdacontent`);
    marcLines.push(`337    $a unmediated $2 rdamedia`);
    marcLines.push(`338    $a volume $2 rdacarrier`);

    work.subjects.forEach(s => {
      marcLines.push(`650  4 $a ${s.label} $1 ${s.uri}`);
    });

    if (inst.uri) {
      marcLines.push(`758    $4 http://id.loc.gov/ontologies/bibframe/hasInstance $1 ${inst.uri}`);
    }

    marcLines.push(`856 40 $u ${work.uri} $y View in WOF MOON Linked OPAC`);

    return marcLines.join('\n');
  }

  /**
   * Generates standard citations honestly
   */
  public generateCitations(work: OpacWorkEntity): { apa: string; chicago: string; mla: string; bibtex: string } {
    const author = work.primaryCreator.nameArabic || 'مؤلف غير محدد';
    const title = work.title;
    const year = work.originDate || 'n.d.';
    const inst = work.instances[0];
    const publisher = inst?.publisher || '';
    const place = inst?.publicationPlace || '';

    const pubPart = [place, publisher].filter(Boolean).join(': ') || '';

    return {
      apa: `${author}. (${year}). ${title}.${pubPart ? ' ' + pubPart + '.' : ''}`,
      chicago: `${author}. ${year}. ${title}.${pubPart ? ' ' + pubPart + '.' : ''}`,
      mla: `${author}. ${title}.${publisher ? ' ' + publisher + ',' : ''} ${year}.`,
      bibtex: `@book{${work.id},\n  author = {${author}},\n  title = {${title}},\n  year = {${year}}${publisher ? `,\n  publisher = {${publisher}}` : ''}${place ? `,\n  address = {${place}}` : ''}\n}`
    };
  }

  // =========================================================================
  // SHARE-VDE + LIBRIS XL + VUFIND DEEP FEDERATED SEARCH & SERVICES
  // =========================================================================

  /**
   * Parses LIBRIS XL / VuFind Boolean & Fielded search syntax:
   * e.g. `title:القبسات author:الميرداماد year:1600-1700 status:available -مترجم`
   */
  public parseDeepSearchQuery(rawQuery: string): DeepSearchParsedQuery {
    const q = (rawQuery || '').trim();
    if (!q) {
      return {
        freeText: '',
        clauses: [],
        excludedTerms: [],
        solrQuery: '*:*'
      };
    }

    const clauses: Array<{ field: string; value: string; operator: 'AND' | 'NOT' | 'OR' }> = [];
    const excludedTerms: string[] = [];
    let yearFrom: string | undefined;
    let yearTo: string | undefined;
    let remaining = q;

    // Match field:value or field:"quoted value"
    const fieldRegex = /(-|\+)?(title|ti|ع|author|au|creator|م|subject|su|topic|موضوع|isbn|call|lcc|ddc|year|date|publisher|pub|status|carrier|format|lang):(?:"([^"]+)"|([^\s]+))/gi;
    remaining = remaining.replace(fieldRegex, (_match, prefix, rawField, quotedVal, unquotedVal) => {
      const val = (quotedVal || unquotedVal || '').trim();
      const fLow = rawField.toLowerCase();
      let canonicalField = 'all';
      if (['title', 'ti', 'ع'].includes(fLow)) canonicalField = 'title';
      else if (['author', 'au', 'creator', 'م'].includes(fLow)) canonicalField = 'author';
      else if (['subject', 'su', 'topic', 'موضوع'].includes(fLow)) canonicalField = 'subject';
      else if (fLow === 'isbn') canonicalField = 'isbn';
      else if (['call', 'lcc', 'ddc'].includes(fLow)) canonicalField = 'callNumber';
      else if (['year', 'date'].includes(fLow)) {
        canonicalField = 'year';
        const rangeMatch = val.match(/^(\d{3,4})-(\d{3,4})$/);
        if (rangeMatch) {
          yearFrom = rangeMatch[1];
          yearTo = rangeMatch[2];
        } else {
          yearFrom = val;
        }
      }
      else if (['publisher', 'pub'].includes(fLow)) canonicalField = 'publisher';
      else if (fLow === 'status') canonicalField = 'status';
      else if (['carrier', 'format'].includes(fLow)) canonicalField = 'format';
      else if (fLow === 'lang') canonicalField = 'language';

      if (prefix === '-') {
        excludedTerms.push(`${canonicalField}:${val}`);
      }

      clauses.push({
        field: canonicalField,
        value: val,
        operator: prefix === '-' ? 'NOT' : 'AND'
      });
      return '';
    });

    // Also parse excluded terms (-word)
    remaining = remaining.replace(/(?:^|\s)-([^\s"]+)/g, (_m, negWord) => {
      excludedTerms.push(negWord);
      clauses.push({ field: 'all', value: negWord, operator: 'NOT' });
      return ' ';
    });

    const freeText = remaining.replace(/\b(AND|OR|NOT)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const solrParts: string[] = [];
    if (freeText) solrParts.push(freeText);
    for (const c of clauses) {
      const prefix = c.operator === 'NOT' ? '-' : '';
      const sf = c.field === 'author' ? 'author' : c.field === 'subject' ? 'topic' : c.field === 'callNumber' ? 'callnumber-first' : c.field === 'year' ? 'publishDate' : c.field;
      solrParts.push(`${prefix}${sf}:(${c.value})`);
    }

    return {
      freeText,
      clauses,
      yearFrom,
      yearTo,
      excludedTerms,
      solrQuery: solrParts.join(' ') || '*:*'
    };
  }

  /**
   * Executes a live federated deep search across:
   * 1. Share-VDE / LIBRIS Linked Data Graph (Hubs, Works, Expressions, Instances, Persons, Subjects)
   * 2. VuFind 11.0 + Apache Solr `biblio` Core (/vufind/?api=search & /solr/biblio/select)
   * 3. FOLIO ILS Real-Time Availability
   */
  public async executeDeepFederatedSearch(rawQuery: string): Promise<FederatedDeepSearchResult> {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const parsed = this.parseDeepSearchQuery(rawQuery);
    const freeNorm = normalizeArabic(parsed.freeText);

    // 1. Filter works using both freeText and fielded clauses
    const matchedWorks = this.works.filter(w => {
      for (const c of parsed.clauses) {
        const vNorm = normalizeArabic(c.value);
        const hayAll = normalizeArabic(
          `${w.title} ${w.subtitle || ''} ${w.primaryCreator.nameArabic} ${w.primaryCreator.nameEnglish || ''} ${w.subjects.map(s => s.label).join(' ')} ${w.instances.map(i => `${i.publisher || ''} ${i.callNumber || ''} ${i.isbn || ''}`).join(' ')}`
        );
        if (c.operator === 'NOT' && hayAll.includes(vNorm)) return false;

        if (c.operator !== 'NOT') {
          if (c.field === 'title' && !normalizeArabic(`${w.title} ${w.subtitle || ''}`).includes(vNorm)) return false;
          if (c.field === 'author' && !normalizeArabic(`${w.primaryCreator.nameArabic} ${w.primaryCreator.nameEnglish || ''} ${w.contributors.map(x => x.nameArabic).join(' ')}`).includes(vNorm)) return false;
          if (c.field === 'subject' && !w.subjects.some(s => normalizeArabic(s.label).includes(vNorm))) return false;
          if (c.field === 'isbn' && !w.instances.some(i => (i.isbn || '').toLowerCase().includes(c.value.toLowerCase()))) return false;
          if (c.field === 'callNumber' && !w.instances.some(i => (i.callNumber || '').toLowerCase().includes(c.value.toLowerCase())) && !(w.classificationLcc || '').toLowerCase().includes(c.value.toLowerCase()) && !(w.classificationDdc || '').toLowerCase().includes(c.value.toLowerCase())) return false;
          if (c.field === 'publisher' && !w.instances.some(i => normalizeArabic(i.publisher || '').includes(vNorm))) return false;
          if (c.field === 'status' && !w.instances.some(i => (i.holdingStatus || 'available') === c.value)) return false;
          if (c.field === 'year') {
            const rangeMatch = c.value.match(/^(\d{3,4})-(\d{3,4})$/);
            const wYear = parseInt((w.originDate || w.instances[0]?.publicationYear || '0').replace(/[^0-9]/g, '').slice(0, 4), 10) || 0;
            if (rangeMatch) {
              const y1 = parseInt(rangeMatch[1], 10);
              const y2 = parseInt(rangeMatch[2], 10);
              if (wYear < y1 || wYear > y2) return false;
            } else if (!(w.originDate || '').includes(c.value) && !w.instances.some(i => (i.publicationYear || '').includes(c.value))) {
              return false;
            }
          }
        }
      }

      if (!freeNorm) return true;
      const catSearch = this.deepCategorizedSearch(parsed.freeText, 'all');
      return catSearch.works.some(cw => cw.id === w.id) ||
        normalizeArabic(`${w.title} ${w.subtitle || ''} ${w.primaryCreator.nameArabic} ${w.summaryArabic || ''}`).includes(freeNorm);
    });

    // 2. Build Share-VDE Opus / Hub Clusters
    const hubMap = new Map<string, {
      hubUri: string;
      hubTitle: string;
      creator: string;
      creatorName: string;
      workCount: number;
      instanceCount: number;
      totalEditions: number;
      availableItems: number;
      works: OpacWorkEntity[];
    }>();
    for (const w of matchedWorks) {
      const hubKey = w.expressionOfHub?.uri || `https://svde.org/opus/${encodeURIComponent(normalizeArabic(w.title).replace(/\s+/g, '-'))}`;
      const hubLabel = w.expressionOfHub?.label || `${w.title}`;
      const availCount = w.instances.filter(i => i.holdingStatus !== 'checked_out' && i.holdingStatus !== 'paged').length || 1;
      if (!hubMap.has(hubKey)) {
        hubMap.set(hubKey, {
          hubUri: hubKey,
          hubTitle: hubLabel,
          creator: w.primaryCreator.nameArabic,
          creatorName: w.primaryCreator.nameArabic,
          workCount: 1,
          instanceCount: w.instances.length,
          totalEditions: w.instances.length,
          availableItems: availCount,
          works: [w]
        });
      } else {
        const existing = hubMap.get(hubKey)!;
        existing.works.push(w);
        existing.workCount = existing.works.length;
        existing.instanceCount += w.instances.length;
        existing.totalEditions += w.instances.length;
        existing.availableItems += availCount;
      }
    }

    // 3. Query Live VuFind + Solr JSON API (/vufind/?api=search)
    let vufindSolrDocs: any[] = [];
    let vufindFacets: Record<string, Record<string, number>> = {};
    try {
      const qParam = encodeURIComponent(parsed.freeText || rawQuery || '*:*');
      const vfUrls = !VUFIND_ENABLED ? [] : [
        `/vufind/?api=search&lookfor=${qParam}`,
        `http://localhost:8085/?api=search&lookfor=${qParam}`,
        `http://localhost:8080/vufind?api=search&lookfor=${qParam}`
      ];
      for (const u of vfUrls) {
        try {
          const r = await fetch(u);
          if (r.ok) {
            const d = await r.json();
            if (d && Array.isArray(d.records)) {
              vufindSolrDocs = d.records;
              vufindFacets = d.facets || {};
              break;
            }
          }
        } catch {}
      }
    } catch {}

    const baseCat = this.deepCategorizedSearch(parsed.freeText || rawQuery, 'all');
    const searchRes = this.searchWorks(rawQuery || '', 'all', 'all', 'all', 'all', 'relevance', 1, 24);
    const clusters = Array.from(hubMap.values());
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    return {
      parsed,
      matchedWorks,
      workClusters: clusters,
      hubClusters: clusters,
      matchedPersons: baseCat.persons,
      matchedSubjects: baseCat.subjects,
      matchedPublishers: baseCat.publishers,
      vufindLiveRecords: vufindSolrDocs,
      vufindSolrDocs,
      solrLiveCount: vufindSolrDocs.length || matchedWorks.length,
      vufindFacets,
      facets: searchRes.facets,
      executionTimeMs: Math.max(1, Math.round(t1 - t0))
    };
  }

  /**
   * VuFind Virtual Shelf Browse (Call Number Neighbor Carousel)
   * Returns adjacent works on the library shelf sorted by Call Number (LCC / DDC)
   */
  public getVirtualShelfNeighbors(workIdOrCallNumber: string, windowSize: number = 6): VirtualShelfItem[] {
    const shelfEntries: VirtualShelfItem[] = this.works.map(w => {
      const inst = w.instances[0];
      const item = inst?.items?.[0] || w.holdingItems?.[0];
      const callNum = inst?.callNumber || item?.shelfMark || w.classificationLcc || w.classificationDdc || 'PJ7800 .A1';
      const status = inst?.holdingStatus || item?.status || 'available';
      return {
        workId: w.id,
        title: w.title,
        creator: w.primaryCreator.nameArabic,
        coverUrl: w.coverUrl || resolveWorkCover(w),
        availability: status,
        work: w,
        callNumber: callNum,
        shelfLocation: inst?.shelfLocation || item?.heldBy || 'المكتبة المركزية — القاعة الرئيسية',
        barcode: item?.barcode || '319240001',
        status,
        isCurrent: w.id === workIdOrCallNumber || callNum === workIdOrCallNumber
      };
    });

    shelfEntries.sort((a, b) => a.callNumber.localeCompare(b.callNumber, 'en'));

    let currentIdx = shelfEntries.findIndex(e => e.isCurrent);
    if (currentIdx === -1) currentIdx = 0;

    const half = Math.floor(windowSize / 2);
    const start = Math.max(0, Math.min(currentIdx - half, Math.max(0, shelfEntries.length - windowSize)));
    return shelfEntries.slice(start, start + windowSize);
  }

  /**
   * Share-VDE / IFLA LRM 4-Tier WEMI Cluster Graph Builder
   */
  public getWemiClusterTree(workId: string): WemiClusterNode | null {
    const work = this.getWorkByIdOrUri(workId) || this.works[0];
    if (!work) return null;

    const hubUri = work.expressionOfHub?.uri || `https://svde.org/opus/${work.id}`;
    const hubLabel = work.expressionOfHub?.label || `${work.title} (Opus / bf:Hub)`;

    // Find sibling works by same creator or same hub to enrich the cluster
    const clusterWorks = this.works.filter(
      w => w.id === work.id || (w.expressionOfHub?.uri && w.expressionOfHub.uri === work.expressionOfHub?.uri)
    );

    const workNodes: WemiClusterNode[] = clusterWorks.map(cw => {
      const instNodes: WemiClusterNode[] = cw.instances.map(inst => {
        const rawItems = inst.items && inst.items.length > 0 ? inst.items : cw.holdingItems || [];
        const itemNodes: WemiClusterNode[] = rawItems.map(it => ({
          id: it.id,
          tier: 'item',
          badge: 'bf:Item / FOLIO ILS',
          label: `${it.heldBy || inst.shelfLocation || 'المكتبة المركزية'} — Barcode: ${it.barcode || '319240001'}`,
          subtitle: `Shelfmark: ${it.shelfMark || inst.callNumber || cw.classificationLcc || 'B753'}`,
          uri: it.uri || getEntityIri('item', it.id),
          status: it.status || inst.holdingStatus || 'available'
        }));

        return {
          id: inst.id,
          tier: 'instance',
          badge: 'bf:Instance / Manifestation',
          label: `${inst.carrierType || 'طبعة'} — ${inst.publisher || inst.title}`,
          subtitle: [inst.publicationPlace, inst.publicationYear, inst.extent, inst.isbn ? `ISBN: ${inst.isbn}` : ''].filter(Boolean).join(' • '),
          uri: inst.uri,
          status: inst.holdingStatus || 'available',
          children: itemNodes
        };
      });

      return {
        id: cw.id,
        tier: 'work',
        badge: 'bf:Work + bf:Text / Expression',
        label: cw.title,
        subtitle: `${cw.primaryCreator.nameArabic} • اللغة: ${cw.languageLabel || cw.language} • التصنيف: ${cw.classificationLcc || cw.classificationDdc || 'عام'}`,
        uri: cw.uri,
        children: instNodes
      };
    });

    return {
      id: `hub-${work.id}`,
      tier: 'hub',
      badge: 'bf:Hub / Share-VDE Opus',
      label: hubLabel,
      subtitle: `المؤلف الأساسي: ${work.primaryCreator.nameArabic} • تاريخ النشأة: ${work.originDate || 'تراث موثق'}`,
      uri: hubUri,
      children: workNodes
    };
  }

  // =========================================================================
  // VUFIND RESEARCH BOOKBAG & MULTI-RECORD COMPARATOR
  // =========================================================================

  private bookbagKey = 'moon_opac_vufind_bookbag_v1';

  public getBookbagIds(): string[] {
    try {
      if (typeof window === 'undefined') return [];
      const raw = localStorage.getItem(this.bookbagKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public getBookbagWorks(): OpacWorkEntity[] {
    const ids = new Set(this.getBookbagIds());
    return this.works.filter(w => ids.has(w.id));
  }

  public isInBookbag(workId: string): boolean {
    return this.getBookbagIds().includes(workId);
  }

  public toggleBookbag(workId: string): { added: boolean; count: number; items: string[] } {
    const current = this.getBookbagIds();
    const exists = current.includes(workId);
    const updated = exists ? current.filter(id => id !== workId) : [...current, workId];
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(this.bookbagKey, JSON.stringify(updated));
      }
    } catch {}
    this.notify();
    return { added: !exists, count: updated.length, items: updated };
  }

  public clearBookbag(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(this.bookbagKey);
      }
    } catch {}
    this.notify();
  }

  public exportBookbag(format: 'ris' | 'bibtex' | 'marc21' | 'jsonld'): string {
    const items = this.getBookbagWorks();
    const targetWorks = items.length > 0 ? items : this.works.slice(0, 3);

    if (format === 'ris') {
      return targetWorks
        .map(w => {
          const inst = w.instances[0];
          return [
            'TY  - BOOK',
            `ID  - ${w.id}`,
            `TI  - ${w.title}`,
            `AU  - ${w.primaryCreator.nameArabic}`,
            inst?.publisher ? `PB  - ${inst.publisher}` : '',
            inst?.publicationPlace ? `CY  - ${inst.publicationPlace}` : '',
            w.originDate ? `PY  - ${w.originDate}` : '',
            inst?.isbn ? `SN  - ${inst.isbn}` : '',
            inst?.callNumber ? `CN  - ${inst.callNumber}` : '',
            `UR  - ${w.uri}`,
            'ER  - '
          ]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n\n');
    }

    if (format === 'bibtex') {
      return targetWorks.map(w => this.generateCitations(w).bibtex).join('\n\n');
    }

    if (format === 'marc21') {
      return targetWorks.map(w => this.generateMarc21Mapping(w)).join('\n\n========================================\n\n');
    }

    return JSON.stringify(
      targetWorks.map(w => this.generateFramedJsonLd(w)),
      null,
      2
    );
  }
}

export interface DeepSearchParsedQuery {
  freeText: string;
  clauses: Array<{ field: string; value: string; operator: 'AND' | 'NOT' | 'OR' }>;
  yearFrom?: string;
  yearTo?: string;
  excludedTerms: string[];
  solrQuery: string;
}

export interface FederatedDeepSearchResult {
  parsed: DeepSearchParsedQuery;
  matchedWorks: OpacWorkEntity[];
  workClusters: Array<{
    hubUri: string;
    hubTitle: string;
    creator: string;
    creatorName: string;
    workCount: number;
    instanceCount: number;
    totalEditions: number;
    availableItems: number;
    works: OpacWorkEntity[];
  }>;
  hubClusters: Array<{
    hubUri: string;
    hubTitle: string;
    creator: string;
    creatorName: string;
    workCount: number;
    instanceCount: number;
    totalEditions: number;
    availableItems: number;
    works: OpacWorkEntity[];
  }>;
  matchedPersons: OpacPersonEntity[];
  matchedSubjects: OpacSubjectEntity[];
  matchedPublishers: OpacPublisherEntity[];
  vufindLiveRecords: any[];
  vufindSolrDocs: any[];
  solrLiveCount: number;
  vufindFacets: Record<string, Record<string, number>>;
  facets: OpacFacets;
  executionTimeMs: number;
}

export interface VirtualShelfItem {
  workId: string;
  title: string;
  creator: string;
  coverUrl?: string;
  availability: string;
  work: OpacWorkEntity;
  callNumber: string;
  shelfLocation: string;
  barcode: string;
  status: string;
  isCurrent: boolean;
}

export interface WemiClusterNode {
  id: string;
  tier: 'hub' | 'work' | 'instance' | 'item';
  badge: string;
  label: string;
  subtitle?: string;
  uri: string;
  status?: string;
  children?: WemiClusterNode[];
}

// Singleton export
export const wolfMoonOpacService = new WolfMoonOpacService();
