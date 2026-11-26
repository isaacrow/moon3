/**
 * A published record as the catalogue page reads it: the server's JSON-LD @graph turned into the app's work/instance
 * form (Work, Instance, Item, copies, Expression, AdminMetadata), with its title, dates and status. Moved here from
 * src/app/utils/recordStorageBackend.ts unchanged, so the server's catalogue results read each record exactly as the
 * page does (plan B3).
 */
export type RecordStatus = 'complete' | 'pending-review' | 'needs-review';

export function normalizeStatus(value: unknown): RecordStatus {
  return value === 'pending-review' || value === 'needs-review' ? value : 'complete';
}

/**
 * CRITICAL: Build safe node with guaranteed @type and @id
 * Spread happens FIRST, defaults happen LAST
 * This ensures @type can NEVER disappear
 */
export function buildSafeNode(node: any, defaultType: string, defaultId: string) {
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
export function extractNodesFromGraph(graph: any[]) {
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

export const hasTypeEnding = (node: any, suffix: string) =>
  ([] as any[]).concat(node?.['@type'] || []).some((t) => typeof t === 'string' && t.endsWith(suffix));

/** Item, Expression and AdminMetadata travel in the stored @graph after Work and Instance. */
export function extraGraphNodes(record: any): any[] {
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
export function extractExtraNodes(graph: any[], metadata: any, work: any, instance: any) {
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

/** One record as the server lists it (JSON-LD @graph), in the app's work/instance form. */
export function fromServerRecord(serverRecord: any) {
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
  const convertedRecord: any = {
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
 * The published records as GET /records lists them to the catalogue page: the fields it carries, newest saved first.
 * The server's catalogue results start from this same list, so their order and fields are the page's.
 */
export function catalogueList(records: any[]): any[] {
  const list = records.map((record) => ({
    id: record.id,
    title: record.title || 'Untitled',
    document: record.document,
    metadata: record.metadata,
    status: record.status,
    cataloger: record.cataloger,
    approvedBy: record.approvedBy,
    approvedAt: record.approvedAt,
    createdAt: record.createdAt || record.saved,
    saved: record.saved,
    version: record.version,
    publishedVersion: record.publishedVersion,
    assignedTo: record.assignedTo,
    // The uploaded (or Open Library / Google Books) cover: the OPAC and the records list show it.
    coverUrl: record.coverUrl,
    nodeCount: record.document?.['@graph']?.length || 0,
  }));
  // Sort by saved date, newest first
  list.sort((a: any, b: any) => new Date(b.saved).getTime() - new Date(a.saved).getTime());
  return list;
}
