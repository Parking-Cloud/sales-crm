"use client";

import { useState, useTransition } from "react";
import { saveMapping } from "@/app/(app)/import/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { columnLetter } from "@/lib/import/columns";
import { FIELDS, SHEET_KIND_LABELS, emptyMapping, type SheetKind, type SheetMapping } from "@/lib/import/presets";
import type { ParkingOption, SavedMapping } from "@/lib/import/queries";
import { cleanText, type Cell } from "@/lib/import/values";

export type SheetState = {
  name: string;
  rows: Cell[][];
  include: boolean;
  mapping: SheetMapping;
  parkingId: string | null;
};

function columnOptions(rows: Cell[][], headerRow: number): { letter: string; label: string }[] {
  const header = rows[headerRow - 1] ?? [];
  const width = Math.max(header.length, ...rows.slice(0, 50).map((row) => row.length), 1);
  return Array.from({ length: width }, (_, index) => {
    const letter = columnLetter(index);
    const title = cleanText(header[index] ?? null);
    return { letter, label: title ? `${letter} — ${title}` : letter };
  });
}

function SheetCard({
  sheet,
  index,
  parkings,
  mappings,
  onChange,
}: {
  sheet: SheetState;
  index: number;
  parkings: ParkingOption[];
  mappings: SavedMapping[];
  onChange: (next: SheetState) => void;
}) {
  const [saveName, setSaveName] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "critical"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const options = columnOptions(sheet.rows, sheet.mapping.headerRow);
  const id = (name: string) => `foglio-${index}-${name}`;
  const kind = sheet.mapping.kind;
  const saved = mappings.filter((mapping) => mapping.tipo_foglio === kind);

  const setMapping = (mapping: SheetMapping) => onChange({ ...sheet, mapping });

  return (
    <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby={id("titolo")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={id("titolo")} className="text-h4 font-semibold break-all">
          Foglio &ldquo;{sheet.name}&rdquo;
        </h3>
        <Checkbox
          checked={sheet.include}
          onChange={(event) => onChange({ ...sheet, include: event.target.checked })}
          label="Importa questo foglio"
        />
      </div>
      {sheet.include && (
        <div className="mt-4 flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id={id("tipo")} label="Contenuto del foglio">
              <Select
                id={id("tipo")}
                value={kind}
                onChange={(event) => setMapping(emptyMapping(event.target.value as SheetKind))}
              >
                {(Object.keys(SHEET_KIND_LABELS) as SheetKind[]).map((option) => (
                  <option key={option} value={option}>
                    {SHEET_KIND_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={id("intestazioni")} label="Riga delle intestazioni" hint="Le righe sopra (legenda) si ignorano.">
              <Input
                id={id("intestazioni")}
                type="number"
                min={1}
                max={50}
                value={sheet.mapping.headerRow}
                onChange={(event) => setMapping({ ...sheet.mapping, headerRow: Math.max(1, Number(event.target.value) || 1) })}
                hasDescription
              />
            </Field>
            <Field id={id("parcheggio")} label="Parcheggio di destinazione" required>
              <Select
                id={id("parcheggio")}
                value={sheet.parkingId ?? ""}
                onChange={(event) => onChange({ ...sheet, parkingId: event.target.value || null })}
                invalid={!sheet.parkingId}
              >
                <option value="">Scegli</option>
                {parkings.map((parking) => (
                  <option key={parking.id} value={parking.id}>
                    {parking.nome}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {saved.length > 0 && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full sm:w-72">
                <Field id={id("salvate")} label="Mappatura salvata">
                  <Select
                    id={id("salvate")}
                    defaultValue=""
                    onChange={(event) => {
                      const chosen = saved.find((mapping) => mapping.id === event.target.value);
                      if (chosen) setMapping(structuredClone(chosen.mappatura));
                    }}
                  >
                    <option value="">Scegli per applicarla</option>
                    {saved.map((mapping) => (
                      <option key={mapping.id} value={mapping.id}>
                        {mapping.nome}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          )}

          <fieldset>
            <legend className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">Colonne</legend>
            <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {FIELDS[kind].map((field) => (
                <label key={field.key} className="grid grid-cols-[1fr_minmax(0,1.2fr)] items-center gap-3 text-body">
                  <span>
                    {field.label}
                    {field.required && <span aria-hidden="true" className="ml-0.5 text-error">*</span>}
                    {field.required && <span className="sr-only"> (obbligatoria)</span>}
                  </span>
                  <Select
                    value={sheet.mapping.columns[field.key] ?? ""}
                    onChange={(event) =>
                      setMapping({ ...sheet.mapping, columns: { ...sheet.mapping.columns, [field.key]: event.target.value || null } })
                    }
                    invalid={Boolean(field.required && !sheet.mapping.columns[field.key])}
                  >
                    <option value="">Non presente</option>
                    {options.map((option) => (
                      <option key={option.letter} value={option.letter}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-end gap-3 border-t border-grey-60 pt-4">
            <div className="w-full sm:w-72">
              <Field id={id("nome-mappatura")} label="Salva questa mappatura come">
                <Input id={id("nome-mappatura")} value={saveName} onChange={(event) => setSaveName(event.target.value)} autoComplete="off" />
              </Field>
            </div>
            <Button
              disabled={pending || saveName.trim() === ""}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveMapping(saveName, kind, sheet.mapping);
                  setMessage(result.ok ? { tone: "success", text: "Mappatura salvata." } : { tone: "critical", text: result.message });
                })
              }
            >
              Salva mappatura
            </Button>
          </div>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
        </div>
      )}
    </section>
  );
}

export function MappingStep({
  sheets,
  parkings,
  mappings,
  onChange,
}: {
  sheets: SheetState[];
  parkings: ParkingOption[];
  mappings: SavedMapping[];
  onChange: (sheets: SheetState[]) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {sheets.map((sheet, index) => (
        <SheetCard
          key={sheet.name}
          sheet={sheet}
          index={index}
          parkings={parkings}
          mappings={mappings}
          onChange={(next) => onChange(sheets.map((item, i) => (i === index ? next : item)))}
        />
      ))}
    </div>
  );
}
