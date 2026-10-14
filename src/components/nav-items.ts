export type NavItem = {
  href: string;
  label: string;
  // Shown only to administrators.
  adminOnly?: boolean;
};

// Sidebar entries. Every href must point to an existing page.
export const NAV_ITEMS: NavItem[] = [
  { href: "/oggi", label: "Oggi" },
  { href: "/parcheggi", label: "Parcheggi" },
  { href: "/ricerca-mappa", label: "Ricerca su mappa" },
  { href: "/soggetti", label: "Soggetti" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/import", label: "Import" },
  { href: "/esclusioni", label: "Esclusioni" },
  { href: "/impostazioni", label: "Impostazioni" },
];
