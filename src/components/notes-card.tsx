"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveNotes } from "@/app/(app)/note/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { safeCall } from "@/lib/import/safe-call";

const DATE_TIME = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

// Fixed memo on a party or a car park (not an activity), editable by all.
export function NotesCard({
  entita,
  id,
  note,
  author,
  updatedAt,
}: {
  entita: "parties" | "parking_facilities";
  id: string;
  note: string | null;
  author: string | null;
  updatedAt: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = `note-${id}`;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(async () => {
        const outcome = await saveNotes(entita, id, draft);
        return outcome.ok ? { ok: true as const, data: null } : outcome;
      });
      if (!result.ok) return setError(result.message);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby={`${fieldId}-titolo`} className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${fieldId}-titolo`} className="text-h4 font-semibold">
          Note
        </h2>
        {!editing && (
          <Button onClick={() => setEditing(true)}>{note ? "Modifica note" : "Aggiungi note"}</Button>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {editing ? (
          <>
            <Field id={fieldId} label="Note" hint="Un appunto fisso, visibile a tutti. Chiamate, email e incontri vanno nelle attività.">
              <Textarea id={fieldId} rows={5} maxLength={5000} value={draft} onChange={(event) => setDraft(event.target.value)} hasDescription />
            </Field>
            {error && <Alert tone="critical">{error}</Alert>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                size="md"
                disabled={pending}
                onClick={() => {
                  setDraft(note ?? "");
                  setEditing(false);
                  setError(null);
                }}
              >
                Annulla
              </Button>
              <Button size="md" disabled={pending} aria-busy={pending || undefined} onClick={save}>
                {pending ? "Salvataggio..." : "Salva note"}
              </Button>
            </div>
          </>
        ) : note ? (
          <p className="text-body whitespace-pre-line">{note}</p>
        ) : (
          <p className="text-body text-black-60">Nessuna nota.</p>
        )}
        {updatedAt && (
          <p className="text-caption text-black-60">
            Ultima modifica di {author ?? "utente non più attivo"} il {DATE_TIME.format(new Date(updatedAt)).replace(",", " alle")}
          </p>
        )}
      </div>
    </section>
  );
}
