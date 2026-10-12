"use client";

import { useActionState } from "react";
import { saveMaxParkingDistance, type SettingFormState } from "@/app/(app)/impostazioni/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { decimalInputValue } from "@/lib/format";

const INITIAL: SettingFormState = { version: 0, status: "idle" };

export function MaxDistanceForm({
  meters,
  initialState = INITIAL,
  action = saveMaxParkingDistance,
}: {
  meters: number;
  // For previews only.
  initialState?: SettingFormState;
  action?: typeof saveMaxParkingDistance;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const value = state.value ?? decimalInputValue(meters / 1000);

  return (
    <form key={state.version} action={formAction} noValidate className="flex flex-col gap-4">
      {state.status === "saved" && <Alert tone="success">Impostazione salvata.</Alert>}
      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}
      <div className="w-full sm:w-80">
          <Field
            id="distanza_km"
            label="Distanza massima dei parcheggi mostrati"
            hint="In km, da 0,5 a 20. Esempio: 5 oppure 2,5."
            error={state.fieldError}
            required
          >
            <div className="flex items-center gap-2">
              <Input
                id="distanza_km"
                name="distanza_km"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={value}
                invalid={Boolean(state.fieldError)}
                hasDescription
                className="w-full"
              />
              <span className="text-body text-black-80">km</span>
            </div>
          </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio..." : "Salva impostazione"}
        </Button>
      </div>
    </form>
  );
}
