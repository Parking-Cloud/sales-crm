"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Content of the error boundaries: a readable message instead of a blank
// page, "Ricomincia" to load the page again from the server, and the error
// code that also appears in the server logs.
export function ErrorScreen({
  title,
  message,
  digest,
  reset,
  heading = "Qualcosa non ha funzionato",
}: {
  title: string;
  message: React.ReactNode;
  digest?: string;
  reset: () => void;
  heading?: string;
}) {
  const router = useRouter();
  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">{heading}</h1>
      <div className="mt-6 flex max-w-3xl flex-col gap-4">
        <Alert tone="critical" title={title}>
          {message}
          {digest && <span className="mt-2 block text-caption">Codice dell&apos;errore: {digest}</span>}
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
