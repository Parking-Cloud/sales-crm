"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { previewImport, readUpload, runImport } from "@/app/(app)/import/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { CRM_2026, PRESETS, emptyMapping, proposeMapping } from "@/lib/import/presets";
import type { ParkingOption, SavedMapping } from "@/lib/import/queries";
import type { PlanRow } from "@/lib/import/transform";
import type { SheetData } from "@/lib/import/workbook";
import { MappingStep, type SheetState } from "./mapping-step";
import { PreviewStep } from "./preview-step";

type Step = "carica" | "mappa" | "anteprima";

const STEPS: { key: Step; label: string }[] = [
  { key: "carica", label: "1. Caricamento" },
  { key: "mappa", label: "2. Colonne" },
  { key: "anteprima", label: "3. Anteprima e conferma" },
];

function initialSheets(sheets: SheetData[], presetKey: string, defaultParkingId: string | null): SheetState[] {
  const preset = PRESETS.find((item) => item.key === presetKey);
  return sheets.map((sheet) => {
    const mapping = preset ? proposeMapping(preset, sheet.name) : null;
    return {
      name: sheet.name,
      rows: sheet.rows,
      include: Boolean(mapping) || sheets.length === 1,
      mapping: mapping ?? emptyMapping("anagrafica"),
      parkingId: defaultParkingId,
    };
  });
}

export function ImportWizard({
  parkings,
  mappings,
  defaultParkingId,
  initial,
}: {
  parkings: ParkingOption[];
  mappings: SavedMapping[];
  defaultParkingId: string | null;
  // For previews only.
  initial?: { step: Step; fileName: string; sheets: SheetState[]; plan: PlanRow[] | null; confirmOpen?: boolean };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initial?.step ?? "carica");
  const [presetKey, setPresetKey] = useState(CRM_2026.key);
  const [fileName, setFileName] = useState(initial?.fileName ?? "");
  const [sheets, setSheets] = useState<SheetState[]>(initial?.sheets ?? []);
  const [plan, setPlan] = useState<PlanRow[] | null>(initial?.plan ?? null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(initial?.confirmOpen ?? false);
  const [pending, startTransition] = useTransition();

  const importable = plan?.filter((row) => row.status !== "scartata" && row.decision !== "escludi") ?? [];

  function upload(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await readUpload(form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setFileName(result.data.fileName);
      setSheets(initialSheets(result.data.sheets, presetKey, defaultParkingId));
      setNotice(result.data.truncated ? "Il file ha più di 5.000 righe in un foglio: si leggono solo le prime 5.000." : null);
      setPlan(null);
      setStep("mappa");
    });
  }

  function preview() {
    setError(null);
    startTransition(async () => {
      const chosen = sheets
        .filter((sheet) => sheet.include)
        .map((sheet) => ({ name: sheet.name, rows: sheet.rows, mapping: sheet.mapping, parkingId: sheet.parkingId }));
      const result = await previewImport(chosen);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPlan(result.data);
      setStep("anteprima");
    });
  }

  function confirmImport() {
    if (!plan) return;
    setError(null);
    startTransition(async () => {
      const result = await runImport(fileName, plan);
      if (!result.ok) {
        setConfirmOpen(false);
        setError(result.message);
        return;
      }
      router.push(`/import/${result.data.batchId}`);
    });
  }

  return (
    <section aria-labelledby="nuovo-import" className="flex flex-col gap-5">
      <h2 id="nuovo-import" className="text-h3 font-semibold">
        Nuovo import
      </h2>
      <ol className="flex flex-wrap gap-2" aria-label="Passi">
        {STEPS.map((item) => (
          <li
            key={item.key}
            aria-current={item.key === step ? "step" : undefined}
            className={`rounded-pill border px-3 py-1 text-caption font-semibold ${
              item.key === step ? "border-brand-blue bg-blue-20 text-blue-ink" : "border-grey-60 bg-white text-black-60"
            }`}
          >
            {item.label}
          </li>
        ))}
      </ol>

      {error && <Alert tone="critical">{error}</Alert>}
      {notice && <Alert tone="warning">{notice}</Alert>}

      {step === "carica" && (
        <form action={upload} className="flex flex-col gap-5 rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="file" label="File" hint="Excel .xlsx o .csv (separato da ; o da ,), al massimo 5 MB. Il file non viene conservato." required>
              <Input id="file" name="file" type="file" accept=".xlsx,.csv" required hasDescription className="py-2" />
            </Field>
            <Field id="preset" label="Formato del file" hint="Propone fogli e colonne; si possono cambiare al passo successivo.">
              <Select id="preset" value={presetKey} onChange={(event) => setPresetKey(event.target.value)} hasDescription>
                {PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
                <option value="">Nessuno: scelgo le colonne a mano</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Lettura del file..." : "Leggi il file"}
            </Button>
          </div>
        </form>
      )}

      {step === "mappa" && (
        <>
          <p className="text-body text-black-60">
            File <strong>{fileName}</strong>: scegli i fogli da importare, il parcheggio di ogni foglio e le colonne.
          </p>
          <MappingStep sheets={sheets} parkings={parkings} mappings={mappings} onChange={setSheets} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="md" onClick={() => setStep("carica")} disabled={pending}>
              Cambia file
            </Button>
            <Button variant="primary" size="md" onClick={preview} disabled={pending}>
              {pending ? "Controllo dei doppioni..." : "Vai all'anteprima"}
            </Button>
          </div>
        </>
      )}

      {step === "anteprima" && plan && (
        <>
          <Alert tone="info" title="Prima di importare">
            I permessi per l&apos;email non vengono importati: andranno registrati dagli operatori, contatto per
            contatto. Ogni dato importato ha fonte &ldquo;Import Excel&rdquo; e stato &ldquo;da verificare&rdquo;.
          </Alert>
          <PreviewStep rows={plan} onChange={setPlan} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="md" onClick={() => setStep("mappa")} disabled={pending}>
              Torna alle colonne
            </Button>
            <Button variant="primary" size="md" onClick={() => setConfirmOpen(true)} disabled={pending || importable.length === 0}>
              Importa {importable.length} righe
            </Button>
          </div>
          <ConfirmDialog
            open={confirmOpen}
            title={`Importare ${importable.length} righe?`}
            confirmLabel="Importa"
            pending={pending}
            onConfirm={confirmImport}
            onCancel={() => setConfirmOpen(false)}
          >
            <p>
              L&apos;import è tutto o niente: se una riga non si salva, non si salva nulla. Potrai annullarlo dal
              riepilogo finché nessuno modifica i dati importati.
            </p>
          </ConfirmDialog>
        </>
      )}
    </section>
  );
}
