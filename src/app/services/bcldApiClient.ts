/**
 * BCLD (Bibliographic / BIBFRAME Cloud Linked Data) API Client
 * Connects Moon Wolf to the BCLD FastAPI Platform (https://dev.bcld.info/api/docs)
 * Provides federated search, retrieval of Works, Instances, Hubs, and LSP export.
 */

export interface BcldSearchResult {
  id: number;
  type: 'works' | 'instances' | 'hubs';
  uri: string;
  uuid: string;
  created_at?: string;
  updated_at?: string;
  data: any;
}

export interface BcldSearchResponse {
  results: BcldSearchResult[];
  total: number;
  links: {
    first?: string;
    next?: string;
  };
}

export const BCLD_BASE_URL = typeof window !== 'undefined' ? '/bcld-api' : 'https://dev.bcld.info/api';

export class BcldApiClient {
  private baseUrl: string;

  constructor(baseUrl = BCLD_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Fetch official BCLD /context.jsonld
   */
  async getContextJsonLd(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/context.jsonld`, {
      method: 'GET',
      headers: { 'Accept': 'application/ld+json, application/json' },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch BCLD context.jsonld: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Health check
   */
  async getHealth(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`BCLD health check failed: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Convert MARCXML or binary MARC to BIBFRAME 2.0 via BCLD FastAPI
   */
  async convertMarcToBibframe(marcXmlOrRaw: string, format: 'application/xml' | 'text/xml' = 'application/xml'): Promise<any> {
    const response = await fetch(`${this.baseUrl}/marc2bibframe`, {
      method: 'POST',
      headers: {
        'Content-Type': format,
        'Accept': 'application/ld+json',
      },
      body: marcXmlOrRaw,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`BCLD marc2bibframe failed (${response.status}): ${err}`);
    }

    return response.json();
  }

  /**
   * Search BCLD for Works, Instances, and Hubs
   */
  async search(query: string, type: 'all' | 'works' | 'instances' | 'hubs' = 'all', limit = 20, offset = 0): Promise<BcldSearchResponse> {
    const params = new URLSearchParams({
      q: query,
      type,
      limit: String(limit),
      offset: String(offset),
    });

    const response = await fetch(`${this.baseUrl}/search/?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`BCLD search failed (${response.status}): ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Read single Work by UUID
   */
  async getWork(uuid: string, expand = true): Promise<any> {
    const response = await fetch(`${this.baseUrl}/works/${uuid}?expand=${expand}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Work ${uuid}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Read single Instance by UUID
   */
  async getInstance(uuid: string, expand = true): Promise<any> {
    const response = await fetch(`${this.baseUrl}/instances/${uuid}?expand=${expand}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Instance ${uuid}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Read single Hub by UUID
   */
  async getHub(uuid: string, expand = false): Promise<any> {
    const response = await fetch(`${this.baseUrl}/hubs/${uuid}?expand=${expand}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Hub ${uuid}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Export to Library Services Platform (LSP e.g. FOLIO)
   */
  async exportToLsp(instanceUri: string, localId?: string): Promise<any> {
    const payload: any = { instance_uri: instanceUri };
    if (localId) payload.local_id = localId;

    const response = await fetch(`${this.baseUrl}/export/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Export to LSP failed (${response.status}): ${err}`);
    }

    return response.json();
  }

  /**
   * Convert a BCLD record into Moon Wolf's internal BIBFRAME Work + Instance representation
   */
  bcldRecordToBibframe(record: BcldSearchResult): { work: any; instance: any } {
    const data = record.data || {};
    const titleObj = Array.isArray(data.title) ? data.title[0] : data.title;
    const mainTitle = typeof titleObj === 'object' 
      ? (Array.isArray(titleObj.mainTitle) ? titleObj.mainTitle[0] : titleObj.mainTitle) 
      : data['rdfs:label']?.[0] || 'BCLD Record';

    const normalizedTitle = typeof mainTitle === 'object' && mainTitle?.['@value'] ? mainTitle['@value'] : String(mainTitle || '');

    if (record.type === 'works' || data['@type']?.includes?.('Work')) {
      const work = {
        '@type': 'bf:Work',
        '@id': record.uri || `${BASE_URI}/work/bcld-${record.uuid}`,
        'bf:title': {
          '@type': 'bf:Title',
          'bf:mainTitle': normalizedTitle,
        },
        'bf:contribution': Array.isArray(data.contribution) ? data.contribution.map((c: any) => ({
          '@type': 'bf:Contribution',
          'bf:agent': {
            '@type': 'bf:Agent',
            'rdfs:label': c.agent?.[0]?.['rdfs:label']?.[0] || c.agent?.[0]?.['@id'] || 'Author',
            '@id': c.agent?.[0]?.['@id'] || undefined,
          },
          'bf:role': {
            '@type': 'bf:Role',
            'rdfs:label': 'Author',
          }
        })) : [],
        'bf:subject': Array.isArray(data.subject) ? data.subject.map((s: any) => ({
          '@type': 'bf:Topic',
          'rdfs:label': s['rdfs:label']?.[0] || s['@id'] || 'Subject',
          '@id': s['@id'] || undefined,
        })) : [],
      };

      const instance = {
        '@type': 'bf:Instance',
        '@id': data.hasInstance?.[0] || `${BASE_URI}/instance/bcld-${record.uuid}`,
        'bf:instanceOf': { '@id': work['@id'] },
        'bf:title': {
          '@type': 'bf:Title',
          'bf:mainTitle': normalizedTitle,
        },
        'bf:provisionActivity': [{
          '@type': 'bf:Publication',
          'bf:agent': { '@type': 'bf:Agent', 'rdfs:label': 'BCLD Linked Data Repository' },
        }],
      };

      return { work, instance };
    }

    // Default instance conversion
    const instance = {
      '@type': 'bf:Instance',
      '@id': record.uri || `${BASE_URI}/instance/bcld-${record.uuid}`,
      'bf:title': {
        '@type': 'bf:Title',
        'bf:mainTitle': normalizedTitle,
      },
    };

    const work = {
      '@type': 'bf:Work',
      '@id': `${BASE_URI}/work/bcld-${record.uuid}`,
      'bf:title': {
        '@type': 'bf:Title',
        'bf:mainTitle': normalizedTitle,
      },
    };

    return { work, instance };
  }
}
