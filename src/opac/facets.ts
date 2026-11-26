// The filters' rules live with the server (supabase/functions/server/opacFacets.tsx), so the counts the server gives
// are the page's own. Here the labels and the order of equal counts follow the reader's chosen language.
import { opacLang } from './i18n';
import {
  facetCounts as countsIn, valueLabel as labelIn, languageDisplay as displayIn,
  type FacetKey, type FacetValue, type FacetWork, type Selection,
} from '../../supabase/functions/server/opacFacets.tsx';

export * from '../../supabase/functions/server/opacFacets.tsx';

/** A language name (as languageName gives it) in the reader's language. */
export function languageDisplay(name: string): string {
  return displayIn(name, opacLang());
}

export function valueLabel(key: FacetKey, value: string): string {
  return labelIn(key, value, opacLang());
}

/** Each facet's values with their counts (other facets applied); chosen values always stay listed. */
export function facetCounts(works: FacetWork[], sel: Selection): Record<FacetKey, FacetValue[]> {
  return countsIn(works, sel, opacLang());
}
