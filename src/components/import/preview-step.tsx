"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { PlanRow, RowStatus } from "@/lib/import/transform";
import { toText } from "@/lib/import/values";
import { PARTY_CATEGORIES } from "@/lib/parties/labels";

const STATUS: Record<RowStatus, { label: string; tone: BadgeTone }> = {
  valida: { label: "Valida", tone: "success" },
  avvisi: { label: "Con avvisi", tone: "attention" },
  doppione: { label: "Doppione", tone: "info" },
  scartata: { label: "Scartata", tone: "neutral" },
};

const PHASES: Record<string, string> = {
  da_contattare: "da contattare",
  contattata: "contattata",
  interessata: "interessata",
  offerta_inviata: "offerta inviata",
  vinta: "vinta",
};

const OFFERS: Record<string, string> = { inviata: "inviata", accettata: "accettata", rifiutata: "rifiutata" };

// Every value shown goes through toText: never an object in the page.
function rowName(row: PlanRow): string {
  return (
    toText(row.party.denominazione) ||
    [toText(row.party.nome), toText(row.party.cognome)].filter(Boolean).join(" ") ||
    "Senza nome"
  );
}

function summary(row: PlanRow): string {
  if (row.status === "scartata" || row.decision === "escludi") return "Niente";
  const parts = [
    row.opportunity.esito === "persa" ? "opportunità persa" : `opportunità ${PHASES[row.opportunity.fase] ?? row.opportunity.fase}`,
  ];
  if (row.contact) parts.push("contatto");
  if (row.activities.length > 0) parts.push(`${row.activities.length} attività`);
  if (row.offer) parts.push(`offerta ${OFFERS[row.offer.stato] ?? toText(row.offer.stato)}`);
  return parts.join(" · ");
}

export function PreviewStep({ rows, onChange }: { rows: PlanRow[]; onChange: (rows: PlanRow[]) => void }) {
  const [filter, setFilter] = useState<RowStatus | "tutte">("tutte");
  const counts = rows.reduce(
    (total, row) => ({ ...total, [row.status]: (total[row.status] ?? 0) + 1 }),
    {} as Partial<Record<RowStatus, number>>,
  );
  const visible = filter === "tutte" ? rows : rows.filter((row) => row.status === filter);
  const update = (ref: string, patch: (row: PlanRow) => PlanRow) => onChange(rows.map((row) => (row.ref === ref ? patch(row) : row)));

  const filters: { key: RowStatus | "tutte"; label: string; count: number }[] = [
    { key: "tutte", label: "Tutte", count: rows.length },
    ...(Object.keys(STATUS) as RowStatus[]).map((key) => ({ key, label: STATUS[key].label, count: counts[key] ?? 0 })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Filtra per stato" className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={`min-h-(--control-h) rounded-pill border px-4 text-[14px] font-semibold md:min-h-(--control-h-sm) ${
              filter === item.key ? "border-brand-blue bg-blue-20 text-blue-ink" : "border-brand-grey bg-white text-black-80 hover:bg-grey-40"
            }`}
          >
            {item.label} <span className="tabular-nums">({item.count})</span>
          </button>
        ))}
      </div>

      <Table caption="Anteprima delle righe da importare">
        <thead>
          <tr>
            <Th>Riga</Th>
            <Th>Soggetto</Th>
            <Th>Categoria</Th>
            <Th>Stato</Th>
            <Th>Dettagli e scelte</Th>
            <Th>Cosa crea</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const editable = row.status !== "scartata" && row.decision !== "escludi" && !row.linkTo;
            const warning = row.duplicates.filter((hit) => hit.livello === "avviso");
            const block = row.duplicates.find((hit) => hit.livello === "blocco");
            return (
              <Tr key={row.ref}>
                <Td>
                  <span className="block font-semibold">{row.kind === "anagrafica" ? "Anagrafica" : "Prospect"}</span>
                  <span className="text-caption text-black-60">riga {toText(row.row)}</span>
                </Td>
                <Td wrap>
                  {editable && row.needsTypeChoice ? (
                    <span className="flex min-w-56 flex-col gap-2">
                      <Select
                        aria-label={`Tipo: ${rowName(row)}`}
                        value={row.party.tipo}
                        onChange={(event) =>
                          update(row.ref, (current) => {
                            const name = rowName(current);
                            return event.target.value === "azienda"
                              ? { ...current, party: { ...current.party, tipo: "azienda", denominazione: name, nome: null, cognome: null } }
                              : {
                                  ...current,
                                  party: {
                                    ...current.party,
                                    tipo: "persona",
                                    denominazione: null,
                                    nome: name.split(" ")[0] ?? null,
                                    cognome: name.split(" ").slice(1).join(" ") || null,
                                  },
                                };
                          })
                        }
                      >
                        <option value="azienda">Azienda</option>
                        <option value="persona">Persona</option>
                      </Select>
                      {row.party.tipo === "persona" ? (
                        <span className="grid grid-cols-2 gap-2">
                          <Input
                            aria-label={`Nome: ${rowName(row)}`}
                            value={toText(row.party.nome)}
                            onChange={(event) => update(row.ref, (current) => ({ ...current, party: { ...current.party, nome: event.target.value || null } }))}
                          />
                          <Input
                            aria-label={`Cognome: ${rowName(row)}`}
                            value={toText(row.party.cognome)}
                            onChange={(event) => update(row.ref, (current) => ({ ...current, party: { ...current.party, cognome: event.target.value || null } }))}
                          />
                        </span>
                      ) : (
                        <span className="font-semibold">{rowName(row)}</span>
                      )}
                    </span>
                  ) : (
                    <span className="font-semibold">{row.status === "scartata" ? "–" : rowName(row)}</span>
                  )}
                  {row.linkTo && <span className="block text-caption text-black-60">Stesso soggetto della riga {toText(row.linkTo).split(":").pop()} dell&apos;anagrafica</span>}
                </Td>
                <Td>
                  {editable ? (
                    <Select
                      className="min-w-48"
                      aria-label={`Categoria: ${rowName(row)}`}
                      value={toText(row.party.categoria)}
                      onChange={(event) => update(row.ref, (current) => ({ ...current, party: { ...current.party, categoria: event.target.value || null } }))}
                    >
                      <option value="">Non indicata</option>
                      {PARTY_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    (toText(row.party.categoria) || "–")
                  )}
                </Td>
                <Td>
                  <span className="flex flex-col items-start gap-1">
                    <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                    {row.decision === "escludi" && row.status !== "scartata" && <Badge tone="critical">Esclusa</Badge>}
                  </span>
                </Td>
                <Td wrap>
                  <div className="flex min-w-64 flex-col gap-2 text-caption">
                    {row.discard && <p className="font-semibold">{toText(row.discard)}</p>}
                    {block && (
                      <p>
                        <strong>Esclusa: {toText(block.motivo)}.</strong>{" "}
                        {block.party_id && (
                          <Link href={`/soggetti/${block.party_id}`} className="rounded-xs text-blue-ink underline underline-offset-2">
                            Apri {toText(block.nome) || "il soggetto"}
                          </Link>
                        )}
                      </p>
                    )}
                    {!block && warning.length > 0 && (
                      <fieldset className="flex flex-col gap-1">
                        <legend className="font-semibold">
                          Possibile doppione: {warning.map((hit) => `${toText(hit.motivo).toLowerCase()} (${toText(hit.nome) || "soggetto"})`).join("; ")}
                        </legend>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`scelta-${row.ref}`}
                            checked={row.decision === "crea"}
                            onChange={() => update(row.ref, (current) => ({ ...current, decision: "crea", mergeInto: null }))}
                            className="size-4 accent-brand-blue"
                          />
                          Crea nuovo
                        </label>
                        {[...new Map(warning.filter((hit) => hit.party_id).map((hit) => [hit.party_id, hit])).values()].map((hit) => (
                          <label key={hit.party_id} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`scelta-${row.ref}`}
                              checked={row.decision === "unisci" && row.mergeInto === hit.party_id}
                              onChange={() => update(row.ref, (current) => ({ ...current, decision: "unisci", mergeInto: hit.party_id }))}
                              className="size-4 accent-brand-blue"
                            />
                            Unisci all&apos;esistente: {toText(hit.nome)}
                          </label>
                        ))}
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`scelta-${row.ref}`}
                            checked={row.decision === "escludi"}
                            onChange={() => update(row.ref, (current) => ({ ...current, decision: "escludi", mergeInto: null }))}
                            className="size-4 accent-brand-blue"
                          />
                          Non importare
                        </label>
                      </fieldset>
                    )}
                    {row.warnings.length > 0 && (
                      <ul className="list-disc pl-4 text-black-80">
                        {row.warnings.map((text, index) => (
                          <li key={index}>{toText(text)}</li>
                        ))}
                      </ul>
                    )}
                    {!row.discard && !block && warning.length === 0 && row.warnings.length === 0 && <span className="text-black-60">Nessun problema</span>}
                  </div>
                </Td>
                <Td wrap>{summary(row)}</Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      {visible.length === 0 && <p className="text-body text-black-60">Nessuna riga con questo stato.</p>}
    </div>
  );
}
