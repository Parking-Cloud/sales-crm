export type NavItem = {
  href: string;
  label: string;
  // Shown only to administrators.
  adminOnly?: boolean;
};

// Sidebar entries (block 1a-9). Every href must point to an existing page.
// Cadences and import are disabled: their pages stay, out of the menu.
// The suppression list is reached from Impostazioni.
export const NAV_ITEMS: NavItem[] = [
  { href: "/promemoria", label: "Promemoria" },
  { href: "/parcheggi", label: "Parcheggi" },
  { href: "/ricerca-mappa", label: "Ricerca su mappa" },
  { href: "/prospect", label: "Prospect" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/template", label: "Template email", adminOnly: true },
  { href: "/analytics", label: "Analytics" },
  { href: "/impostazioni", label: "Impostazioni" },
];
