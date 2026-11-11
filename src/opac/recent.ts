// "Recently added": the books most lately added to the catalogue. By the day each was ADDED (its created date), not
// the day it was last saved, so editing or re-saving an old book does not make it look new. Sample books (made by
// "Add sample books") come after real ones, so a bulk import of samples does not push out the library's own books.

const added = (w: { createdAt?: string }) => Date.parse(w.createdAt || '') || 0;
// Sample books are marked in their record, and always have an id that starts with "sample-" (the public list does not carry the mark).
const isSample = (w: { id?: string; catalogingInterface?: string }) => w.catalogingInterface === 'Sample records' || /^sample-/.test(w.id || '');

type AddedFields = { id?: string; createdAt?: string; catalogingInterface?: string };

/** The order of "recently added": real books before samples, and the latest added first. */
export function addedOrder(a: AddedFields, b: AddedFields): number {
  return Number(isSample(a)) - Number(isSample(b)) || added(b) - added(a);
}

export function recentlyAdded<T extends AddedFields>(works: T[], count = 12): T[] {
  return [...works].sort(addedOrder).slice(0, count);
}

/** "7 Nov 2026" / "٧ نوفمبر ٢٠٢٦", or "" when the book has no usable date. */
export function addedOn(createdAt: string | undefined, lang: 'ar' | 'en'): string {
  const ms = Date.parse(createdAt || '');
  if (!ms) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Baghdad' }).format(ms);
}
