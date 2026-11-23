// Types for manuscriptMarc.js (Al-Qamar's MARC 21 / RDA builder).

export interface MarcSubfield { code: string; value: string }
export interface MarcField {
  tag: string;
  /** Control fields (000–009). */
  value?: string;
  /** Data fields: two characters, "\" for blank. */
  indicators?: string;
  subfields?: MarcSubfield[];
}

/** A manuscript as Al-Qamar keeps it: its source fields keyed by their Arabic names (العنوان، المؤلف …). */
export interface ManuscriptSource {
  id: string;
  viewUrl?: string | null;
  source_fields: Record<string, string>;
}

export function buildMarcRecord(record: ManuscriptSource, options?: { timestamp?: string }): MarcField[];
/** Structural problems (in Arabic); empty when the record is valid. */
export function validateMarc(marc: MarcField[]): string[];
/** MARC text (.mrk), as MarcEdit reads it. */
export function toMrk(marc: MarcField[]): string;
/** ISO 2709 (.mrc), UTF-8. */
export function toIso2709(marc: MarcField[]): Uint8Array;
/** Folds Arabic spellings (alef forms, ى/ي, ة/ه …) for comparing text. */
export function normalizeArabic(str: unknown): string;
