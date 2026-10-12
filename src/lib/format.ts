// Italian formats used across the UI: prices "1.234,50 €", dates gg/mm/aaaa.

// "always": Italian ICU data skips the thousands separator below 10.000.
const EURO = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  useGrouping: "always",
});

export const NUMBER_FORMAT_IT = new Intl.NumberFormat("it-IT", { useGrouping: "always", maximumFractionDigits: 2 });

const DATE = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Rome",
});

export function formatEuro(value: number | null | undefined): string {
  return value === null || value === undefined ? "–" : EURO.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "–" : NUMBER_FORMAT_IT.format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "–" : DATE.format(date);
}

// Accepts "1234,50", "1234.50", "1.234,50" and "1,234.50"; the last separator
// is the decimal one. Returns null for empty input, NaN when not a number.
export function parseDecimal(raw: string | null | undefined): number | null {
  const text = (raw ?? "").replace(/[\s€]/g, "");
  if (text === "") return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";
  const thousandsSeparator = decimalSeparator === "," ? "." : ",";
  let normalized = text.split(thousandsSeparator).join("");
  // A lone dot followed by exactly three digits ("1.234") is a thousands
  // separator in Italian, not a decimal point.
  if (decimalSeparator === "." && lastComma < 0 && /^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.split(".").join("");
  } else {
    normalized = normalized.replace(decimalSeparator, ".");
  }
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

// Formats a stored number for an input field, with the Italian comma.
export function decimalInputValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(".", ",");
}

// Gross price from net price and VAT rate, rounded to the cent.
export function grossPrice(net: number | null | undefined, vatPct: number | null | undefined): number | null {
  if (net === null || net === undefined || Number.isNaN(net)) return null;
  const rate = vatPct === null || vatPct === undefined || Number.isNaN(vatPct) ? 0 : vatPct;
  return Math.round(net * (100 + rate)) / 100;
}
