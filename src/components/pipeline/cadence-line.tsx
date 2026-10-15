import type { PipelineItem } from "@/lib/pipeline/queries";

// Active cadence of an opportunity, on cards and rows: name, step, pause.
export function CadenceLine({ cadenza }: { cadenza: PipelineItem["cadenza"] }) {
  if (!cadenza) return null;
  return (
    <span className="block text-caption text-black-80">
      Cadenza: {cadenza.nome}
      {cadenza.passo ? ` · passo ${cadenza.passo}/${cadenza.passi}` : ""}
      {cadenza.stato === "in_pausa" ? " · in pausa" : ""}
    </span>
  );
}
