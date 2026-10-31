/**
 * BIBFRAME Hub Service
 * Implements BIBFRAME Primer Appendix A ("More about Hubs") and Marva Hubs:
 * - Hubs are collocation and aggregation resources (functional equivalent of MARC Title/NameTitle 1XX+$t/130/240/830)
 * - Authorized Access Point (bflc:aap) & Normalized AAP (bflc:aap-normalized)
 * - Hub Stub creation directly from Work
 * - Hub Expression linking
 */

export interface BibframeHub {
  id: string;
  uri: string;
  title: string;
  creator?: string;
  creatorUri?: string;
  keyOrOpus?: string;
  mediumOfPerformance?: string;
  language?: string;
  aap: string;
  aapNormalized: string;
  expressionOf?: string;
  originDate?: string;
  historyNote?: string;
  createdDate: string;
}

/**
 * Generate Authorized Access Point (bflc:aap) according to LC/PCC conventions:
 * Format: [Creator].[Title] [Medium] [Key/Opus] ([Language])
 */
export function generateHubAAP(data: {
  title: string;
  creator?: string;
  keyOrOpus?: string;
  mediumOfPerformance?: string;
  language?: string;
}): string {
  let aap = '';
  if (data.creator && data.creator.trim()) {
    aap += `${data.creator.trim().replace(/\.$/, '')}. `;
  }
  aap += data.title ? data.title.trim() : 'Untitled Hub';

  if (data.mediumOfPerformance && data.mediumOfPerformance.trim()) {
    aap += `, ${data.mediumOfPerformance.trim()}`;
  }
  if (data.keyOrOpus && data.keyOrOpus.trim()) {
    aap += `, ${data.keyOrOpus.trim()}`;
  }
  if (data.language && data.language.trim() && data.language.toLowerCase() !== 'eng' && data.language.toLowerCase() !== 'english') {
    aap += `. ${data.language.trim()}`;
  }

  return aap;
}

/**
 * Generate normalized AAP (bflc:aap-normalized):
 * Lowercase, stripped punctuation, single spaces
 */
export function normalizeAAP(aap: string): string {
  if (!aap) return '';
  return aap
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents for normalization
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create a Quick Hub "Stub" directly from cataloging (Marva Feb 2025 workflow)
 */
export function createQuickHubStub(options: {
  title: string;
  creator?: string;
  creatorUri?: string;
  keyOrOpus?: string;
  language?: string;
}): BibframeHub {
  const hubId = `hub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const uri = `${BASE_URI}/hub/${hubId}`; // local stub until matched to an LC Hub
  const aap = generateHubAAP(options);
  const aapNormalized = normalizeAAP(aap);

  return {
    id: hubId,
    uri,
    title: options.title,
    creator: options.creator,
    creatorUri: options.creatorUri,
    keyOrOpus: options.keyOrOpus,
    language: options.language,
    aap,
    aapNormalized,
    createdDate: new Date().toISOString()
  };
}

/**
 * Preset sample LC Hubs for quick testing and collocation
 */
export const SAMPLE_LC_HUBS: BibframeHub[] = [
  {
    id: '4978c720-ca4f-ca86-2d7e-a15f8245ade9',
    uri: 'http://id.loc.gov/resources/hubs/4978c720-ca4f-ca86-2d7e-a15f8245ade9',
    title: 'Hamlet',
    creator: 'Shakespeare, William, 1564-1616',
    creatorUri: 'http://id.loc.gov/rwo/agents/n78095332',
    aap: 'Shakespeare, William, 1564-1616. Hamlet',
    aapNormalized: 'shakespeare william 1564 1616 hamlet',
    createdDate: '2025-01-10T10:00:00Z'
  },
  {
    id: 'ca6d97b4-923a-b178-6723-d55a4eb236a7',
    uri: 'http://id.loc.gov/resources/hubs/ca6d97b4-923a-b178-6723-d55a4eb236a7',
    title: 'Symphonies, no. 9, op. 95, E minor',
    creator: 'Dvořák, Antonín, 1841-1904',
    creatorUri: 'http://id.loc.gov/rwo/agents/n80070338',
    keyOrOpus: 'op. 95, E minor',
    mediumOfPerformance: 'orchestra',
    aap: 'Dvořák, Antonín, 1841-1904. Symphonies, no. 9, op. 95, E minor',
    aapNormalized: 'dvorak antonin 1841 1904 symphonies no 9 op 95 e minor',
    createdDate: '2025-01-12T14:30:00Z'
  },
  {
    id: 'e28014a9-835b-432a-bc91-23395982e411',
    uri: 'http://id.loc.gov/resources/hubs/e28014a9-835b-432a-bc91-23395982e411',
    title: 'Alf laylah wa-laylah',
    creator: '',
    language: 'Arabic',
    aap: 'Arabian nights. Arabic',
    aapNormalized: 'arabian nights arabic',
    createdDate: '2025-02-01T09:15:00Z'
  },
  {
    id: 'f91b72a0-410a-428a-8291-766184910243',
    uri: 'http://id.loc.gov/resources/hubs/f91b72a0-410a-428a-8291-766184910243',
    title: 'Iliad',
    creator: 'Homer',
    creatorUri: 'http://id.loc.gov/rwo/agents/n78095639',
    language: 'Greek',
    aap: 'Homer. Iliad. Greek',
    aapNormalized: 'homer iliad greek',
    createdDate: '2025-02-14T11:20:00Z'
  }
];
