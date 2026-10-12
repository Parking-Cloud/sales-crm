// Free-text "Settore" to the fixed party categories: keyword rules in one
// place. A keyword ending with "*" matches any word starting with it.
// Categories must match PARTY_CATEGORIES in src/lib/parties/labels.ts.

export const CATEGORY_RULES: { category: string; keywords: string[] }[] = [
  {
    category: "Studi professionali",
    keywords: [
      "commercialista",
      "consulent*",
      "avvocat*",
      "broker",
      "assicuraz*",
      "agenzia immobiliare",
      "agente immobiliare",
      "amministrazione immobiliare",
      "selezionatore",
    ],
  },
  { category: "Ristoranti", keywords: ["ristorante", "pizzeria", "trattoria", "bar", "bistrot"] },
  { category: "Hotel", keywords: ["hotel"] },
  {
    category: "Centri medici",
    keywords: ["medic*", "fisioterap*", "osteopat*", "dentist*", "psicolog*", "chirurg*", "clinica", "riabilitazione", "ostetric*"],
  },
  { category: "Uffici", keywords: ["ufficio", "affitto di uffici"] },
  {
    category: "Aziende",
    keywords: ["azienda", "fornitore", "informatic*", "biotecnolog*", "web designer", "network marketing", "sicurezza"],
  },
  { category: "Altro", keywords: ["formazione", "scuola", "corsi", "coaching", "assistenza domiciliare"] },
];

export const FALLBACK_CATEGORY = "Altro";

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordPattern(keyword: string): RegExp {
  const prefix = keyword.endsWith("*");
  const body = escape(prefix ? keyword.slice(0, -1) : keyword).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^\\p{L}])${body}${prefix ? "\\p{L}*" : ""}(?=$|[^\\p{L}])`, "iu");
}

const COMPILED = CATEGORY_RULES.map((rule) => ({ category: rule.category, patterns: rule.keywords.map(keywordPattern) }));

// Category for a sector text; matched=false means the fallback was used.
export function categoryFor(sector: string | null): { category: string; matched: boolean } {
  const text = (sector ?? "").trim();
  if (text === "") return { category: FALLBACK_CATEGORY, matched: false };
  for (const rule of COMPILED) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return { category: rule.category, matched: true };
  }
  return { category: FALLBACK_CATEGORY, matched: false };
}
