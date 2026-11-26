/**
 * Number sequences (plan step H6, after FOLIO's number generators): a library's barcodes, borrower cards and copies'
 * accession numbers can come
 * from a sequence it sets: a prefix, the next number and a width ("B" + 000123). The database hands numbers out
 * (moon_take_numbers), so two desks never get the same one; this file checks a sequence and shows what comes next.
 */
export const SEQUENCE_KINDS = ["barcode", "card", "accession"] as const;
export type SequenceKind = typeof SEQUENCE_KINDS[number];
export interface Sequence { kind: SequenceKind; prefix: string; next: number; width: number }

/** A number as the sequence writes it: the prefix, then the number padded to the width. */
export function formatNumber(prefix: string, n: number, width: number): string {
  return prefix + String(n).padStart(width, "0");
}

/** A sequence as sent from Studio, checked: the numbers it makes must still be valid barcodes and card numbers. */
export function readSequence(kind: string, raw: any): { sequence: Sequence } | { error: string } {
  if (!(SEQUENCE_KINDS as readonly string[]).includes(kind)) return { error: "Barcodes, borrower cards or accession numbers?" };
  const prefix = String(raw?.prefix ?? "").trim();
  if (!/^[A-Za-z0-9._-]{0,12}$/.test(prefix)) return { error: "The prefix: up to 12 letters, digits, dot, dash or underscore" };
  const next = Number(raw?.next);
  if (!Number.isInteger(next) || next < 1 || next > 1e12) return { error: "The next number: a whole number from 1" };
  const width = raw?.width === undefined || raw?.width === "" ? 0 : Number(raw.width);
  if (!Number.isInteger(width) || width < 0 || width > 12) return { error: "The width: 0 to 12 digits" };
  if (formatNumber(prefix, next, width).length > 40) return { error: "The numbers would be longer than 40 characters" };
  return { sequence: { kind: kind as SequenceKind, prefix, next, width } };
}
