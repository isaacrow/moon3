// When two published records are the SAME book, so the catalogue lists it once.
//
// The old rule was "same title", which hid different books that happen to share a title (two editions of
// "Palace Walk" with different ISBNs, two different books called "Baghdad"). Two records are the same only when they
// have the same id, or the same title, author, year AND the same ISBNs (none counts as the same). The catalogue
// already folds editions of one work together in the results, so showing both is right.

interface RecordLike {
  id?: string;
  title?: string;
  originDate?: string;
  primaryCreator?: { name?: string; nameArabic?: string; nameEnglish?: string };
  instances?: Array<{ isbn?: string; publicationYear?: string }>;
}

const squash = (s: unknown) => (typeof s === 'string' ? s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') : '');
const isbns = (r: RecordLike) => [...new Set((r.instances || []).map(i => squash(i.isbn)).filter(Boolean))].sort().join(',');
const creator = (r: RecordLike) => squash(r.primaryCreator?.nameEnglish || r.primaryCreator?.name || r.primaryCreator?.nameArabic);
const year = (r: RecordLike) => squash(r.originDate || r.instances?.[0]?.publicationYear);

export function isSameRecord(a: RecordLike, b: RecordLike): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  return squash(a.title) !== '' && squash(a.title) === squash(b.title) && creator(a) === creator(b) && year(a) === year(b) && isbns(a) === isbns(b);
}
