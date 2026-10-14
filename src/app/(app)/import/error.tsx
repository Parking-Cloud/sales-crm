"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Error boundary of the import pages: an unexpected error shows this message
// instead of a blank page. "Ricomincia" reloads the page from the server.
export default function ImportError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">Import</h1>
      <div className="mt-6 flex max-w-3xl flex-col gap-4">
        <Alert tone="critical" title="L'import si è interrotto">
          Il file è troppo grande o il server non ha risposto in tempo. Prima di riprovare controlla nello storico
          degli import se è già stato registrato; se il file è grande, dividilo in parti più piccole.
        </Alert>
        <div>
          <Button
            variant="primary"
            size="md"
            onClick={() =>
              startTransition(() => {
                router.refresh();
                reset();
              })
            }
          >
            Ricomincia
          </Button>
        </div>
      </div>
    </>
  );
}
