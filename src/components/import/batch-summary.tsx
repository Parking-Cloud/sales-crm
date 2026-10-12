import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/format";
import type { Batch } from "@/lib/import/queries";
import type { UndoBlocker } from "@/app/(app)/import/actions";
import { UndoControl } from "./undo-control";

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-sm border border-grey-60 bg-white p-4">
      <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">{label}</dt>
      <dd className="mt-1 text-h3 font-semibold tabular-nums">{formatNumber(value ?? 0)}</dd>
    </div>
  );
}

export function BatchSummary({
  batch,
  remaining,
  isAdmin,
  undoPreview,
}: {
  batch: Batch;
  remaining: Record<string, number>;
  isAdmin: boolean;
  // For previews only.
  undoPreview?: { open?: boolean; blockers?: UndoBlocker[] };
}) {
  const counts = batch.conteggi;
  const reportRows = counts.report?.length ?? 0;
  return (
    <>
      <p className="text-caption">
        <Link href="/import" className="rounded-xs text-blue-ink underline underline-offset-2">
          Import
        </Link>
      </p>
      <h1 className="mt-2 text-h2 leading-tight font-semibold break-words">Riepilogo import</h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-body text-black-60">
        <span>
          {batch.file} · {formatDate(batch.created_at)}
          {batch.utente && <> · {batch.utente}</>}
        </span>
        {batch.annullato_il ? (
          <Badge tone="neutral">Annullato il {formatDate(batch.annullato_il)}</Badge>
        ) : (
          <Badge tone="success">Importato</Badge>
        )}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Righe lette" value={counts.righe} />
        <Stat label="Soggetti creati" value={counts.nuovi_soggetti} />
        <Stat label="Aggiunte a esistenti" value={counts.aggiunte_a_esistenti} />
        <Stat label="Con avvisi" value={counts.con_avvisi} />
        <Stat label="Scartate" value={counts.scartate} />
        <Stat label="Escluse (doppioni)" value={counts.escluse} />
        <Stat label="Attività" value={counts.attivita} />
        <Stat label="Offerte" value={counts.offerte} />
      </dl>

      <div className="mt-6 flex flex-col gap-4">
        <Alert tone="warning" title="Permessi email da ristabilire">
          L&apos;import non crea permessi per l&apos;email. Prima di scrivere a un contatto importato, registra il
          permesso (richiesta in chiamata, contatto in entrata o consenso).
        </Alert>
        {reportRows > 0 && (
          <div>
            <a href={`/import/${batch.id}/report`} className={buttonClasses("secondary", "md", "h-auto py-2 text-left whitespace-normal!")} download>
              Scarica il report di righe scartate, escluse e avvisi (CSV, {reportRows === 1 ? "1 riga" : `${formatNumber(reportRows)} righe`})
            </a>
          </div>
        )}
        {!batch.annullato_il && (
          <p className="text-caption text-black-60">
            Ancora presenti da questo import: {formatNumber(remaining.parties ?? 0)} soggetti, {formatNumber(remaining.contacts ?? 0)} contatti,{" "}
            {formatNumber(remaining.opportunities ?? 0)} opportunità, {formatNumber(remaining.activities ?? 0)} attività,{" "}
            {formatNumber(remaining.offers ?? 0)} offerte.
          </p>
        )}
        {isAdmin && !batch.annullato_il && (
          <UndoControl batchId={batch.id} initiallyOpen={undoPreview?.open} initialBlockers={undoPreview?.blockers ?? null} />
        )}
      </div>
    </>
  );
}
