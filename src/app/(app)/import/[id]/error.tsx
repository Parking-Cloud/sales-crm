"use client";

import Link from "next/link";
import { ErrorScreen } from "@/components/error-screen";

// Error boundary of the page of one import (summary and "Annulla import").
export default function BatchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <p className="mb-2 text-caption">
        <Link href="/import" className="rounded-xs text-blue-ink underline underline-offset-2">
          Import
        </Link>
      </p>
      <ErrorScreen
        heading="Riepilogo import"
        title="Il riepilogo non si è caricato"
        message="Se stavi annullando l'import, premi Ricomincia: la pagina mostra se l'annullamento è avvenuto. Se il problema continua, avvisa l'amministratore indicando il codice qui sotto."
        digest={error.digest}
        reset={reset}
      />
    </>
  );
}
