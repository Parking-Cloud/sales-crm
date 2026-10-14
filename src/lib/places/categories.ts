// Our party categories -> Google place types (Places API (New), Table A).
// The only place where this mapping lives: the search filters with it and
// the import maps a Google type back to our category.
// Pure module, relative imports only: unit tested.
//
// Every type must be in Table A of
// https://developers.google.com/maps/documentation/places/web-service/place-types
// (check with `npm run google:check-types`, which asks the API itself).

export const SEARCH_CATEGORIES = [
  "Uffici",
  "Studi professionali",
  "Hotel",
  "Ristoranti",
  "Negozi",
  "Aziende",
  "Centri medici",
  "Palestre",
  "Strutture ricettive",
] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

export const CATEGORY_TYPES: Record<SearchCategory, readonly string[]> = {
  Uffici: ["corporate_office", "coworking_space"],
  "Studi professionali": ["accounting", "lawyer", "insurance_agency", "real_estate_agency", "consultant"],
  Hotel: ["hotel", "bed_and_breakfast"],
  Ristoranti: ["restaurant", "cafe", "bar"],
  Negozi: ["store"],
  Aziende: ["corporate_office"],
  "Centri medici": ["doctor", "dental_clinic", "medical_lab", "physiotherapist", "hospital"],
  Palestre: ["gym", "fitness_center"],
  "Strutture ricettive": ["lodging"],
};

export function isSearchCategory(value: unknown): value is SearchCategory {
  return typeof value === "string" && (SEARCH_CATEGORIES as readonly string[]).includes(value);
}

// Distinct types of some categories, in category order.
export function typesFor(categories: readonly SearchCategory[]): string[] {
  return [...new Set(categories.flatMap((category) => CATEGORY_TYPES[category]))];
}

// Our category for a Google place: its primary type first, then its other
// types; among the categories searched first (corporate_office is both
// "Uffici" and "Aziende": the one the user asked for wins). "Altro" when
// nothing matches.
export function categoryForPlace(
  primaryType: string | null | undefined,
  types: readonly string[] | null | undefined,
  searched: readonly SearchCategory[] = SEARCH_CATEGORIES,
): SearchCategory | "Altro" {
  const order = [...searched, ...SEARCH_CATEGORIES.filter((category) => !searched.includes(category))];
  const candidates = [primaryType, ...(types ?? [])].filter((type): type is string => Boolean(type));
  for (const type of candidates) {
    const category = order.find((item) => CATEGORY_TYPES[item].includes(type));
    if (category) return category;
  }
  return "Altro";
}
