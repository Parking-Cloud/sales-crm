import { DEFAULT_VAT_PCT, type ProductPeriod, type ProductType } from "./labels";

// Prefilled products for "Aggiungi da modello". Every field stays editable
// before saving. No price is prefilled: prices are set by the administrator.
// Hours are prefilled only where the spec gives them (daytime 7-19, H24);
// evening and night bands are left empty to be filled in.
export type ProductTemplate = {
  key: string;
  label: string;
  nome: string;
  tipo: ProductType;
  giorni: string | null;
  ora_da: string | null;
  ora_a: string | null;
  periodo: ProductPeriod | null;
  iva_pct: number;
};

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    key: "full-time",
    label: "Full Time 7/7",
    nome: "Full Time 7/7",
    tipo: "abbonamento",
    giorni: "7/7",
    ora_da: null,
    ora_a: null,
    periodo: "mese",
    iva_pct: DEFAULT_VAT_PCT,
  },
  {
    key: "diurno-5-7",
    label: "5/7 diurno",
    nome: "Diurno 5/7",
    tipo: "abbonamento",
    giorni: "5/7",
    ora_da: "07:00",
    ora_a: "19:00",
    periodo: "mese",
    iva_pct: DEFAULT_VAT_PCT,
  },
  {
    key: "serale",
    label: "Serale",
    nome: "Serale",
    tipo: "abbonamento",
    giorni: null,
    ora_da: null,
    ora_a: null,
    periodo: "mese",
    iva_pct: DEFAULT_VAT_PCT,
  },
  {
    key: "notturno",
    label: "Notturno",
    nome: "Notturno",
    tipo: "abbonamento",
    giorni: null,
    ora_da: null,
    ora_a: null,
    periodo: "mese",
    iva_pct: DEFAULT_VAT_PCT,
  },
  {
    key: "carnet",
    label: "Carnet",
    nome: "Carnet",
    tipo: "carnet",
    giorni: null,
    ora_da: null,
    ora_a: null,
    periodo: null,
    iva_pct: DEFAULT_VAT_PCT,
  },
  {
    key: "ricarica-elettrica",
    label: "Ricarica elettrica",
    nome: "Ricarica elettrica",
    tipo: "servizio_aggiuntivo",
    giorni: null,
    ora_da: null,
    ora_a: null,
    periodo: null,
    iva_pct: DEFAULT_VAT_PCT,
  },
];

export function findTemplate(key: string | undefined): ProductTemplate | undefined {
  return PRODUCT_TEMPLATES.find((template) => template.key === key);
}
