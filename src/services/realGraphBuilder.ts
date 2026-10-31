import { BASE_URI } from './uriMintingService';
/**
 * REAL BIBFRAME GRAPH BUILDER
 * Entity-based graph construction following institutional standards
 * Compatible with LOC, national libraries, triple stores
 */

import { 
  mintUriSet, 
  mintContributionUri, 
  mintProvisionUri, 
  mintIdentifierUri, 
  mintTitleUri,
  mintAgentUri,
  generateRecordId
} from './uriMintingService';

export interface BibframeEntity {
  '@id': string;
  '@type': string;
  [key: string]: any;
}

export interface GraphBuilderInput {
  recordId?: string;
  enableExpression?: boolean;
  workData: Record<string, any>;
  expressionData?: Record<string, any>;
  instanceData: Record<string, any>;
  itemData: Record<string, any>;
  adminMetadata?: Record<string, any>;
  relationships?: any[];
}

export interface GraphBuilderOutput {
  recordId: string;
  '@context': any;
  '@graph': BibframeEntity[];
  uris: {
    work: string;
    expression?: string;
    instance: string;
    item: string;
    admin: string;
  };
}

/**
 * Main graph builder - constructs institutional-grade BIBFRAME
 */
export function buildRealBibframeGraph(input: GraphBuilderInput): GraphBuilderOutput {
  // Step 1: Mint URIs
  const recordId = input.recordId || generateRecordId();
  const uris = mintUriSet(recordId);

  // Step 2: Build entities
  const graph: BibframeEntity[] = [];

  // Build Work
  const work = buildWorkEntity(uris.work, input.workData, recordId);
  graph.push(work);

  // Build Expression (optional)
  let expressionUri: string | undefined;
  if (input.enableExpression && input.expressionData) {
    const expression = buildExpressionEntity(uris.expression, uris.work, input.expressionData, recordId);
    graph.push(expression);
    expressionUri = uris.expression;
  }

  // Build Instance
  const instance = buildInstanceEntity(
    uris.instance, 
    expressionUri || uris.work,
    input.instanceData, 
    recordId
  );
  graph.push(instance);

  // Build ProvisionActivity if data exists
  if (input.instanceData['bf:provisionActivity']) {
    const provision = buildProvisionActivity(
      mintProvisionUri(recordId),
      input.instanceData['bf:provisionActivity']
    );
    graph.push(provision);
    instance['bf:provisionActivity'] = { '@id': provision['@id'] };
  }

  // Build Item
  const item = buildItemEntity(uris.item, uris.instance, input.itemData, recordId);
  graph.push(item);

  // Build AdminMetadata
  const admin = buildAdminMetadata(uris.admin, input.adminMetadata);
  graph.push(admin);

  // Step 3: Link entities
  linkEntities(work, instance, item, expressionUri, uris);

  // Step 4: Add AdminMetadata reference to Work
  work['bf:adminMetadata'] = { '@id': uris.admin };

  // Step 5: Add relationships
  if (input.relationships && input.relationships.length > 0) {
    addRelationships(graph, input.relationships, uris.work);
  }

  // Step 6: Create context
  const context = createBibframeContext();

  return {
    recordId,
    '@context': context,
    '@graph': graph,
    uris: {
      work: uris.work,
      expression: expressionUri,
      instance: uris.instance,
      item: uris.item,
      admin: uris.admin
    }
  };
}

/**
 * Build Work entity
 */
function buildWorkEntity(uri: string, data: Record<string, any>, recordId: string): BibframeEntity {
  const work: BibframeEntity = {
    '@id': uri,
    '@type': 'bf:Work'
  };

  // Title (REQUIRED)
  if (data['bf:title']) {
    const titleUri = mintTitleUri(recordId, 'work');
    work['bf:title'] = {
      '@id': titleUri,
      '@type': 'bf:Title'
    };
    
    if (data['bf:title'].mainTitle) {
      work['bf:title']['bf:mainTitle'] = data['bf:title'].mainTitle;
    }
    if (data['bf:title'].subtitle) {
      work['bf:title']['bf:subtitle'] = data['bf:title'].subtitle;
    }
  }

  // Contributions
  if (data['bf:contribution'] && Array.isArray(data['bf:contribution'])) {
    work['bf:contribution'] = data['bf:contribution']
      .filter(c => c.agent)
      .map((c, idx) => {
        const contribUri = mintContributionUri(recordId, idx);
        
        // Determine agent URI
        let agentUri: string;
        if (c.agent.uri) {
          agentUri = c.agent.uri;
        } else if (c.agent.label) {
          agentUri = mintAgentUri(c.agent.label);
        } else {
          agentUri = mintAgentUri(`agent-${idx}`);
        }

        return {
          '@id': contribUri,
          '@type': 'bf:Contribution',
          'bf:agent': { 
            '@id': agentUri
          },
          'bf:role': { 
            '@id': `http://id.loc.gov/vocabulary/relators/${c.role || 'ctb'}` 
          }
        };
      });
  }

  // Language
  if (data['bf:language']) {
    if (typeof data['bf:language'] === 'object' && data['bf:language'].uri) {
      work['bf:language'] = { '@id': data['bf:language'].uri };
    } else if (typeof data['bf:language'] === 'string') {
      work['bf:language'] = { '@id': data['bf:language'] };
    }
  }

  // Subject (authority URIs)
  if (data['bf:subject'] && Array.isArray(data['bf:subject'])) {
    work['bf:subject'] = data['bf:subject']
      .filter(s => s.uri || s['@id'])
      .map(s => ({ '@id': s.uri || s['@id'] }));
  }

  // Classification
  if (data['bf:classification']) {
    work['bf:classification'] = {
      '@type': 'bf:Classification',
      'bf:classificationPortion': data['bf:classification'].number || data['bf:classification'],
      'bf:source': { 
        '@id': data['bf:classification'].scheme || 'http://id.loc.gov/authorities/classification' 
      }
    };
  }

  // Genre/Form
  if (data['bf:genreForm']) {
    if (Array.isArray(data['bf:genreForm'])) {
      work['bf:genreForm'] = data['bf:genreForm'].map(g => 
        typeof g === 'object' && g.uri ? { '@id': g.uri } : { '@id': g }
      );
    } else if (typeof data['bf:genreForm'] === 'object' && data['bf:genreForm'].uri) {
      work['bf:genreForm'] = { '@id': data['bf:genreForm'].uri };
    }
  }

  // Content
  if (data['bf:content']) {
    if (typeof data['bf:content'] === 'object' && data['bf:content'].uri) {
      work['bf:content'] = { '@id': data['bf:content'].uri };
    }
  }

  // Summary
  if (data['bf:summary']) {
    work['bf:summary'] = {
      '@type': 'bf:Summary',
      'rdfs:label': data['bf:summary']
    };
  }

  // Table of Contents
  if (data['bf:tableOfContents']) {
    work['bf:tableOfContents'] = {
      '@type': 'bf:TableOfContents',
      'rdfs:label': data['bf:tableOfContents']
    };
  }

  // Origin Date
  if (data['bf:originDate']) {
    work['bf:originDate'] = data['bf:originDate'];
  }

  // Intended Audience
  if (data['bf:intendedAudience']) {
    if (typeof data['bf:intendedAudience'] === 'object' && data['bf:intendedAudience'].uri) {
      work['bf:intendedAudience'] = { '@id': data['bf:intendedAudience'].uri };
    } else {
      work['bf:intendedAudience'] = {
        '@type': 'bf:IntendedAudience',
        'rdfs:label': data['bf:intendedAudience']
      };
    }
  }

  return work;
}

/**
 * Build Expression entity
 */
function buildExpressionEntity(uri: string, workUri: string, data: Record<string, any>, recordId: string): BibframeEntity {
  const expression: BibframeEntity = {
    '@id': uri,
    '@type': 'bf:Expression',
    'bf:expressionOf': { '@id': workUri }
  };

  // Language
  if (data['bf:language']) {
    if (typeof data['bf:language'] === 'object' && data['bf:language'].uri) {
      expression['bf:language'] = { '@id': data['bf:language'].uri };
    }
  }

  // Translation of
  if (data['bf:translationOf']) {
    expression['bf:translationOf'] = { '@id': data['bf:translationOf'] };
  }

  // Contributions (translators, editors, etc.)
  if (data['bf:contribution'] && Array.isArray(data['bf:contribution'])) {
    expression['bf:contribution'] = data['bf:contribution']
      .filter(c => c.agent)
      .map((c, idx) => {
        const contribUri = `${uri}/contribution-${idx}`;
        const agentUri = c.agent.uri || mintAgentUri(c.agent.label || `agent-${idx}`);

        return {
          '@id': contribUri,
          '@type': 'bf:Contribution',
          'bf:agent': { '@id': agentUri },
          'bf:role': { '@id': `http://id.loc.gov/vocabulary/relators/${c.role || 'ctb'}` }
        };
      });
  }

  return expression;
}

/**
 * Build Instance entity
 */
function buildInstanceEntity(uri: string, workOrExpressionUri: string, data: Record<string, any>, recordId: string): BibframeEntity {
  const instance: BibframeEntity = {
    '@id': uri,
    '@type': 'bf:Instance',
    'bf:instanceOf': { '@id': workOrExpressionUri }
  };

  // Title
  if (data['bf:title']) {
    const titleUri = mintTitleUri(recordId, 'instance');
    instance['bf:title'] = {
      '@id': titleUri,
      '@type': 'bf:Title'
    };
    
    if (data['bf:title'].mainTitle) {
      instance['bf:title']['bf:mainTitle'] = data['bf:title'].mainTitle;
    }
    if (data['bf:title'].subtitle) {
      instance['bf:title']['bf:subtitle'] = data['bf:title'].subtitle;
    }
  }

  // Edition Statement
  if (data['bf:editionStatement']) {
    instance['bf:editionStatement'] = data['bf:editionStatement'];
  }

  // Responsibility Statement
  if (data['bf:responsibilityStatement']) {
    instance['bf:responsibilityStatement'] = data['bf:responsibilityStatement'];
  }

  // Identifiers (ISBN, ISSN, etc.)
  if (data['bf:identifiedBy'] && Array.isArray(data['bf:identifiedBy'])) {
    instance['bf:identifiedBy'] = data['bf:identifiedBy']
      .filter(id => id.value)
      .map((id, idx) => {
        const idUri = mintIdentifierUri(recordId, id.type || 'Identifier', idx);
        return {
          '@id': idUri,
          '@type': `bf:${id.type || 'Identifier'}`,
          'rdf:value': id.value
        };
      });
  }

  // Carrier
  if (data['bf:carrier']) {
    if (typeof data['bf:carrier'] === 'object' && data['bf:carrier'].uri) {
      instance['bf:carrier'] = { '@id': data['bf:carrier'].uri };
    }
  }

  // Media
  if (data['bf:media']) {
    if (typeof data['bf:media'] === 'object' && data['bf:media'].uri) {
      instance['bf:media'] = { '@id': data['bf:media'].uri };
    }
  }

  // Extent
  if (data['bf:extent']) {
    instance['bf:extent'] = {
      '@type': 'bf:Extent',
      'rdfs:label': data['bf:extent']
    };
  }

  // Dimensions
  if (data['bf:dimensions']) {
    instance['bf:dimensions'] = data['bf:dimensions'];
  }

  // Series
  if (data['bf:seriesStatement']) {
    instance['bf:seriesStatement'] = data['bf:seriesStatement'];
  }

  // Copyright Date
  if (data['bf:copyrightDate']) {
    instance['bf:copyrightDate'] = data['bf:copyrightDate'];
  }

  // Frequency (for serials)
  if (data['bf:frequency']) {
    if (typeof data['bf:frequency'] === 'object' && data['bf:frequency'].uri) {
      instance['bf:frequency'] = { '@id': data['bf:frequency'].uri };
    }
  }

  return instance;
}

/**
 * Build ProvisionActivity (Publication) node - REQUIRED for institutional BIBFRAME
 */
function buildProvisionActivity(uri: string, data: any): BibframeEntity {
  const provision: BibframeEntity = {
    '@id': uri,
    '@type': 'bf:Publication'
  };

  // Agent (Publisher)
  if (data.publisher) {
    if (typeof data.publisher === 'object' && data.publisher.uri) {
      provision['bf:agent'] = { '@id': data.publisher.uri };
    } else if (typeof data.publisher === 'object' && data.publisher.label) {
      provision['bf:agent'] = {
        '@type': 'bf:Agent',
        'rdfs:label': data.publisher.label
      };
    } else if (typeof data.publisher === 'string') {
      provision['bf:agent'] = {
        '@type': 'bf:Agent',
        'rdfs:label': data.publisher
      };
    }
  }

  // Place
  if (data.place) {
    if (typeof data.place === 'object' && data.place.uri) {
      provision['bf:place'] = { '@id': data.place.uri };
    } else if (typeof data.place === 'string') {
      provision['bf:place'] = { '@id': data.place };
    }
  } else {
    // Default place if missing
    provision['bf:place'] = { '@id': 'http://id.loc.gov/vocabulary/countries/xxu' };
  }

  // Date
  if (data.date) {
    provision['bf:date'] = data.date;
  } else {
    provision['bf:date'] = new Date().getFullYear().toString();
  }

  return provision;
}

/**
 * Build Item entity
 */
function buildItemEntity(uri: string, instanceUri: string, data: Record<string, any>, recordId: string): BibframeEntity {
  const item: BibframeEntity = {
    '@id': uri,
    '@type': 'bf:Item',
    'bf:itemOf': { '@id': instanceUri }
  };

  // Held By (institution)
  if (data['bf:heldBy']) {
    if (typeof data['bf:heldBy'] === 'object' && data['bf:heldBy'].uri) {
      item['bf:heldBy'] = { '@id': data['bf:heldBy'].uri };
    }
  }

  // Shelf Mark (call number)
  if (data['bf:shelfMark']) {
    item['bf:shelfMark'] = {
      '@type': 'bf:ShelfMark',
      'rdfs:label': data['bf:shelfMark']
    };
  }

  // Sub Location
  if (data['bf:subLocation']) {
    item['bf:subLocation'] = {
      '@type': 'bf:SubLocation',
      'rdfs:label': data['bf:subLocation']
    };
  }

  // Electronic Locator
  if (data['bf:electronicLocator']) {
    item['bf:electronicLocator'] = {
      '@id': data['bf:electronicLocator']
    };
  }

  // Status
  if (data['bf:status']) {
    if (typeof data['bf:status'] === 'object' && data['bf:status'].uri) {
      item['bf:status'] = { '@id': data['bf:status'].uri };
    }
  }

  return item;
}

/**
 * Build AdminMetadata - REQUIRED for institutional records
 */
function buildAdminMetadata(uri: string, data?: Record<string, any>): BibframeEntity {
  const admin: BibframeEntity = {
    '@id': uri,
    '@type': 'bf:AdminMetadata'
  };

  // Creation Date (REQUIRED)
  admin['bf:creationDate'] = data?.['bf:creationDate'] || new Date().toISOString();

  // Change Date (REQUIRED)
  admin['bf:changeDate'] = data?.['bf:changeDate'] || new Date().toISOString();

  // Source (cataloging institution)
  if (data?.['bf:source']) {
    admin['bf:source'] = { '@id': data['bf:source'] };
  } else {
    admin['bf:source'] = { 
      '@id': `${BASE_URI}/organization/moon`,
      'rdfs:label': 'MOON Library System'
    };
  }

  // Description Conventions (RDA, AACR2, etc.)
  if (data?.['bf:descriptionConventions']) {
    admin['bf:descriptionConventions'] = { 
      '@id': `http://id.loc.gov/vocabulary/descriptionConventions/${data['bf:descriptionConventions'].toLowerCase()}`
    };
  } else {
    admin['bf:descriptionConventions'] = { 
      '@id': 'http://id.loc.gov/vocabulary/descriptionConventions/rda'
    };
  }

  // Description Language
  if (data?.['bf:descriptionLanguage']) {
    admin['bf:descriptionLanguage'] = { '@id': data['bf:descriptionLanguage'] };
  } else {
    admin['bf:descriptionLanguage'] = { '@id': 'http://id.loc.gov/vocabulary/languages/eng' };
  }

  return admin;
}

/**
 * Link entities together
 */
function linkEntities(
  work: BibframeEntity, 
  instance: BibframeEntity, 
  item: BibframeEntity,
  expressionUri: string | undefined,
  uris: any
) {
  // Work → Instance or Work → Expression
  if (expressionUri) {
    work['bf:hasExpression'] = { '@id': expressionUri };
  } else {
    work['bf:hasInstance'] = { '@id': uris.instance };
  }

  // Instance → Item
  instance['bf:hasItem'] = { '@id': uris.item };
}

/**
 * Add relationships to graph
 */
function addRelationships(graph: BibframeEntity[], relationships: any[], workUri: string) {
  relationships.forEach(rel => {
    if (!rel.targetUri || !rel.type) return;

    // Find the source entity in graph
    const sourceEntity = graph.find(e => e['@id'] === (rel.sourceUri || workUri));
    if (!sourceEntity) return;

    // Add relationship property
    const relProp = `bf:${rel.type}`;
    
    if (!sourceEntity[relProp]) {
      sourceEntity[relProp] = [];
    }

    const relValue: any = { '@id': rel.targetUri };
    
    if (rel.label) {
      relValue['rdfs:label'] = rel.label;
    }

    if (Array.isArray(sourceEntity[relProp])) {
      sourceEntity[relProp].push(relValue);
    } else {
      sourceEntity[relProp] = [sourceEntity[relProp], relValue];
    }
  });
}

/**
 * Create BIBFRAME JSON-LD context
 */
function createBibframeContext() {
  return {
    'bf': 'http://id.loc.gov/ontologies/bibframe/',
    'bflc': 'http://id.loc.gov/ontologies/bflc/',
    'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
    'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'xsd': 'http://www.w3.org/2001/XMLSchema#',
    'schema': 'http://schema.org/',
    'dcterms': 'http://purl.org/dc/terms/'
  };
}
