"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTemplateVersion, activateTemplateVersion } from "@/app/(app)/template/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { safeCall } from "@/lib/import/safe-call";

// "Usa questa versione" and "Elimina" for one template version (block 1a-8).
// A version used by an email, or the active one, stays read-only: the
// reason is shown instead of the button.
export function TemplateVersionControls({
  id,
  versione,
  corrente,
  usata,
}: {
  id: string;
  versione: number;
  corrente: boolean;
  // Emails sent with this version.
  usata: number;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<{ ok: true; data: null } | { ok: false; message: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(task);
      setConfirm(false);
      if (!result.ok) return setError(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {!corrente && (
          <Button size="sm" disabled={pending} onClick={() => run(() => activateTemplateVersion(id))}>
            Usa questa versione
          </Button>
        )}
        {!corrente && usata === 0 && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm(true)} className="text-error-ink">
            Elimina<span className="sr-only"> la versione {versione}</span>
          </Button>
        )}
        {(corrente || usata > 0) && (
          <span className="text-caption text-black-60">
            {corrente
              ? "Non si elimina: è la versione attiva."
              : `Non si elimina: usata in ${usata === 1 ? "un'email" : `${usata} email`}, resta in sola lettura.`}
          </span>
        )}
      </div>
      {error && <Alert tone="critical">{error}</Alert>}
      <ConfirmDialog
        open={confirm}
        title={`Eliminare la versione ${versione}?`}
        confirmLabel="Elimina la versione"
        confirmVariant="destructive"
        pending={pending}
        onConfirm={() => run(() => deleteTemplateVersion(id))}
        onCancel={() => setConfirm(false)}
      >
        <p>Non è mai stata usata in un&apos;email. L&apos;eliminazione resta nel registro delle modifiche.</p>
      </ConfirmDialog>
    </div>
  );
}
