"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setTemplateActive } from "@/app/(app)/template/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { safeCall } from "@/lib/import/safe-call";

// Turns a template off (not offered in "Prepara email") or back on.
export function TemplateToggle({ famigliaId, attivo }: { famigliaId: string; attivo: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await safeCall(() => setTemplateActive(famigliaId, !attivo));
            if (!result.ok) return setError(result.message);
            router.refresh();
          })
        }
      >
        {attivo ? "Disattiva" : "Riattiva"}
      </Button>
      {error && (
        <Alert tone="critical" className="basis-full">
          {error}
        </Alert>
      )}
    </>
  );
}
