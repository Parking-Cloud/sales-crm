"use client";

import { useActionState, useState } from "react";
import { saveProduct } from "@/app/(app)/parcheggi/actions";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { decimalInputValue, formatEuro, grossPrice, parseDecimal } from "@/lib/format";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/parking/form-state";
import {
  DAY_PRESETS,
  DEFAULT_VAT_PCT,
  PRODUCT_PERIOD_LABELS,
  PRODUCT_TYPE_LABELS,
  type ProductPeriod,
  type ProductType,
} from "@/lib/parking/labels";
import type { Product } from "@/lib/parking/queries";
import type { ProductTemplate } from "@/lib/parking/templates";
import { CUSTOM_DAYS, type RawValues } from "@/lib/parking/validation";

type Source = Pick<Product, "nome" | "tipo" | "giorni" | "ora_da" | "ora_a" | "periodo" | "iva_pct"> &
  Partial<Pick<Product, "prezzo_netto" | "posti_disponibili" | "note" | "attivo">>;

function initialValues(source: Source | null): RawValues {
  const giorni = source?.giorni ?? "";
  const preset = giorni === "" ? "" : (DAY_PRESETS as readonly string[]).includes(giorni) ? giorni : CUSTOM_DAYS;
  return {
    nome: source?.nome ?? "",
    tipo: source?.tipo ?? "",
    giorni_preset: preset,
    giorni_personalizzati: preset === CUSTOM_DAYS ? giorni : "",
    ora_da: source?.ora_da?.slice(0, 5) ?? "",
    ora_a: source?.ora_a?.slice(0, 5) ?? "",
    periodo: source?.periodo ?? "",
    prezzo_netto: decimalInputValue(source?.prezzo_netto),
    iva_pct: decimalInputValue(source?.iva_pct ?? DEFAULT_VAT_PCT),
    posti_disponibili: source?.posti_disponibili === null || source?.posti_disponibili === undefined ? "" : String(source.posti_disponibili),
    note: source?.note ?? "",
    attivo: source?.attivo === false ? "" : "on",
  };
}

export function ProductForm({
  parkingId,
  product,
  template,
  initialState = INITIAL_FORM_STATE,
  action = saveProduct,
}: {
  parkingId: string;
  product: Product | null;
  template: ProductTemplate | null;
  // For previews only.
  initialState?: FormState;
  action?: typeof saveProduct;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? initialValues(product ?? template);
  const errors = state.fieldErrors ?? {};

  return (
    <form key={state.version} action={formAction} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="parking_id" value={parkingId} />
      {product && <input type="hidden" name="id" value={product.id} />}
      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}
      {template && !product && (
        <Alert tone="info">
          Modello &ldquo;{template.label}&rdquo;: controlla e completa i campi, poi salva. Il prezzo
          non è precompilato.
        </Alert>
      )}
      <ProductFields values={values} errors={errors} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ButtonLink href={`/parcheggi/${parkingId}#listino`} size="md">
          Annulla
        </ButtonLink>
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio..." : "Salva prodotto"}
        </Button>
      </div>
    </form>
  );
}

function ProductFields({ values, errors }: { values: RawValues; errors: Record<string, string> }) {
  const [dayPreset, setDayPreset] = useState(values.giorni_preset);
  const [net, setNet] = useState(values.prezzo_netto);
  const [vat, setVat] = useState(values.iva_pct);

  const netValue = parseDecimal(net);
  const vatValue = vat === "" ? DEFAULT_VAT_PCT : parseDecimal(vat);
  const gross =
    netValue === null || Number.isNaN(netValue) || vatValue === null || Number.isNaN(vatValue)
      ? null
      : grossPrice(netValue, vatValue);

  const describe = (name: string, hint?: boolean) => ({
    invalid: Boolean(errors[name]),
    hasDescription: Boolean(errors[name] || hint),
  });

  return (
    <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sezione-prodotto">
      <h2 id="sezione-prodotto" className="text-h4 font-semibold">
        Prodotto
      </h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field id="nome" label="Nome" error={errors.nome} required hint="Nome libero, per esempio Full Time 7/7.">
            <Input id="nome" name="nome" defaultValue={values.nome} required autoComplete="off" {...describe("nome", true)} />
          </Field>
        </div>
        <Field id="tipo" label="Tipo" error={errors.tipo} required>
          <Select id="tipo" name="tipo" defaultValue={values.tipo} required {...describe("tipo")}>
            <option value="">Scegli</option>
            {(Object.keys(PRODUCT_TYPE_LABELS) as ProductType[]).map((type) => (
              <option key={type} value={type}>
                {PRODUCT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="periodo" label="Periodo" error={errors.periodo} hint="A cosa si riferisce il prezzo.">
          <Select id="periodo" name="periodo" defaultValue={values.periodo} {...describe("periodo", true)}>
            <option value="">Non indicato</option>
            {(Object.keys(PRODUCT_PERIOD_LABELS) as ProductPeriod[]).map((period) => (
              <option key={period} value={period}>
                {PRODUCT_PERIOD_LABELS[period]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="giorni_preset" label="Giorni" error={errors.giorni_preset}>
          <Select
            id="giorni_preset"
            name="giorni_preset"
            value={dayPreset}
            onChange={(event) => setDayPreset(event.target.value)}
            {...describe("giorni_preset")}
          >
            <option value="">Non indicati</option>
            {DAY_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
            <option value={CUSTOM_DAYS}>Personalizzati</option>
          </Select>
        </Field>
        {dayPreset === CUSTOM_DAYS ? (
          <Field id="giorni_personalizzati" label="Giorni personalizzati" error={errors.giorni_personalizzati} required hint="Per esempio 6/7 oppure lun-sab.">
            <Input id="giorni_personalizzati" name="giorni_personalizzati" defaultValue={values.giorni_personalizzati} autoComplete="off" {...describe("giorni_personalizzati", true)} />
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field id="ora_da" label="Dalle ore" error={errors.ora_da} hint="Lascia vuoti gli orari per tutto il giorno.">
          <Input id="ora_da" name="ora_da" type="time" defaultValue={values.ora_da} {...describe("ora_da", true)} />
        </Field>
        <Field id="ora_a" label="Alle ore" error={errors.ora_a}>
          <Input id="ora_a" name="ora_a" type="time" defaultValue={values.ora_a} {...describe("ora_a")} />
        </Field>
        <Field id="prezzo_netto" label="Prezzo netto (€)" error={errors.prezzo_netto} hint="Con la virgola o il punto, per esempio 120,50.">
          <Input
            id="prezzo_netto"
            name="prezzo_netto"
            inputMode="decimal"
            autoComplete="off"
            value={net}
            onChange={(event) => setNet(event.target.value)}
            {...describe("prezzo_netto", true)}
          />
        </Field>
        <Field id="iva_pct" label="IVA (%)" error={errors.iva_pct} hint={`Se vuota: ${DEFAULT_VAT_PCT}%.`}>
          <Input
            id="iva_pct"
            name="iva_pct"
            inputMode="decimal"
            autoComplete="off"
            value={vat}
            onChange={(event) => setVat(event.target.value)}
            {...describe("iva_pct", true)}
          />
        </Field>
        <div className="flex flex-col gap-2 sm:col-span-2" aria-live="polite">
          <span className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">Prezzo lordo</span>
          <span className="text-h4 font-semibold tabular-nums">{gross === null ? "–" : formatEuro(gross)}</span>
          <span className="text-caption text-black-60">Calcolato da prezzo netto e IVA, non si modifica a mano.</span>
        </div>
        <Field id="posti_disponibili" label="Posti disponibili" error={errors.posti_disponibili} hint="Posti per questo prodotto.">
          <Input id="posti_disponibili" name="posti_disponibili" inputMode="numeric" defaultValue={values.posti_disponibili} autoComplete="off" {...describe("posti_disponibili", true)} />
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox name="attivo" defaultChecked={values.attivo === "on"} label="Prodotto attivo" hint="I prodotti non attivi restano nel listino ma non si offrono." />
        </div>
        <div className="sm:col-span-2">
          <Field id="note" label="Note" error={errors.note}>
            <Textarea id="note" name="note" defaultValue={values.note} rows={3} />
          </Field>
        </div>
      </div>
    </section>
  );
}
