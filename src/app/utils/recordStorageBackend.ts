/**
 * BIBFRAME Record Storage with Supabase Backend
 * 
 * This module handles saving, loading, and managing BIBFRAME records using:
 * - Supabase PostgreSQL database (key-value store) as primary storage
 * - localStorage as a fallback cache when offline or if Supabase is unavailable
 * 
 * Records are stored in JSON-LD format with @graph structure containing:
 * - Work entities (bf:Work, bf:Text, etc.)
 * - Instance entities (bf:Instance, bf:Print, bf:Electronic, etc.)
 * 
 * All operations automatically sync to Supabase and cache locally.
 */
import { BIBFRAMERecord } from '../types/bibframe';
import { MOON_API, moonHeaders, moonFetch } from './moonApi';

export type RecordStatus = 'complete' | 'pending-review' | 'needs-review';

export interface SavedRecord {
  id: string;
  record: BIBFRAMERecord;
  createdAt: string;
  modifiedAt: string;
  title: string;
  cataloger?: string;
  resourceType?: string;
  coverImage?: string;
  /** The cover stored for this record on the server (uploaded, or taken from Open Library / Google Books). */
  coverUrl?: string;
  status?: RecordStatus;
  approvedBy?: string;
  approvedAt?: string;
  /** Latest version on the server, and the version the public catalogue shows (older while an edit waits). */
  version?: number;
  publishedVersion?: number;
  /** The reviewer this record is assigned to, if any. */
  assignedTo?: string;
  /** Set when a Super Admin save could not be published: the required fields the record still lacks. */
  publishBlocked?: Array<{ en: string; ar: string }>;
  /** The library's rules that only warn (H10). */
  ruleWarnings?: Array<{ en: string; ar: string }>;
  jcricket?: {
    provenanceId?: string;
    institutionCode?: string;
    editHistory?: Array<{
      userId: string;
      username: string;
      timestamp: string;
      action: string;
    }>;
  };
}

// Records live in the Supabase edge function so every user and the Super Admin
// share one catalog (the site itself is static and has no /api backend).
const API_BASE = MOON_API;

function normalizeStatus(value: unknown): RecordStatus {
  return value === 'pending-review' || value === 'needs-review' ? value : 'complete';
}

// Seed IDs that must never be auto-injected or resurrected if removed
export const SEED_RECORD_IDS = new Set<string>([
  '1984-orwell',
  'pride-and-prejudice',
  'al-qabasat-mir-damad',
  'to-kill-mockingbird',
  'great-gatsby'
]);

export const DELETED_RECORDS_KEY = 'moon_deleted_record_ids';

export function getDeletedRecordIds(): Set<string> {
  const deleted = new Set<string>(SEED_RECORD_IDS);
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(DELETED_RECORDS_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          arr.forEach((id: string) => {
            if (id) deleted.add(id);
          });
        }
      }
    } catch (e) {
      console.error('Error reading deleted records from localStorage:', e);
    }
  }
  return deleted;
}

export function markRecordDeleted(id: string): void {
  if (typeof window !== 'undefined') {
    try {
      const deleted = getDeletedRecordIds();
      deleted.add(id);
      localStorage.setItem(DELETED_RECORDS_KEY, JSON.stringify(Array.from(deleted)));
    } catch (e) {
      console.error('Error saving deleted record id:', e);
    }
  }
}

export function unmarkRecordDeleted(id: string): void {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(DELETED_RECORDS_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          const updated = arr.filter((x: string) => x !== id);
          localStorage.setItem(DELETED_RECORDS_KEY, JSON.stringify(updated));
        }
      }
    } catch {}
  }
}

// Get access token from localStorage
function getAccessToken(): string | null {
  const auth = localStorage.getItem('moon_auth');
  if (auth) {
    try {
      const { accessToken } = JSON.parse(auth);
      return accessToken;
    } catch (error) {
      console.error('Error parsing auth data:', error);
    }
  }
  return null;
}

/**
 * CRITICAL: Build safe node with guaranteed @type and @id
 * Spread happens FIRST, defaults happen LAST
 * This ensures @type can NEVER disappear
 */
function buildSafeNode(node: any, defaultType: string, defaultId: string) {
  return {
    ...node,
    '@id': node?.['@id'] || defaultId,
    '@type': node?.['@type'] || defaultType
  };
}

/**
 * CRITICAL: Extract Work and Instance from @graph
 * Never fallback to template - throw error if invalid
 */
function extractNodesFromGraph(graph: any[]) {
  const work = graph.find(n => {
    const type = n['@type'];
    if (Array.isArray(type)) {
      return type.some((t: string) => t?.includes?.('Work'));
    }
    return type?.includes?.('Work');
  });

  const instance = graph.find(n => {
    const type = n['@type'];
    if (Array.isArray(type)) {
      return type.some((t: string) => t?.includes?.('Instance'));
    }
    return type?.includes?.('Instance');
  });

  if (!work || !instance) {
    throw new Error("Invalid BIBFRAME graph: missing Work or Instance");
  }

  return { work, instance };
}

const hasTypeEnding = (node: any, suffix: string) =>
  ([] as any[]).concat(node?.['@type'] || []).some((t) => typeof t === 'string' && t.endsWith(suffix));

/** Item, Expression and AdminMetadata travel in the stored @graph after Work and Instance. */
function extraGraphNodes(record: BIBFRAMERecord): any[] {
  const base = record.instance?.['@id'] || `urn:moon:${Date.now()}`;
  const nodes: any[] = [];
  if (record.item) nodes.push(buildSafeNode(record.item, 'bf:Item', `${base}#item`));
  const itemId = nodes[0]?.['@type'] === 'bf:Item' ? nodes[0]['@id'] : undefined;
  for (const copy of record.copies || []) {
    if (copy?.['@id'] && copy['@id'] !== itemId) nodes.push(copy);
  }
  if (record.expression) nodes.push(buildSafeNode(record.expression, 'bf:Expression', `${base}#expression`));
  if (record.adminMetadata) nodes.push(buildSafeNode(record.adminMetadata, 'bf:AdminMetadata', `${base}#admin`));
  return nodes;
}

/** Recovers the Item, Expression and AdminMetadata nodes from a stored @graph. */
function extractExtraNodes(graph: any[], metadata: any, work: any, instance: any) {
  const uriSet = metadata?.uriSet || {};
  const byId = (id?: string) => (id ? graph.find((n) => n?.['@id'] === id) : undefined);
  const item = byId(uriSet.item) || graph.find((n) => hasTypeEnding(n, 'Item'));
  const adminMetadata = byId(uriSet.admin) || graph.find((n) => hasTypeEnding(n, 'AdminMetadata'));
  const expression =
    byId(uriSet.expression) || graph.find((n) => n !== work && n !== instance && hasTypeEnding(n, 'Expression'));
  // Every other Item of the record is one of its copies.
  const copies = graph.filter((n) => n !== item && hasTypeEnding(n, 'Item') && n?.['@id']);
  return {
    ...(item ? { item } : {}),
    ...(copies.length ? { copies } : {}),
    ...(expression ? { expression } : {}),
    ...(adminMetadata ? { adminMetadata } : {}),
  };
}

/** The JSON-LD document the server stores for a record: Work, Instance and their extra nodes. */
export function toServerDocument(record: BIBFRAMERecord) {
  // Build safe Work and Instance nodes - spread FIRST, defaults LAST
  const safeWork = buildSafeNode(record.work, 'bf:Work', `http://moon.local/work/${Date.now()}`);
  const safeInstance = buildSafeNode(record.instance, 'bf:Instance', `http://moon.local/instance/${Date.now()}`);
  return {
    '@context': 'http://id.loc.gov/ontologies/bibframe/',
    '@graph': [safeWork, safeInstance, ...extraGraphNodes(record)],
  };
}

export interface PossibleDuplicate {
  id: string;
  title: string;
  status: string;
  cataloger?: string;
  reasons: Array<'isbn' | 'lccn' | 'title'>;
}

/**
 * Other records that look like the same book (same ISBN, LCCN or title, Arabic spellings folded).
 * Never throws: when the check cannot run, the save just goes ahead.
 */
export async function checkDuplicates(record: BIBFRAMERecord): Promise<PossibleDuplicate[]> {
  try {
    const { ok, data } = await moonFetch('/records/check-duplicates', {
      body: { id: record.metadata?.storageId ?? null, document: toServerDocument(record) },
    });
    return ok && Array.isArray(data?.duplicates) ? data.duplicates : [];
  } catch {
    return [];
  }
}

/** Someone else saved the record after the version this save started from. */
export class RecordConflictError extends Error {
  constructor(readonly currentVersion: number, readonly savedBy?: string, readonly savedAt?: string) {
    super(`This record was saved by ${savedBy || 'someone else'} (version ${currentVersion}) while you were editing it`);
  }
}

/**
 * Saves a record. `baseVersion` is the server version the editor started from: if someone saved a newer
 * one meanwhile, nothing is saved and RecordConflictError is thrown.
 */
export async function saveRecord(record: BIBFRAMERecord, cataloger?: string, options: { baseVersion?: number } = {}): Promise<SavedRecord> {
  // Helper to safely extract string from potentially nested title objects
  const extractTitleString = (titleValue: any): string => {
    if (!titleValue) return '';
    if (typeof titleValue === 'string') return titleValue;
    
    // If it's an object, try to extract string value
    if (typeof titleValue === 'object') {
      // First try common BIBFRAME properties
      if (typeof titleValue['bf:mainTitle'] === 'string') return titleValue['bf:mainTitle'];
      if (typeof titleValue['rdfs:label'] === 'string') return titleValue['rdfs:label'];
      if (typeof titleValue['mainTitle'] === 'string') return titleValue['mainTitle'];
      
      // If bf:mainTitle is itself an object with nested values
      if (titleValue['bf:mainTitle'] && typeof titleValue['bf:mainTitle'] === 'object') {
        if (titleValue['bf:mainTitle']['@value']) return String(titleValue['bf:mainTitle']['@value']);
        if (titleValue['bf:mainTitle']['rdfs:label']) return String(titleValue['bf:mainTitle']['rdfs:label']);
      }
    }
    
    return '';
  };

  // Enhanced title extraction from @graph structure
  let title = 'Untitled Record';
  
  // FIRST: Check if there's a Title node in the @graph (MoonEngineGlass format)
  if (record['@graph'] && Array.isArray(record['@graph'])) {
    const titleNode = record['@graph'].find((n: any) => n['@type'] === 'bf:Title');
    if (titleNode) {
      let mainTitle = '';
      let subtitle = '';
      
      if (titleNode.mainTitle) mainTitle = String(titleNode.mainTitle);
      if (titleNode.subtitle) subtitle = String(titleNode.subtitle);
      
      if (mainTitle) {
        title = subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
      }
    }
  }
  
  // Try instance title (could be URI reference)
  if (title === 'Untitled Record') {
    const instanceTitle = record.instance?.['title'] || record.instance?.['bf:title'];
    if (instanceTitle) {
      // If it's a URI, find the Title node in @graph
      if (typeof instanceTitle === 'string' && instanceTitle.startsWith('http://')) {
        if (record['@graph'] && Array.isArray(record['@graph'])) {
          const titleNode = record['@graph'].find((n: any) => n['@id'] === instanceTitle);
          if (titleNode) {
            let mainTitle = '';
            let subtitle = '';
            
            if (titleNode.mainTitle) mainTitle = String(titleNode.mainTitle);
            if (titleNode.subtitle) subtitle = String(titleNode.subtitle);
            
            if (mainTitle) {
              title = subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
            }
          }
        }
      } else {
        const extracted = extractTitleString(instanceTitle);
        if (extracted) title = extracted;
      }
    }
  }
  
  // Try work title if no instance title (could be URI reference)
  if (title === 'Untitled Record') {
    const workTitle = record.work?.['title'] || record.work?.['bf:title'];
    if (workTitle) {
      // If it's a URI, find the Title node in @graph
      if (typeof workTitle === 'string' && workTitle.startsWith('http://')) {
        if (record['@graph'] && Array.isArray(record['@graph'])) {
          const titleNode = record['@graph'].find((n: any) => n['@id'] === workTitle);
          if (titleNode) {
            let mainTitle = '';
            let subtitle = '';
            
            if (titleNode.mainTitle) mainTitle = String(titleNode.mainTitle);
            if (titleNode.subtitle) subtitle = String(titleNode.subtitle);
            
            if (mainTitle) {
              title = subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
            }
          }
        }
      } else {
        const extracted = extractTitleString(workTitle);
        if (extracted) title = extracted;
      }
    }
  }
  
  // Try instance label
  if (title === 'Untitled Record' && record.instance?.['rdfs:label']) {
    title = String(record.instance['rdfs:label']);
  }
  
  // Try work label
  if (title === 'Untitled Record' && record.work?.['rdfs:label']) {
    title = String(record.work['rdfs:label']);
  }

  const resourceType = record.metadata?.resourceType || 'Unknown';
  
  // Try to get cover image from instance identifiers
  let coverImage: string | undefined;
  const identifiers = record.instance['bf:identifiedBy'] || [];
  for (const id of identifiers) {
    if (id['@type'] === 'bf:Isbn' && id['rdf:value']) {
      coverImage = `https://covers.openlibrary.org/b/isbn/${id['rdf:value']}-M.jpg`;
      break;
    }
  }

  // A record that was saved before keeps its storage id, so saving again updates it instead of
  // creating a copy.
  const storageId = record.metadata?.storageId || `record-${Date.now()}`;
  const previous = getAllRecordsLocal().find((r) => r.id === storageId);
  record = { ...record, metadata: { ...(record.metadata || {}), storageId } as any };

  const savedRecord: SavedRecord = {
    id: storageId,
    record,
    createdAt: previous?.createdAt || new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    title,
    cataloger,
    resourceType,
    coverImage,
    // Provisional; the server decides the real status from the user's session.
    status: normalizeStatus(record.metadata?.status),
  };

  unmarkRecordDeleted(savedRecord.id);

  try {
    // Build JSON-LD document format expected by server
    const jsonldDocument = toServerDocument(record);
    
    const response = await fetch(`${API_BASE}/records/save`, {
      method: 'POST',
      headers: moonHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id: savedRecord.id,
        document: jsonldDocument,
        title: savedRecord.title,
        metadata: { ...(record.metadata || {}), cataloger },
        status: savedRecord.status,
        baseVersion: options.baseVersion,
      }),
    });

    if (response.status === 409) {
      const body = await response.json().catch(() => ({}));
      const c = body?.conflict || {};
      throw new RecordConflictError(c.currentVersion, c.savedBy, c.savedAt);
    }
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to save record to Supabase:', errorText);
      throw new Error(`Failed to save record: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Record saved to Supabase:', data);
    savedRecord.version = data?.version;
    savedRecord.publishedVersion = data?.publishedVersion;
    savedRecord.publishBlocked = data?.publishBlocked;
    savedRecord.ruleWarnings = data?.ruleWarnings;
    if (data?.status) {
      savedRecord.status = normalizeStatus(data.status);
      savedRecord.record = {
        ...savedRecord.record,
        metadata: { ...savedRecord.record.metadata, status: savedRecord.status } as any,
      };
    }
    
    // Also save to localStorage as a cache
    try {
      const records = getAllRecordsLocal();
      const existingIndex = records.findIndex(r => r.id === savedRecord.id);
      if (existingIndex >= 0) {
        records[existingIndex] = savedRecord;
      } else {
        records.push(savedRecord);
      }
      localStorage.setItem('bibframe_saved_records', JSON.stringify(records));
    } catch (e) {
      console.error('Error caching to localStorage:', e);
    }
    
    return savedRecord;
  } catch (error) {
    // A conflict is the cataloger's to resolve; it must never look like a successful save.
    if (error instanceof RecordConflictError) throw error;
    console.error('Error saving record to Supabase, falling back to localStorage:', error);
    // Fallback to localStorage
    const records = getAllRecordsLocal();
    const existingIndex = records.findIndex(r => r.id === savedRecord.id);
    if (existingIndex >= 0) {
      records[existingIndex] = savedRecord;
    } else {
      records.push(savedRecord);
    }
    localStorage.setItem('bibframe_saved_records', JSON.stringify(records));
    return savedRecord;
  }
}

/** One record as the server lists it (JSON-LD @graph), in the app's work/instance form. */
function fromServerRecord(serverRecord: any): SavedRecord {
  // Normalize @graph immediately - ONE structure everywhere
  const graph = serverRecord.document?.['@graph'] || serverRecord['@graph'];
  
  if (!graph || !Array.isArray(graph)) {
    console.error("No @graph found in record:", serverRecord.id);
    throw new Error(`Invalid record ${serverRecord.id}: missing @graph`);
  }

  // Extract Work and Instance - throw error if invalid (NO TEMPLATE FALLBACK)
  let work: any;
  let instance: any;
  
  try {
    const nodes = extractNodesFromGraph(graph);
    work = nodes.work;
    instance = nodes.instance;
  } catch (error) {
    console.error(`Failed to extract nodes from record ${serverRecord.id}:`, error);
    // Try recovery from relationships if extraction failed
    const potentialInstance = graph.find((n: any) => n['bf:instanceOf']);
    if (potentialInstance) {
      instance = potentialInstance;
      if (!instance['@type']) instance['@type'] = 'bf:Instance';
      
      const workId = instance['bf:instanceOf']['@id'];
      if (workId) {
        const potentialWork = graph.find((n: any) => n['@id'] === workId);
        if (potentialWork) {
          work = potentialWork;
          if (!work['@type']) work['@type'] = 'bf:Work';
        }
      }
    }
    
    // If still no work/instance, this record is corrupted
    if (!work || !instance) {
      throw new Error(`Corrupted record ${serverRecord.id}: cannot recover Work or Instance`);
    }
  }
  
  // Helper to safely extract string from potentially nested title objects
  const extractTitleString = (titleValue: any): string => {
    if (!titleValue) return '';
    if (typeof titleValue === 'string') return titleValue;
    
    // If it's an object, try to extract string value
    if (typeof titleValue === 'object') {
      // First try common BIBFRAME properties
      if (typeof titleValue['bf:mainTitle'] === 'string') return titleValue['bf:mainTitle'];
      if (typeof titleValue['rdfs:label'] === 'string') return titleValue['rdfs:label'];
      if (typeof titleValue['mainTitle'] === 'string') return titleValue['mainTitle'];
      
      // If bf:mainTitle is itself an object with nested values
      if (titleValue['bf:mainTitle'] && typeof titleValue['bf:mainTitle'] === 'object') {
        if (titleValue['bf:mainTitle']['@value']) return String(titleValue['bf:mainTitle']['@value']);
        if (titleValue['bf:mainTitle']['rdfs:label']) return String(titleValue['bf:mainTitle']['rdfs:label']);
      }
    }
    
    return '';
  };

  // Enhanced title extraction - check Title node first
  let title = serverRecord.title || 'Untitled Record';
  
  // Ensure title is a string even if serverRecord.title is an object
  if (typeof title === 'object') {
    const extracted = extractTitleString(title);
    title = extracted || 'Untitled Record';
  }
  
  // If title is still default, try to extract from Title node in graph
  if (title === 'Untitled Record') {
    const titleNode = graph.find((n: any) => n['@type'] === 'bf:Title');
    if (titleNode) {
      // Check for mainTitle and subtitle separately
      let mainTitle = '';
      let subtitle = '';
      
      if (titleNode.mainTitle) mainTitle = String(titleNode.mainTitle);
      if (titleNode.subtitle) subtitle = String(titleNode.subtitle);
      
      // Combine mainTitle and subtitle
      if (mainTitle) {
        title = subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
        console.log(`📖 Extracted title from Title node: "${title}" (record: ${serverRecord.id})`);
      } else {
        const extracted = extractTitleString(titleNode);
        title = extracted || 'Untitled Record';
      }
    }
  }
  
  // Fallback to instance title property (might be URI reference to Title node)
  if (title === 'Untitled Record') {
    const instanceTitleRef = instance['title'];
    if (instanceTitleRef && typeof instanceTitleRef === 'string') {
      // It's a URI reference - find the actual Title node
      const titleNode = graph.find((n: any) => n['@id'] === instanceTitleRef);
      if (titleNode) {
        let mainTitle = '';
        let subtitle = '';
        
        if (titleNode.mainTitle) mainTitle = String(titleNode.mainTitle);
        if (titleNode.subtitle) subtitle = String(titleNode.subtitle);
        
        if (mainTitle) {
          title = subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
        }
      }
    } else if (instanceTitleRef) {
      const extracted = extractTitleString(instanceTitleRef);
      if (extracted) title = extracted;
    }
  }
  
  // Fallback to work title property (might be URI reference to Title node)
  if (title === 'Untitled Record') {
    const workTitleRef = work['title'];
    if (workTitleRef && typeof workTitleRef === 'string') {
      // It's a URI reference - find the actual Title node
      const titleNode = graph.find((n: any) => n['@id'] === workTitleRef);
      if (titleNode) {
        let mainTitle = '';
        let subtitle = '';
        
        if (titleNode.mainTitle) mainTitle = String(titleNode.mainTitle);
        if (titleNode.subtitle) subtitle = String(titleNode.subtitle);
        
        if (mainTitle) {
          title = subtitle ? `${mainTitle} ${subtitle}` : mainTitle;
        }
      }
    } else if (workTitleRef) {
      const extracted = extractTitleString(workTitleRef);
      if (extracted) title = extracted;
    }
  }
  
  if (title === 'Untitled Record' && instance['rdfs:label']) {
    title = String(instance['rdfs:label']);
  }
  if (title === 'Untitled Record' && work['rdfs:label']) {
    title = String(work['rdfs:label']);
  }
  
  const status = normalizeStatus(serverRecord.status || serverRecord.metadata?.status);

  // CRITICAL FIX: Convert @graph format to work/instance format
  const convertedRecord: BIBFRAMERecord = {
    '@context': serverRecord.document?.['@context'] || {
      'bf': 'http://id.loc.gov/ontologies/bibframe/',
      'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
    },
    work: work,
    instance: instance,
    ...extractExtraNodes(graph, serverRecord.metadata, work, instance),
    metadata: {
      storageId: serverRecord.id,
      catalogingLanguage: serverRecord.metadata?.catalogingLanguage || 'en',
      descriptionConventions: serverRecord.metadata?.descriptionConventions || 'rda',
      resourceType: serverRecord.metadata?.resourceType || 'Text',
      catalogingInterface: serverRecord.metadata?.catalogingInterface,
      templateId: serverRecord.metadata?.templateId,
      recordId: serverRecord.metadata?.recordId,
      uriSet: serverRecord.metadata?.uriSet,
      ontologyVersion: serverRecord.metadata?.ontologyVersion,
      createdAt: serverRecord.metadata?.createdAt,
      catalogerId: serverRecord.metadata?.catalogerId,
      status,
      serverVersion: serverRecord.version,
      coverUrl: serverRecord.coverUrl,
    } as any
  };

  return {
    id: serverRecord.id,
    // Store the converted work/instance format
    record: convertedRecord,
    title: title,
    createdAt: serverRecord.createdAt || serverRecord.metadata?.createdAt || serverRecord.saved || new Date().toISOString(),
    modifiedAt: serverRecord.saved || serverRecord.metadata?.modifiedAt || new Date().toISOString(),
    cataloger: serverRecord.cataloger || serverRecord.metadata?.cataloger || serverRecord.metadata?.catalogerId,
    resourceType: serverRecord.metadata?.resourceType,
    status,
    approvedBy: serverRecord.approvedBy,
    approvedAt: serverRecord.approvedAt,
    version: serverRecord.version,
    publishedVersion: serverRecord.publishedVersion,
    assignedTo: serverRecord.assignedTo,
    coverUrl: serverRecord.coverUrl,
    coverImage: serverRecord.coverUrl,
  };
}

/**
 * Every record from the server, merged with this browser's local copies. With `published`, only what
 * the public catalogue shows: each published record at its published version (an edit waiting for
 * review never replaces it), and no local copies.
 */
export async function getAllRecords(options: { published?: boolean } = {}): Promise<SavedRecord[]> {
  const deletedIds = getDeletedRecordIds();
  try {
    const response = await fetch(`${API_BASE}/records${options.published ? '?view=published' : ''}`, {
      headers: moonHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch records: ${response.statusText}`);
    }

    const data = await response.json();
    const supabaseRecords = data.records || [];
    
    // Convert server format to SavedRecord format
    const convertedRecords: SavedRecord[] = supabaseRecords
      .filter((serverRecord: any) => serverRecord && !deletedIds.has(serverRecord.id))
      .map(fromServerRecord);

    if (options.published) return convertedRecords;
    
    // Merge with local records, excluding any deleted records
    const localRecords = getAllRecordsLocal();
    const recordMap = new Map<string, SavedRecord>();

    localRecords.forEach(r => {
      if (!deletedIds.has(r.id)) recordMap.set(r.id, r);
    });
    convertedRecords.forEach(r => {
      if (!deletedIds.has(r.id)) recordMap.set(r.id, r);
    });

    const finalRecords = Array.from(recordMap.values());
    finalRecords.sort((a, b) => {
      const dateA = new Date(a.modifiedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.modifiedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    try {
      localStorage.setItem('bibframe_saved_records', JSON.stringify(finalRecords));
    } catch (e) {
      console.error('Error caching to localStorage:', e);
    }
    
    console.log(`✅ Loaded ${finalRecords.length} total records (${convertedRecords.length} from Supabase)`);
    return finalRecords;
  } catch (error) {
    console.error('Error fetching records from Supabase, falling back to localStorage:', error);
    return getAllRecordsLocal();
  }
}

function getSeedExamples(): SavedRecord[] {
  // Demo seeds should never be injected automatically into the database
  return [];
}

export function getAllRecordsLocal(): SavedRecord[] {
  const deletedIds = getDeletedRecordIds();
  const recordMap = new Map<string, SavedRecord>();

  const stored = typeof window !== 'undefined' ? localStorage.getItem('bibframe_saved_records') : null;
  if (stored) {
    try {
      const records = JSON.parse(stored);
      if (Array.isArray(records)) {
        records.forEach((r: any) => {
          if (r && r.id && !deletedIds.has(r.id)) {
            recordMap.set(r.id, r);
          }
        });
      }
    } catch (e) {
      console.error('Error parsing localStorage records:', e);
    }
  }

  const allRecords = Array.from(recordMap.values());
  allRecords.sort((a, b) => {
    const dateA = new Date(a.modifiedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.modifiedAt || b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  // Keep localStorage clean of deleted/seed records
  if (typeof window !== 'undefined' && stored) {
    try {
      const rawRecords = JSON.parse(stored);
      if (Array.isArray(rawRecords) && rawRecords.some((r: any) => deletedIds.has(r?.id))) {
        localStorage.setItem('bibframe_saved_records', JSON.stringify(allRecords));
      }
    } catch {}
  }

  return allRecords;
}

export async function getRecordById(id: string): Promise<SavedRecord | null> {
  const deletedIds = getDeletedRecordIds();
  if (deletedIds.has(id)) {
    return null;
  }
  try {
    const response = await fetch(`${API_BASE}/records/${encodeURIComponent(id)}`, {
      headers: moonHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Record ${id} not found in Supabase, checking localStorage`);
        const records = getAllRecordsLocal();
        return records.find((r) => r.id === id) || null;
      }
      throw new Error(`Failed to fetch record: ${response.statusText}`);
    }

    const serverRecord = await response.json();
    
    // Normalize @graph immediately - ONE structure everywhere
    const graph = serverRecord.document?.['@graph'] || serverRecord['@graph'];
    
    if (!graph || !Array.isArray(graph)) {
      console.error("No @graph found in record:", serverRecord.id);
      throw new Error(`Invalid record ${serverRecord.id}: missing @graph`);
    }

    // Extract Work and Instance - throw error if invalid (NO TEMPLATE FALLBACK)
    let work: any;
    let instance: any;
    
    try {
      const nodes = extractNodesFromGraph(graph);
      work = nodes.work;
      instance = nodes.instance;
    } catch (error) {
      console.error(`Failed to extract nodes from record ${serverRecord.id}:`, error);
      // Try recovery from relationships if extraction failed
      const potentialInstance = graph.find((n: any) => n['bf:instanceOf']);
      if (potentialInstance) {
        instance = potentialInstance;
        if (!instance['@type']) instance['@type'] = 'bf:Instance';
        
        const workId = instance['bf:instanceOf']['@id'];
        if (workId) {
          const potentialWork = graph.find((n: any) => n['@id'] === workId);
          if (potentialWork) {
            work = potentialWork;
            if (!work['@type']) work['@type'] = 'bf:Work';
          }
        }
      }
      
      // If still no work/instance, this record is corrupted
      if (!work || !instance) {
        throw new Error(`Corrupted record ${serverRecord.id}: cannot recover Work or Instance`);
      }
    }
    
    // Enhanced title extraction
    let title = serverRecord.title || 'Untitled Record';
    const instanceTitle = instance['bf:title'];
    if (title === 'Untitled Record' && instanceTitle) {
      if (typeof instanceTitle === 'string') {
        title = instanceTitle;
      } else if (instanceTitle['bf:mainTitle']) {
        title = instanceTitle['bf:mainTitle'];
      } else if (instanceTitle['rdfs:label']) {
        title = instanceTitle['rdfs:label'];
      }
    }
    if (title === 'Untitled Record') {
      const workTitle = work['bf:title'];
      if (workTitle) {
        if (typeof workTitle === 'string') {
          title = workTitle;
        } else if (workTitle['bf:mainTitle']) {
          title = workTitle['bf:mainTitle'];
        } else if (workTitle['rdfs:label']) {
          title = workTitle['rdfs:label'];
        }
      }
    }
    if (title === 'Untitled Record' && instance['rdfs:label']) {
      title = instance['rdfs:label'];
    }
    if (title === 'Untitled Record' && work['rdfs:label']) {
      title = work['rdfs:label'];
    }
    
    // Create standardized work/instance format
    const convertedRecord: BIBFRAMERecord = {
      '@context': serverRecord.document?.['@context'] || {
        'bf': 'http://id.loc.gov/ontologies/bibframe/',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
      },
      work,
      instance,
      ...extractExtraNodes(graph, serverRecord.metadata, work, instance),
      metadata: {
        ...(serverRecord.metadata || {}),
        storageId: serverRecord.id,
        // The version this copy is; a save sends it back so a newer save by someone else isn't overwritten.
        serverVersion: serverRecord.version,
        catalogingLanguage: serverRecord.metadata?.catalogingLanguage || 'en',
        descriptionConventions: serverRecord.metadata?.descriptionConventions || 'rda',
        resourceType: serverRecord.metadata?.resourceType || 'Text'
      }
    };
    
    const savedRecord: SavedRecord = {
      id: serverRecord.id,
      record: convertedRecord,
      createdAt: serverRecord.createdAt || serverRecord.saved,
      modifiedAt: serverRecord.saved,
      title,
      cataloger: serverRecord.cataloger || serverRecord.metadata?.catalogerId,
      status: normalizeStatus(serverRecord.status || serverRecord.metadata?.status),
      approvedBy: serverRecord.approvedBy,
      approvedAt: serverRecord.approvedAt,
    };
    
    console.log(`✅ Loaded record ${id} from Supabase`);
    return savedRecord;
  } catch (error) {
    console.error('Error fetching record from Supabase, checking localStorage:', error);
    // Fallback to localStorage
    const records = getAllRecordsLocal();
    return records.find((r) => r.id === id) || null;
  }
}

export async function deleteRecord(id: string): Promise<void> {
  // Ask the server first: it refuses deletes by anyone but the Super Admin or the record's cataloger.
  let response: Response | null = null;
  try {
    response = await fetch(`${API_BASE}/records/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: moonHeaders(),
    });
  } catch (error) {
    // Offline: fall through and hide it locally; the server copy is untouched.
    console.error('Error deleting record from Supabase:', error);
  }
  if (response && (response.status === 401 || response.status === 403)) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || 'You are not allowed to delete this record.');
  }
  if (response && !response.ok) {
    console.warn(`Server responded with ${response.status} when deleting record ${id}`);
  } else if (response) {
    console.log(`✅ Deleted record ${id} from Supabase`);
  }

  markRecordDeleted(id);

  // Directly clean localStorage cache without re-seeding
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('bibframe_saved_records');
      if (stored) {
        const records = JSON.parse(stored);
        if (Array.isArray(records)) {
          const filtered = records.filter((r: any) => r && r.id !== id);
          localStorage.setItem('bibframe_saved_records', JSON.stringify(filtered));
        }
      }
    } catch (e) {
      console.error('Error updating localStorage on delete:', e);
    }
  }
}

export async function updateRecord(id: string, record: BIBFRAMERecord, cataloger?: string): Promise<SavedRecord | null> {
  unmarkRecordDeleted(id);
  // Enhanced title extraction
  let title = 'Untitled Record';
  const instanceTitle = record.instance['bf:title'];
  if (instanceTitle) {
    if (typeof instanceTitle === 'string') {
      title = instanceTitle;
    } else if (instanceTitle['bf:mainTitle']) {
      title = instanceTitle['bf:mainTitle'];
    } else if (instanceTitle['rdfs:label']) {
      title = instanceTitle['rdfs:label'];
    }
  }
  if (title === 'Untitled Record') {
    const workTitle = record.work['bf:title'];
    if (workTitle) {
      if (typeof workTitle === 'string') {
        title = workTitle;
      } else if (workTitle['bf:mainTitle']) {
        title = workTitle['bf:mainTitle'];
      } else if (workTitle['rdfs:label']) {
        title = workTitle['rdfs:label'];
      }
    }
  }
  if (title === 'Untitled Record' && record.instance['rdfs:label']) {
    title = record.instance['rdfs:label'];
  }
  if (title === 'Untitled Record' && record.work['rdfs:label']) {
    title = record.work['rdfs:label'];
  }

  const resourceType = record.metadata?.resourceType || 'Unknown';

  // Try to get cover image
  let coverImage: string | undefined;
  const identifiers = record.instance['bf:identifiedBy'] || [];
  for (const identifier of identifiers) {
    if (identifier['@type'] === 'bf:Isbn' && identifier['rdf:value']) {
      coverImage = `https://covers.openlibrary.org/b/isbn/${identifier['rdf:value']}-M.jpg`;
      break;
    }
  }

  const previous = getAllRecordsLocal().find((r) => r.id === id);

  try {
    // records/save upserts by id, so no delete is needed (deleting first used to
    // mark the id as deleted locally and make the edited record vanish).
    record = { ...record, metadata: { ...(record.metadata || {}), storageId: id } as any };
    const updatedRecord: SavedRecord = {
      id,
      record,
      createdAt: previous?.createdAt || new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      title,
      cataloger,
      resourceType,
      coverImage,
      status: normalizeStatus(record.metadata?.status),
    };
    
    // Build safe Work and Instance nodes - spread FIRST, defaults LAST
    const safeWork = buildSafeNode(
      record.work,
      'bf:Work',
      `http://moon.local/work/${Date.now()}`
    );

    const safeInstance = buildSafeNode(
      record.instance,
      'bf:Instance',
      `http://moon.local/instance/${Date.now()}`
    );
    
    // Build JSON-LD document format
    const jsonldDocument = {
      '@context': 'http://id.loc.gov/ontologies/bibframe/',
      '@graph': [safeWork, safeInstance, ...extraGraphNodes(record)]
    };
    
    const response = await fetch(`${API_BASE}/records/save`, {
      method: 'POST',
      headers: moonHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id,
        document: jsonldDocument,
        title,
        metadata: { ...(record.metadata || {}), cataloger },
        status: updatedRecord.status,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update record: ${response.statusText}`);
    }

    const data = await response.json().catch(() => ({}));
    if (data?.status) updatedRecord.status = normalizeStatus(data.status);
    console.log(`✅ Updated record ${id} in Supabase (${updatedRecord.status})`);
    
    // Also update localStorage cache
    const records = getAllRecordsLocal();
    const index = records.findIndex((r) => r.id === id);
    
    if (index === -1) {
      records.push(updatedRecord);
    } else {
      records[index] = updatedRecord;
    }
    
    localStorage.setItem('bibframe_saved_records', JSON.stringify(records));
    return updatedRecord;
  } catch (error) {
    console.error('Error updating record in Supabase, falling back to localStorage:', error);
    // Fallback to localStorage
    const records = getAllRecordsLocal();
    const index = records.findIndex((r) => r.id === id);
    
    if (index === -1) return null;

    records[index] = {
      ...records[index],
      record,
      modifiedAt: new Date().toISOString(),
      title,
      cataloger,
      resourceType,
      coverImage,
    };

    localStorage.setItem('bibframe_saved_records', JSON.stringify(records));
    return records[index];
  }
}

export interface RecordSearchFilters {
  status?: string;
  cataloger?: string;
  language?: string;
  template?: string;
}

export interface RecordSearchResult {
  records: SavedRecord[];
  /** All matches, not just this page. */
  total: number;
  /** How many matches fall under each status, cataloger, language and template. */
  facets: Record<'status' | 'cataloger' | 'language' | 'template', Record<string, number>>;
}

/**
 * Searches records on the server: every word must match, however it is spelled (أ/إ/آ and ا, ة and ه,
 * diacritics and romanization marks all match), with filters and paging. Signed out, or with
 * `published`, only what the public catalogue shows.
 */
export async function searchRecords(
  query: string,
  options: RecordSearchFilters & { limit?: number; offset?: number; published?: boolean } = {},
): Promise<RecordSearchResult> {
  const params = new URLSearchParams({ q: query });
  for (const key of ['status', 'cataloger', 'language', 'template'] as const) {
    if (options[key]) params.set(key, options[key]!);
  }
  params.set('limit', String(options.limit ?? 50));
  params.set('offset', String(options.offset ?? 0));
  if (options.published) params.set('view', 'published');
  const response = await fetch(`${API_BASE}/records/search?${params}`, { headers: moonHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Search failed: ${response.statusText}`);
  const deletedIds = getDeletedRecordIds();
  return {
    records: (data.records || []).filter((r: any) => r && !deletedIds.has(r.id)).map(fromServerRecord),
    total: data.total ?? 0,
    facets: data.facets || { status: {}, cataloger: {}, language: {}, template: {} },
  };
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  user: string;
  action: 'create' | 'update' | 'delete' | 'view' | 'export' | 'import';
  recordId: string;
  recordTitle: string;
  details?: string;
}

export function logActivity(entry: Omit<ActivityLogItem, 'id' | 'timestamp'>): void {
  try {
    const raw = localStorage.getItem('moon_activity_log');
    const logs: ActivityLogItem[] = raw ? JSON.parse(raw) : [];
    logs.unshift({
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
      timestamp: new Date().toISOString(),
      ...entry,
    });
    localStorage.setItem('moon_activity_log', JSON.stringify(logs.slice(0, 500)));
  } catch (err) {
    console.error('Error logging activity:', err);
  }
}

export function getActivityLogs(): ActivityLogItem[] {
  try {
    const raw = localStorage.getItem('moon_activity_log');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Approve a pending record (Super Admin action)
 */
/** The Super Admin assigns a waiting record to a reviewer (or clears it with null); the reviewer is notified. */
export async function assignRecord(id: string, username: string | null): Promise<void> {
  const { ok, status, data } = await moonFetch(`/records/${encodeURIComponent(id)}/assign`, { body: { username } });
  if (!ok) throw new Error(data?.error || `Server returned ${status}`);
}

/** The Super Admin returns a record for changes; the cataloger is notified with the reason. */
export async function returnRecord(id: string, reason: string): Promise<void> {
  const { ok, status, data } = await moonFetch(`/records/${encodeURIComponent(id)}/reject`, { body: { reason } });
  if (!ok || !data?.success) {
    throw new Error(status === 403 ? 'Only the Super Admin can return records.' : data?.error || `Server returned ${status}`);
  }
}

export async function approveRecord(id: string, approverName: string = 'Super Admin'): Promise<SavedRecord | null> {
  // The server is the source of truth; it checks the Super Admin session.
  let approvedAt = new Date().toISOString();
  try {
    const { ok, status, data } = await moonFetch(`/records/${encodeURIComponent(id)}/approve`, { body: {} });
    if (!ok || !data?.success) {
      throw new Error(
        status === 403
          ? 'Only the Super Admin can approve records. If you are isaac, sign out and sign in again.'
          : status === 422 && Array.isArray(data?.missing)
            ? `It can't be published yet. Missing: ${data.missing.map((m: any) => m.en).join(', ')}`
            : data?.error || `Server returned ${status}`
      );
    }
    approvedAt = data.approvedAt || approvedAt;
    approverName = data.approvedBy || approverName;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Could not reach the Moon server. Please check your connection and try again.');
    }
    throw error;
  }

  const records = getAllRecordsLocal();
  const index = records.findIndex(r => r.id === id);
  if (index === -1) return null;

  records[index] = {
    ...records[index],
    status: 'complete',
    approvedBy: approverName,
    approvedAt,
    modifiedAt: approvedAt,
    record: {
      ...records[index].record,
      metadata: {
        ...records[index].record?.metadata,
        status: 'complete',
        approvedBy: approverName,
        approvedAt,
      } as any
    }
  };

  try {
    localStorage.setItem('bibframe_saved_records', JSON.stringify(records));
  } catch (e) {
    console.error('Error saving approved record to localStorage:', e);
  }

  // Also log audit activity
  logActivity({
    user: approverName,
    action: 'update',
    recordId: id,
    recordTitle: records[index].title,
    details: `Record approved by ${approverName} and published as Complete to catalog`,
  });

  return records[index];
}


