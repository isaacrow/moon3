/**
 * URI MINTING SERVICE
 * Generates stable, persistent URIs for all BIBFRAME entities
 * Following institutional best practices (LOC, national libraries)
 */

// Records are minted under a domain this institution controls. Never mint under
// id.loc.gov: only the Library of Congress may create URIs there.
// Override per deployment with VITE_MOON_URI_BASE (no trailing slash).
const env = (import.meta as any).env || {};
export const BASE_URI: string = (env.VITE_MOON_URI_BASE || 'https://mooon.site/resource').replace(/\/+$/, '');

export interface UriSet {
  work: string;
  expression: string;
  instance: string;
  item: string;
  admin: string;
}

/**
 * Generate a stable record ID from timestamp + random
 */
export function generateRecordId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `${timestamp}${random}`;
}

/**
 * Mint a complete set of URIs for a new record
 */
export function mintUriSet(recordId: string): UriSet {
  return {
    work: `${BASE_URI}/work/${recordId}`,
    expression: `${BASE_URI}/expression/${recordId}-1`,
    instance: `${BASE_URI}/instance/${recordId}`,
    item: `${BASE_URI}/item/${recordId}-1`,
    admin: `${BASE_URI}/admin/${recordId}`
  };
}

/**
 * Mint URI for specific entity type
 */
export function mintUri(entityType: 'work' | 'expression' | 'instance' | 'item' | 'admin' | 'agent' | 'provision', recordId: string, suffix?: string): string {
  const base = `${BASE_URI}/${entityType}/${recordId}`;
  return suffix ? `${base}-${suffix}` : base;
}

/**
 * Generate URI for agent (person/organization) from name
 * Uses hash for consistency
 */
export function mintAgentUri(name: string): string {
  const hash = simpleHash(name);
  return `${BASE_URI}/agent/${hash}`;
}

/**
 * Generate URI for contribution node
 */
export function mintContributionUri(recordId: string, index: number): string {
  return `${BASE_URI}/contribution/${recordId}-${index}`;
}

/**
 * Generate URI for provision activity
 */
export function mintProvisionUri(recordId: string): string {
  return `${BASE_URI}/provision/${recordId}`;
}

/**
 * Generate URI for identifier (ISBN, ISSN, etc.)
 */
export function mintIdentifierUri(recordId: string, type: string, index: number): string {
  return `${BASE_URI}/identifier/${recordId}-${type.toLowerCase()}-${index}`;
}

/**
 * Generate URI for title node
 */
export function mintTitleUri(recordId: string, type: 'work' | 'instance' = 'work'): string {
  return `${BASE_URI}/title/${recordId}-${type}`;
}

/**
 * Extract record ID from URI
 */
export function extractRecordId(uri: string): string | null {
  const match = uri.match(/\/([^\/]+)$/);
  if (!match) return null;
  
  // Remove suffix if exists
  const id = match[1];
  const parts = id.split('-');
  return parts[0];
}

/**
 * Check if URI is from MOON library
 */
export function isMoonUri(uri: string): boolean {
  return uri.startsWith(BASE_URI);
}

/**
 * Check if URI is external authority (LOC, VIAF, Wikidata)
 */
export function isExternalAuthority(uri: string): boolean {
  return uri.includes('id.loc.gov') || 
         uri.includes('viaf.org') || 
         uri.includes('wikidata.org');
}

/**
 * Simple hash function for generating consistent IDs
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Validate URI format
 */
export function isValidUri(uri: string): boolean {
  try {
    new URL(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get entity type from URI
 */
export function getEntityType(uri: string): string | null {
  const match = uri.match(/\/resource\/([^\/]+)\//);
  return match ? match[1] : null;
}
