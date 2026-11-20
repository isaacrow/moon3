/**
 * The kinds of material a cataloguer chooses before a new record starts (Technical services > New record):
 * book, journal, map, manuscript, postage stamp and picture, and the rare group, each in print or electronic.
 * A choice picks the editor template and pre-fills the Work's content type and the Instance's media and
 * carrier, so the MARC view is right from the start (the Leader follows the content type, 008/23 the
 * carrier). The choice is kept on the record (metadata.materialType, metadata.carrierKind, metadata.rare).
 */

export type MaterialId =
  | 'book' | 'journal' | 'map' | 'manuscript' | 'stamp' | 'picture'
  | 'rare-book' | 'rare-journal' | 'rare-map' | 'rare-picture';
export type CarrierKind = 'print' | 'electronic';

type Term = { '@id': string; 'rdfs:label': string };
const vocab = (path: string, label: string): Term => ({ '@id': `http://id.loc.gov/vocabulary/${path}`, 'rdfs:label': label });

export interface Material {
  id: MaterialId;
  ar: string;
  en: string;
  arNote: string;
  enNote: string;
  /** Editor template (templateEngine.ts). */
  templateId: string;
  rare: boolean;
  /** Work content type (RDA / LC). */
  content: Term;
  /** Instance carrier when in print. */
  printCarrier: Term;
  /** Issuance (single unit or serial). */
  issuance: Term;
}

const TEXT = vocab('contentTypes/txt', 'text');
const CARTO = vocab('contentTypes/cri', 'cartographic image');
const STILL = vocab('contentTypes/sti', 'still image');
const VOLUME = vocab('carriers/nc', 'volume');
const SHEET = vocab('carriers/nb', 'sheet');
const CARD = vocab('carriers/no', 'card');
const MONO = vocab('issuance/mono', 'single unit');
const SERIAL = vocab('issuance/serl', 'serial');

export const UNMEDIATED = vocab('mediaTypes/n', 'unmediated');
export const COMPUTER = vocab('mediaTypes/c', 'computer');
export const ONLINE = vocab('carriers/cr', 'online resource');

export const MATERIALS: Material[] = [
  { id: 'book', ar: 'كتاب', en: 'Book', arNote: 'كتب ومطبوعات أحادية', enNote: 'Books and other single publications', templateId: 'monograph-complete', rare: false, content: TEXT, printCarrier: VOLUME, issuance: MONO },
  { id: 'journal', ar: 'دورية', en: 'Journal', arNote: 'مجلات وصحف وما يصدر على أجزاء متتابعة', enNote: 'Journals, newspapers and anything issued in parts', templateId: 'serial', rare: false, content: TEXT, printCarrier: VOLUME, issuance: SERIAL },
  { id: 'map', ar: 'خريطة', en: 'Map', arNote: 'خرائط وأطالس', enNote: 'Maps and atlases', templateId: 'map', rare: false, content: CARTO, printCarrier: SHEET, issuance: MONO },
  { id: 'manuscript', ar: 'مخطوط', en: 'Manuscript', arNote: 'نصوص مكتوبة باليد ونسخها', enNote: 'Handwritten texts and their copies', templateId: 'manuscript', rare: false, content: TEXT, printCarrier: VOLUME, issuance: MONO },
  { id: 'stamp', ar: 'طابع بريدي', en: 'Postage stamp', arNote: 'الطوابع البريدية ومجموعاتها', enNote: 'Postage stamps and stamp sets', templateId: 'still-image', rare: false, content: STILL, printCarrier: CARD, issuance: MONO },
  { id: 'picture', ar: 'صورة', en: 'Picture', arNote: 'صور فوتوغرافية ولوحات وملصقات', enNote: 'Photographs, prints and posters', templateId: 'still-image', rare: false, content: STILL, printCarrier: SHEET, issuance: MONO },
  { id: 'rare-book', ar: 'كتاب نادر', en: 'Rare book', arNote: 'مع المصدر والتجليد والحالة', enNote: 'With provenance, binding and condition', templateId: 'monograph-complete', rare: true, content: TEXT, printCarrier: VOLUME, issuance: MONO },
  { id: 'rare-journal', ar: 'دورية نادرة', en: 'Rare journal', arNote: 'أعداد قديمة أو نادرة', enNote: 'Old or scarce issues', templateId: 'serial', rare: true, content: TEXT, printCarrier: VOLUME, issuance: SERIAL },
  { id: 'rare-map', ar: 'خريطة نادرة', en: 'Rare map', arNote: 'خرائط تاريخية', enNote: 'Historical maps', templateId: 'map', rare: true, content: CARTO, printCarrier: SHEET, issuance: MONO },
  { id: 'rare-picture', ar: 'صورة نادرة', en: 'Rare picture', arNote: 'صور ووثائق مصورة نادرة', enNote: 'Rare photographs and prints', templateId: 'still-image', rare: true, content: STILL, printCarrier: SHEET, issuance: MONO },
];

export const materialById = (id: string | null | undefined): Material | undefined => MATERIALS.find((m) => m.id === id);

/** The pre-filled Work and Instance values for a material in print or electronic form. */
export function materialStart(m: Material, carrier: CarrierKind): { work: Record<string, Term>; instance: Record<string, Term> } {
  return {
    work: { 'bf:content': m.content },
    instance: carrier === 'electronic'
      ? { 'bf:media': COMPUTER, 'bf:carrier': ONLINE, 'bf:issuance': m.issuance }
      : { 'bf:media': UNMEDIATED, 'bf:carrier': m.printCarrier, 'bf:issuance': m.issuance },
  };
}

/** What a record keeps about the choice (its metadata). */
export function materialMetadata(m: Material, carrier: CarrierKind) {
  return { materialType: m.id, carrierKind: carrier, rare: m.rare };
}
