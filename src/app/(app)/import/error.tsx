"use client";

import { ErrorScreen } from "@/components/error-screen";

// Error boundary of the import pages.
export default function ImportError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorScreen
      heading="Import"
      title="L'import si è interrotto"
      message="Il file è troppo grande o il server non ha risposto in tempo. Prima di riprovare controlla nello storico degli import se è già stato registrato; se il file è grande, dividilo in parti più piccole."
      digest={error.digest}
      reset={reset}
    />
  );
}
