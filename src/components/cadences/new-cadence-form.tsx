"use client";

import { useActionState } from "react";
import { createCadence, type CadenceFormState } from "@/app/(app)/cadenze/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const INITIAL: CadenceFormState = { version: 0, status: "idle" };

// "Nuova cadenza": the name, then the editor for the steps.
export function NewCadenceForm() {
  const [state, formAction, pending] = useActionState(createCadence, INITIAL);
  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="sm:w-96">
        <Field id="nuova-cadenza" label="Nuova cadenza">
          <Input id="nuova-cadenza" name="nome" maxLength={120} placeholder="Per esempio: Uffici, primo contatto" autoComplete="off" />
        </Field>
      </div>
      <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
        {pending ? "Creazione..." : "Crea e aggiungi i passi"}
      </Button>
      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}
    </form>
  );
}
