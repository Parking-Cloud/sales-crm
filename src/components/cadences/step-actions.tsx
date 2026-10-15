"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { skipStep, stopCadence } from "@/app/(app)/cadenze/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { safeCall } from "@/lib/import/safe-call";

// Email step that cannot be sent (B4): skip it (the next step starts) or
// stop the cadence; the reason goes to the history.
export function CadenceStepActions({
  taskId,
  enrollmentId,
  reason,
  doneHref,
  actions = { skip: skipStep, stop: stopCadence },
}: {
  taskId: string;
  enrollmentId: string;
  // Why the email is not allowed, for the history.
  reason: string;
  // Where to go afterwards.
  doneHref: string;
  // For previews and end-to-end tests only.
  actions?: { skip: typeof skipStep; stop: typeof stopCadence };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<{ ok: true; data: null } | { ok: false; message: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(task);
      if (!result.ok) return setError(result.message);
      router.push(doneHref);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body">Questo passo della cadenza non si può fare. Puoi saltarlo (parte il passo successivo) o fermare la cadenza.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="md" disabled={pending} onClick={() => run(() => actions.skip(taskId, `Email non ammessa: ${reason}`))}>
          Salta passo
        </Button>
        <Button size="md" variant="ghost" className="text-error-ink" disabled={pending} onClick={() => run(() => actions.stop(enrollmentId, "manuale", `Email non ammessa: ${reason}`))}>
          Ferma cadenza
        </Button>
      </div>
      {error && <Alert tone="critical">{error}</Alert>}
    </div>
  );
}
