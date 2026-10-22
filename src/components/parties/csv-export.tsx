"use client";

import { useState, useTransition } from "react";
import { downloadCsvExport, previewCsvExport, type CsvExportInput, type CsvExportSummary } from "@/app/(app)/prospect/export-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { exportFileName } from "@/lib/export/csv";
import { safeCall } from "@/lib/import/safe-call";
import { romeDay } from "@/lib/pipeline/dates";

// "Esporta CSV" (block 1a-8, C1-C2): the selected parties, or all
// the filtered ones. First the summary (exported rows, excluded ones with
// the reason), then the download: the file is built here, in the browser,
// and never stored on the server.
export function CsvExportButton({
  formId,
  filtri,
  total,
  initiallyOpen = false,
  actions = { preview: previewCsvExport, download: downloadCsvExport },
}: {
  formId: string;
  // Search parameters of the list, for "Tutti i filtrati".
  filtri: Record<string, string | string[]>;
  // Parties matching the filters.
  total: number;
  // For previews and end-to-end tests only.
  initiallyOpen?: boolean;
  actions?: { preview: typeof previewCsvExport; download: typeof downloadCsvExport };
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [selected, setSelected] = useState<string[]>([]);
  const [scope, setScope] = useState<"selezionati" | "filtrati">("filtrati");
  const [summary, setSummary] = useState<CsvExportSummary | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"controllo" | "scarico" | null>(null);
  const [pending, startTransition] = useTransition();

  const input = (): CsvExportInput => (scope === "selezionati" ? { partyIds: selected } : { filtri });

  function openDialog() {
    const ids = [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${formId}"]:checked`)].map((box) => box.value);
    setSelected(ids);
    setScope(ids.length > 0 ? "selezionati" : "filtrati");
    setSummary(null);
    setDone(null);
    setError(null);
    setOpen(true);
  }

  function check() {
    setError(null);
    setPhase("controllo");
    startTransition(async () => {
      const result = await safeCall(() => actions.preview(input()));
      if (!result.ok) return setError(result.message);
      setSummary(result.data);
    });
  }

  function download() {
    setError(null);
    setPhase("scarico");
    startTransition(async () => {
      const result = await safeCall(() => actions.download(input()));
      if (!result.ok) return setError(result.message);
      const url = URL.createObjectURL(new Blob([result.data.csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName(romeDay(new Date()));
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDone(result.data.righe);
    });
  }

  return (
    <>
      <Button size="sm" onClick={openDialog}>
        Esporta CSV
      </Button>
      <Dialog
        open={open}
        title="Esporta prospect e contatti"
        busy={pending}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button size="md" disabled={pending} onClick={() => setOpen(false)}>
              {done !== null ? "Chiudi" : "Annulla"}
            </Button>
            {done === null &&
              (summary ? (
                <Button variant="primary" size="md" disabled={pending || summary.esportate === 0} aria-busy={pending || undefined} onClick={download}>
                  {pending && phase === "scarico" ? "Preparazione..." : `Scarica ${summary.esportate} righe`}
                </Button>
              ) : (
                <Button variant="primary" size="md" disabled={pending} aria-busy={pending || undefined} onClick={check}>
                  {pending ? "Controllo..." : "Controlla"}
                </Button>
              ))}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {!summary && (
            <fieldset>
              <legend className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">Cosa esportare</legend>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-sm border border-grey-60 px-3 text-body has-checked:border-brand-blue has-checked:bg-blue-20 has-disabled:cursor-not-allowed has-disabled:opacity-60">
                  <input type="radio" name="ambito" checked={scope === "selezionati"} disabled={selected.length === 0} onChange={() => setScope("selezionati")} className="size-4 accent-brand-blue" />
                  Prospect selezionati ({selected.length})
                </label>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-sm border border-grey-60 px-3 text-body has-checked:border-brand-blue has-checked:bg-blue-20">
                  <input type="radio" name="ambito" checked={scope === "filtrati"} onChange={() => setScope("filtrati")} className="size-4 accent-brand-blue" />
                  Tutti i prospect filtrati ({total.toLocaleString("it-IT")})
                </label>
              </div>
            </fieldset>
          )}
          <p className="text-caption text-black-80">
            Una riga per contatto, colonne first_name, last_name, job_title, email, phone, company, website, city, parking, stage,
            email_permission. Mai esportati: prospect o contatti in lista di esclusione e prospect cancellati per GDPR.
            L&apos;esportazione resta nel registro (chi, quando, quante righe); il file non viene salvato sul server.
          </p>
          {summary && (
            <div className="flex flex-col gap-2">
              <p className="text-body">
                <strong>{summary.esportate === 1 ? "1 riga esportata" : `${summary.esportate} righe esportate`}</strong> da{" "}
                {summary.soggetti === 1 ? "1 prospect" : `${summary.soggetti} prospect`};{" "}
                <strong>{summary.escluse.length === 1 ? "1 esclusa" : `${summary.escluse.length} escluse`}</strong>.
              </p>
              {summary.escluse.length > 0 && (
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {summary.escluse.map((row, index) => (
                    <li key={index} className="text-caption">
                      <span className="font-semibold">{row.nome}</span>: {row.motivo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {done !== null && <Alert tone="success">File scaricato: {done === 1 ? "1 riga" : `${done} righe`}.</Alert>}
          {error && <Alert tone="critical">{error}</Alert>}
        </div>
      </Dialog>
    </>
  );
}
