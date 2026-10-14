"use client";

import { ErrorScreen } from "@/components/error-screen";

// Error boundary of the pages outside the app (sign-in, status).
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <ErrorScreen
        title="La pagina non si è caricata"
        message="Si è verificato un errore imprevisto. Premi Ricomincia; se il problema continua, avvisa l'amministratore indicando il codice qui sotto."
        digest={error.digest}
        reset={reset}
      />
    </main>
  );
}
