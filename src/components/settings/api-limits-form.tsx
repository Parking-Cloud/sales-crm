"use client";

import { useActionState } from "react";
import { saveApiLimits, type LimitsFormState } from "@/app/(app)/impostazioni/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { ApiLimits } from "@/lib/settings/queries";

const INITIAL: LimitsFormState = { version: 0, status: "idle" };

export function ApiLimitsForm({
  limits,
  initialState = INITIAL,
  action = saveApiLimits,
}: {
  limits: ApiLimits;
  // For previews only.
  initialState?: LimitsFormState;
  action?: typeof saveApiLimits;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? { nearby: String(limits.nearby), details: String(limits.details) };
  const errors = state.fieldErrors ?? {};

  return (
    <form key={state.version} action={formAction} noValidate className="flex flex-col gap-4">
      {state.status === "saved" && <Alert tone="success">Limiti salvati.</Alert>}
      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nearby" label="Ricerche al giorno" hint="Chiamate Nearby Search e Text Search insieme. Oltre il limite la ricerca si blocca." error={errors.nearby} required>
          <Input id="nearby" name="nearby" inputMode="numeric" defaultValue={values.nearby} invalid={Boolean(errors.nearby)} hasDescription />
        </Field>
        <Field id="details" label="Dettagli al giorno" hint="Chiamate Place Details all'import. Oltre il limite l'import si blocca." error={errors.details} required>
          <Input id="details" name="details" inputMode="numeric" defaultValue={values.details} invalid={Boolean(errors.details)} hasDescription />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio..." : "Salva limiti"}
        </Button>
      </div>
    </form>
  );
}
