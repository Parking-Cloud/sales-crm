"use client";

import { buttonClasses } from "@/components/ui/button";
import "./globals.css";

// Last error boundary: an error in the root or app layout. It replaces the
// whole document, so it reloads the page instead of using the router.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body className="antialiased">
        <main className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-h2 leading-tight font-semibold">Qualcosa non ha funzionato</h1>
          <div role="alert" className="mt-6 rounded-md border border-error-line bg-error-surface px-4 py-3 text-[14px] text-error-ink">
            <p className="font-semibold">La pagina non si è caricata</p>
            <p>
              Si è verificato un errore imprevisto. Premi Ricomincia; se il problema continua, avvisa
              l&apos;amministratore indicando il codice qui sotto.
            </p>
            {error.digest && <p className="mt-2 text-caption">Codice dell&apos;errore: {error.digest}</p>}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={buttonClasses("primary", "md", "mt-4")}
          >
            Ricomincia
          </button>
        </main>
      </body>
    </html>
  );
}
