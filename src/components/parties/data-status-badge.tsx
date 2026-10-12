import { Badge } from "@/components/ui/badge";

// "Stato dei dati" in the list: verified fields over valued fields.
export function DataStatusBadge({ verified, valued }: { verified: number; valued: number }) {
  if (valued === 0) return <Badge tone="neutral">Nessun dato</Badge>;
  if (verified >= valued) return <Badge tone="success">Verificati {verified} su {valued}</Badge>;
  return (
    <Badge tone="attention">
      Verificati {verified} su {valued}
    </Badge>
  );
}

export function DoNotContactBadge() {
  return (
    <Badge tone="critical" icon="ban">
      Non contattare
    </Badge>
  );
}
