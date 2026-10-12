import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";

// Shown to operators who open a write page directly.
export function AdminOnly({ backHref }: { backHref: string }) {
  return (
    <>
      <Alert tone="info" title="Sola lettura">
        Parcheggi e listini li modifica solo l&apos;amministratore.
      </Alert>
      <div className="mt-4">
        <ButtonLink href={backHref}>Torna indietro</ButtonLink>
      </div>
    </>
  );
}
