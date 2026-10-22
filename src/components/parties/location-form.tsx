"use client";

import { useActionState } from "react";
import { saveLocation } from "@/app/(app)/prospect/actions";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { decimalInputValue } from "@/lib/format";
import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from "@/lib/geo/osm-attribution";
import { INITIAL_PARTY_FORM_STATE, type PartyFormState } from "@/lib/parties/form-state";
import type { PartyLocation } from "@/lib/parties/queries";

const COORDINATE = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

// Party location: address, main flag and coordinates. When the address
// changes, Nominatim proposes the coordinates and the user confirms them,
// as for car parks; otherwise they are typed in by hand.
export function LocationForm({
  partyId,
  location,
  isFirst,
  initialState = INITIAL_PARTY_FORM_STATE,
}: {
  partyId: string;
  location: PartyLocation | null;
  isFirst: boolean;
  initialState?: PartyFormState;
}) {
  const [state, formAction, pending] = useActionState(saveLocation, initialState);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {
    indirizzo: location?.indirizzo ?? "",
    cap: location?.cap ?? "",
    citta: location?.citta ?? "",
    lat: decimalInputValue(location?.lat),
    lng: decimalInputValue(location?.lng),
    principale: location ? (location.principale ? "on" : "") : isFirst ? "on" : "",
  };

  const text = (name: string, label: string, hint?: string, inputMode?: "numeric" | "decimal") => (
    <Field id={name} label={label} hint={hint} error={errors[name]}>
      <Input
        id={name}
        name={name}
        defaultValue={values[name]}
        inputMode={inputMode}
        autoComplete="off"
        invalid={Boolean(errors[name])}
        hasDescription={Boolean(errors[name] || hint)}
      />
    </Field>
  );

  return (
    <form key={state.version} action={formAction} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="party_id" value={partyId} />
      {location && <input type="hidden" name="id" value={location.id} />}
      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}

      <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sezione-indirizzo">
        <h2 id="sezione-indirizzo" className="text-h4 font-semibold">
          Indirizzo
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("indirizzo", "Indirizzo", "Via e numero civico.")}</div>
          {text("cap", "CAP", undefined, "numeric")}
          {text("citta", "Città")}
          <div className="sm:col-span-2">
            <Checkbox name="principale" defaultChecked={values.principale === "on"} label="Sede principale" hint="Una sola sede principale per prospect." />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sezione-coordinate">
        <h2 id="sezione-coordinate" className="text-h4 font-semibold">
          Coordinate
        </h2>
        <p className="mt-1 text-body text-black-60">
          Quando l&apos;indirizzo cambia, al salvataggio cerchiamo le coordinate su OpenStreetMap e ti chiediamo di
          confermarle. Puoi anche inserirle a mano.
        </p>
        {state.status === "geocode-failed" && state.message && (
          <Alert tone="warning" className="mt-4">
            {state.message}
          </Alert>
        )}
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {text("lat", "Latitudine", "Per esempio 45,464200.", "decimal")}
          {text("lng", "Longitudine", "Per esempio 9,190000.", "decimal")}
        </div>
      </section>

      {state.status === "confirm-geocode" && state.geocode ? (
        <div className="rounded-md border border-blue-40 bg-info-surface p-5" role="status">
          <h2 className="text-h4 font-semibold text-blue-ink">Conferma la posizione trovata</h2>
          <p className="mt-2 text-body">
            Indirizzo trovato su OpenStreetMap: <strong>{state.geocode.formattedAddress}</strong>
          </p>
          <p className="mt-1 text-body">
            Coordinate: {COORDINATE.format(state.geocode.lat)}, {COORDINATE.format(state.geocode.lng)}
          </p>
          <p className="mt-1 text-caption">
            <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="rounded-xs underline underline-offset-2">
              {OSM_ATTRIBUTION}
              <span className="sr-only"> (si apre in una nuova scheda)</span>
            </a>
          </p>
          <input type="hidden" name="geo_lat" value={String(state.geocode.lat)} />
          <input type="hidden" name="geo_lng" value={String(state.geocode.lng)} />
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button type="submit" name="geo" value="accept" variant="primary" size="md" disabled={pending}>
              Usa queste coordinate e salva
            </Button>
            <Button type="submit" name="geo" value="skip" size="md" disabled={pending}>
              Salva con le coordinate inserite a mano
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ButtonLink href={`/prospect/${partyId}#sedi`} size="md">
            Annulla
          </ButtonLink>
          {state.status === "geocode-failed" && <input type="hidden" name="geo" value="skip" />}
          <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Salvataggio..." : "Salva sede"}
          </Button>
        </div>
      )}
    </form>
  );
}
