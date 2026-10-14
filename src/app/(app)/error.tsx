"use client";

import { ErrorScreen } from "@/components/error-screen";

// Error boundary of every page of the app (inside the menu and top bar).
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorScreen
      title="La pagina non si è caricata"
      message="Si è verificato un errore imprevisto. Premi Ricomincia; se il problema continua, avvisa l'amministratore indicando il codice qui sotto."
      digest={error.digest}
      reset={reset}
    />
  );
}
