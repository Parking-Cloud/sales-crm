// Daily limits of Google calls (app_settings) and what each SKU is, for
// /impostazioni. Free monthly quotas from the Google Maps Platform price
// list read on 9 October 2026 (docs/spec.md, "Google Maps Platform").

export const API_LIMIT_KEYS = { nearby: "limite_giornaliero_nearby", details: "limite_giornaliero_details" } as const;
export const API_LIMIT_DEFAULTS = { nearby: 500, details: 300 } as const;
export const API_LIMIT_MAX = 100_000;

export const SKUS: { sku: string; label: string; unit: string; freePerMonth: number }[] = [
  { sku: "nearby_search_pro", label: "Ricerca attività vicine (Nearby Search Pro)", unit: "chiamate", freePerMonth: 5000 },
  { sku: "text_search_pro", label: "Ricerca per parola chiave (Text Search Pro)", unit: "chiamate", freePerMonth: 5000 },
  { sku: "place_details_enterprise", label: "Telefono e sito all'import (Place Details Enterprise)", unit: "chiamate", freePerMonth: 1000 },
  { sku: "place_details_essentials", label: "Coordinate rilette ogni notte (Place Details Essentials)", unit: "chiamate", freePerMonth: 10000 },
  { sku: "route_matrix_essentials", label: "Distanza a piedi (Route Matrix Essentials)", unit: "elementi", freePerMonth: 10000 },
];
