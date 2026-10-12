"use client";

import { useActionState } from "react";
import { saveFacility } from "@/app/(app)/parcheggi/actions";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { decimalInputValue } from "@/lib/format";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/parking/form-state";
import {
  CAMPAIGN_STATUS_LABELS,
  DEFAULT_SEARCH_RADIUS_M,
  PARKING_TYPE_LABELS,
  type CampaignStatus,
  type ParkingType,
} from "@/lib/parking/labels";
import type { Facility, UserOption } from "@/lib/parking/queries";
import type { RawValues } from "@/lib/parking/validation";

const COORDINATE = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function initialValues(facility: Facility | null): RawValues {
  const number = (value: number | null) => (value === null ? "" : String(value));
  return {
    nome: facility?.nome ?? "",
    tipo: facility?.tipo ?? "",
    indirizzo: facility?.indirizzo ?? "",
    cap: facility?.cap ?? "",
    citta: facility?.citta ?? "",
    capacita: number(facility?.capacita ?? null),
    posti_commerciali: number(facility?.posti_commerciali ?? null),
    raggio_m: number(facility?.raggio_m ?? DEFAULT_SEARCH_RADIUS_M),
    responsabile_id: facility?.responsabile_id ?? "",
    stato_campagna: facility?.stato_campagna ?? "bozza",
    note: facility?.note ?? "",
    lat: decimalInputValue(facility?.lat),
    lng: decimalInputValue(facility?.lng),
  };
}

export function FacilityForm({
  facility,
  users,
  geocodingEnabled,
  initialState = INITIAL_FORM_STATE,
  action = saveFacility,
}: {
  facility: Facility | null;
  users: UserOption[];
  geocodingEnabled: boolean;
  // For previews only.
  initialState?: FormState;
  action?: typeof saveFacility;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? initialValues(facility);
  const errors = state.fieldErrors ?? {};
  const cancelHref = facility ? `/parcheggi/${facility.id}` : "/parcheggi";
  const confirming = state.status === "confirm-geocode" && state.geocode;

  const text = (name: string, label: string, options: { required?: boolean; hint?: string; inputMode?: "numeric" | "decimal"; autoComplete?: string } = {}) => (
    <Field id={name} label={label} hint={options.hint} error={errors[name]} required={options.required}>
      <Input
        id={name}
        name={name}
        defaultValue={values[name]}
        required={options.required}
        inputMode={options.inputMode}
        autoComplete={options.autoComplete ?? "off"}
        invalid={Boolean(errors[name])}
        hasDescription={Boolean(errors[name] || options.hint)}
      />
    </Field>
  );

  return (
    <form key={state.version} action={formAction} noValidate className="flex flex-col gap-6">
      {facility && <input type="hidden" name="id" value={facility.id} />}

      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}

      <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sezione-dati">
        <h2 id="sezione-dati" className="text-h4 font-semibold">
          Dati del parcheggio
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("nome", "Nome", { required: true })}</div>
          <Field id="tipo" label="Tipo" error={errors.tipo} required>
            <Select id="tipo" name="tipo" defaultValue={values.tipo} required invalid={Boolean(errors.tipo)} hasDescription={Boolean(errors.tipo)}>
              <option value="">Scegli</option>
              {(Object.keys(PARKING_TYPE_LABELS) as ParkingType[]).map((type) => (
                <option key={type} value={type}>
                  {PARKING_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="stato_campagna" label="Stato campagna" error={errors.stato_campagna} required>
            <Select id="stato_campagna" name="stato_campagna" defaultValue={values.stato_campagna} invalid={Boolean(errors.stato_campagna)} hasDescription={Boolean(errors.stato_campagna)}>
              {(Object.keys(CAMPAIGN_STATUS_LABELS) as CampaignStatus[]).map((status) => (
                <option key={status} value={status}>
                  {CAMPAIGN_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">{text("indirizzo", "Indirizzo", { required: true, hint: "Via e numero civico." })}</div>
          {text("cap", "CAP", { inputMode: "numeric" })}
          {text("citta", "Città", { required: true })}
          {text("capacita", "Capacità totale", { inputMode: "numeric", hint: "Numero totale di posti." })}
          {text("posti_commerciali", "Posti commercializzabili", { inputMode: "numeric", hint: "Posti che si possono vendere." })}
          {text("raggio_m", "Raggio di ricerca (metri)", {
            inputMode: "numeric",
            hint: `Distanza per cercare le aziende vicine. Se vuoto: ${DEFAULT_SEARCH_RADIUS_M} m.`,
          })}
          <Field id="responsabile_id" label="Responsabile" error={errors.responsabile_id}>
            <Select id="responsabile_id" name="responsabile_id" defaultValue={values.responsabile_id} invalid={Boolean(errors.responsabile_id)} hasDescription={Boolean(errors.responsabile_id)}>
              <option value="">Nessuno</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field id="note" label="Note" error={errors.note}>
              <Textarea id="note" name="note" defaultValue={values.note} rows={3} />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sezione-coordinate">
        <h2 id="sezione-coordinate" className="text-h4 font-semibold">
          Coordinate
        </h2>
        <p className="mt-1 text-body text-black-60">
          {geocodingEnabled
            ? "Quando l'indirizzo cambia, al salvataggio cerchiamo le coordinate su Google e ti chiediamo di confermarle."
            : "Ricerca automatica non attiva: inserisci latitudine e longitudine a mano. Le trovi su Google Maps con il tasto destro sul punto."}
        </p>
        {state.status === "geocode-failed" && state.message && (
          <Alert tone="warning" className="mt-4">
            {state.message}
          </Alert>
        )}
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {text("lat", "Latitudine", { inputMode: "decimal", hint: "Per esempio 45,464200." })}
          {text("lng", "Longitudine", { inputMode: "decimal", hint: "Per esempio 9,190000." })}
        </div>
      </section>

      {confirming ? (
        <div className="rounded-md border border-blue-40 bg-info-surface p-5" role="status">
          <h2 className="text-h4 font-semibold text-blue-ink">Conferma la posizione trovata</h2>
          <p className="mt-2 text-body">
            Indirizzo trovato da Google: <strong>{state.geocode!.formattedAddress}</strong>
          </p>
          <p className="mt-1 text-body">
            Coordinate: {COORDINATE.format(state.geocode!.lat)}, {COORDINATE.format(state.geocode!.lng)}
          </p>
          <input type="hidden" name="geo_lat" value={String(state.geocode!.lat)} />
          <input type="hidden" name="geo_lng" value={String(state.geocode!.lng)} />
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
          <ButtonLink href={cancelHref} size="md">
            Annulla
          </ButtonLink>
          {state.status === "geocode-failed" && <input type="hidden" name="geo" value="skip" />}
          <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
            {pending ? "Salvataggio..." : "Salva"}
          </Button>
        </div>
      )}
    </form>
  );
}
