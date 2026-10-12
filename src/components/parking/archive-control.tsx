"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setFacilityArchived } from "@/app/(app)/parcheggi/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// "Archivia" asks for confirmation; "Ripristina" acts directly. Nothing is
// ever deleted from the interface.
export function ArchiveControl({
  facilityId,
  facilityName,
  archived,
  initiallyOpen = false,
  action = setFacilityArchived,
}: {
  facilityId: string;
  facilityName: string;
  archived: boolean;
  // For previews only.
  initiallyOpen?: boolean;
  action?: typeof setFacilityArchived;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(nextArchived: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await action(facilityId, nextArchived);
      if (!result.ok) {
        setError(result.message ?? "Operazione non riuscita.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {archived ? (
        <Button onClick={() => run(false)} disabled={pending}>
          {pending ? "Ripristino..." : "Ripristina"}
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>Archivia</Button>
      )}
      <ConfirmDialog
        open={open}
        title="Archiviare il parcheggio?"
        confirmLabel="Archivia"
        pending={pending}
        onConfirm={() => run(true)}
        onCancel={() => setOpen(false)}
      >
        <p>
          <strong>{facilityName}</strong> non comparirà più nell&apos;elenco. Lead, opportunità e
          listino restano salvati e puoi ripristinarlo quando vuoi.
        </p>
      </ConfirmDialog>
      {error && (
        <Alert tone="critical" className="mt-3 w-full">
          {error}
        </Alert>
      )}
    </>
  );
}
