"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { confirmImport, prepareImport, searchPlaces, walkingDistances } from "@/app/(app)/ricerca-mappa/actions";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Th } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { googleMapsPlaceUrl } from "@/lib/google/maps-link";
import { safeCall } from "@/lib/import/safe-call";
import { SEARCH_CATEGORIES, type SearchCategory } from "@/lib/places/categories";
import { MAX_IMPORT, MAX_RADIUS, MAX_WALKING, MIN_RADIUS } from "@/lib/places/limits";
import type { SearchParking } from "@/lib/places/queries";
import type { ImportCandidate, ImportChoice, ImportSummary, ResultStatus, SearchResponse, SearchResult, WalkingDistance } from "@/lib/places/types";
import { ImportDialog } from "./import-dialog";
import { ResultsMap } from "./results-map";

export const STATUS_LABELS: Record<ResultStatus, { label: string; tone: BadgeTone }> = {
  nuovo: { label: "Nuovo", tone: "info" },
  presente: { label: "Già nel CRM", tone: "neutral" },
  esclusione: { label: "In lista di esclusione", tone: "critical" },
};

const DEFAULT_RADIUS = 500;

function clampRadius(value: number | null | undefined): number {
  const radius = value ?? DEFAULT_RADIUS;
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius));
}

function formatMeters(meters: number): string {
  return meters >= 1000 ? `${formatNumber(Math.round(meters / 100) / 10)} km` : `${formatNumber(meters)} m`;
}

type Actions = {
  search: typeof searchPlaces;
  walking: typeof walkingDistances;
  prepare: typeof prepareImport;
  confirm: typeof confirmImport;
};

export function MapSearch({
  parkings,
  initial,
  actions = { search: searchPlaces, walking: walkingDistances, prepare: prepareImport, confirm: confirmImport },
}: {
  parkings: SearchParking[];
  // For previews and end-to-end tests only.
  initial?: { response?: SearchResponse; checked?: string[]; walking?: WalkingDistance[] };
  actions?: Actions;
}) {
  const [parkingId, setParkingId] = useState(initial?.response?.parkingId ?? parkings[0]?.id ?? "");
  const parking = parkings.find((item) => item.id === parkingId) ?? null;
  const [radius, setRadius] = useState(String(initial?.response?.radius ?? clampRadius(parking?.raggio_m)));
  const [categories, setCategories] = useState<Set<SearchCategory>>(new Set(initial?.response?.categories ?? []));
  const [response, setResponse] = useState<SearchResponse | null>(initial?.response ?? null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [descending, setDescending] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set(initial?.checked ?? []));
  const [walking, setWalking] = useState<Map<string, WalkingDistance>>(
    new Map((initial?.walking ?? []).map((item) => [item.placeId, item])),
  );
  const [dialog, setDialog] = useState<
    { step: "loading" } | { step: "choose"; candidates: ImportCandidate[] } | { step: "done"; summary: ImportSummary } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const radiusValue = Number(radius);
  const radiusError =
    radius !== "" && (!Number.isFinite(radiusValue) || radiusValue < MIN_RADIUS || radiusValue > MAX_RADIUS)
      ? "Il raggio va da 100 a 5.000 metri."
      : undefined;

  const visible = useMemo(() => {
    const rows = (response?.results ?? []).filter(
      (row) => (!filterCategory || row.category === filterCategory) && (!filterStatus || row.status === filterStatus),
    );
    return descending ? [...rows].reverse() : rows;
  }, [response, filterCategory, filterStatus, descending]);
  const chosen = (response?.results ?? []).filter((row) => checked.has(row.placeId));

  const onSelect = useCallback((placeId: string) => {
    setSelectedId(placeId);
    document.getElementById(`risultato-${placeId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  function toggleCategory(category: SearchCategory, on: boolean) {
    setCategories((current) => {
      const next = new Set(current);
      if (on) next.add(category);
      else next.delete(category);
      return next;
    });
  }

  function search() {
    setError(null);
    setNotice(null);
    if (!parking) return setError("Scegli un parcheggio.");
    if (radiusError || radius === "") return setError("Il raggio va da 100 a 5.000 metri.");
    if (categories.size === 0) return setError("Scegli almeno una categoria.");
    startTransition(async () => {
      const result = await safeCall(() => actions.search({ parkingId: parking.id, radius: radiusValue, categories: [...categories] }));
      if (!result.ok) return setError(result.message);
      setResponse(result.data);
      setChecked(new Set());
      setWalking(new Map());
      setSelectedId(null);
      setFilterCategory("");
      setFilterStatus("");
    });
  }

  function computeWalking() {
    if (!response) return;
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() =>
        actions.walking({ parkingId: response.parkingId, places: chosen.map((row) => ({ placeId: row.placeId, lat: row.lat, lng: row.lng })) }),
      );
      if (!result.ok) return setError(result.message);
      setWalking((current) => new Map([...current, ...result.data.map((item) => [item.placeId, item] as const)]));
    });
  }

  function startImport() {
    setError(null);
    setDialog({ step: "loading" });
    startTransition(async () => {
      const result = await safeCall(() =>
        actions.prepare({ places: chosen.map((row) => ({ placeId: row.placeId, name: row.name, category: row.category, lat: row.lat, lng: row.lng })) }),
      );
      if (!result.ok) {
        setDialog(null);
        return setError(result.message);
      }
      setDialog({ step: "choose", candidates: result.data });
    });
  }

  function finishImport(candidates: ImportCandidate[], choices: ImportChoice[]) {
    if (!response) return;
    startTransition(async () => {
      const result = await safeCall(() => actions.confirm({ parkingId: response.parkingId, candidates, choices }));
      if (!result.ok) {
        setDialog(null);
        return setError(result.message);
      }
      // Imported results become "Già nel CRM" in the page.
      const done = new Map(
        result.data.righe.filter((row) => row.esito === "creato" || row.esito === "aggiunto").map((row) => [row.placeId, row]),
      );
      setResponse((current) =>
        current && {
          ...current,
          results: current.results.map((row) => {
            const outcome = done.get(row.placeId);
            return outcome ? { ...row, status: "presente", partyId: outcome.partyId, partyName: outcome.name, reason: "Importato ora" } : row;
          }),
        },
      );
      setChecked(new Set());
      setDialog({ step: "done", summary: result.data });
    });
  }

  const allCategories = categories.size === SEARCH_CATEGORIES.length;
  const tooMany = { walking: chosen.length > MAX_WALKING, import: chosen.length > MAX_IMPORT };

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
        className="flex flex-col gap-5 rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6"
        noValidate
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="parcheggio" label="Parcheggio" hint="Solo i parcheggi con le coordinate.">
            <Select
              id="parcheggio"
              value={parkingId}
              hasDescription
              onChange={(event) => {
                setParkingId(event.target.value);
                setRadius(String(clampRadius(parkings.find((item) => item.id === event.target.value)?.raggio_m)));
              }}
            >
              {parkings.length === 0 && <option value="">Nessun parcheggio con coordinate</option>}
              {parkings.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="raggio" label="Raggio in metri" hint="Da 100 a 5.000. Proposto: il raggio del parcheggio." error={radiusError}>
            <Input
              id="raggio"
              type="number"
              inputMode="numeric"
              min={MIN_RADIUS}
              max={MAX_RADIUS}
              step={50}
              value={radius}
              onChange={(event) => setRadius(event.target.value)}
              invalid={Boolean(radiusError)}
              hasDescription
            />
          </Field>
        </div>
        <fieldset>
          <legend className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">Categorie</legend>
          <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Checkbox
              label={<strong>Tutte</strong>}
              checked={allCategories}
              onChange={(event) => setCategories(new Set(event.target.checked ? SEARCH_CATEGORIES : []))}
            />
            {SEARCH_CATEGORIES.map((category) => (
              <Checkbox key={category} label={category} checked={categories.has(category)} onChange={(event) => toggleCategory(category, event.target.checked)} />
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end">
          <Button type="submit" variant={response ? "secondary" : "primary"} size="md" disabled={pending || parkings.length === 0}>
            {pending && !dialog ? "Ricerca..." : response ? "Cerca di nuovo" : "Cerca"}
          </Button>
        </div>
      </form>

      {error && <Alert tone="critical">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {response && (
        <section aria-labelledby="risultati" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="risultati" className="text-h3 font-semibold">
              {formatNumber(response.results.length)} {response.results.length === 1 ? "risultato" : "risultati"} entro {formatMeters(response.radius)} da{" "}
              {response.parkingName}
            </h2>
            <p className="text-caption text-black-60">
              {formatNumber(response.calls)} {response.calls === 1 ? "chiamata" : "chiamate"} a Google. I risultati restano solo in questa pagina:
              si salvano soltanto quelli importati.
            </p>
          </div>
          {response.partial && <Alert tone="warning">Risultati parziali: restringi il raggio o le categorie.</Alert>}

          <ResultsMap
            center={response.center}
            radius={response.radius}
            parkingName={response.parkingName}
            results={visible}
            selectedId={selectedId}
            onSelect={onSelect}
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              <div className="sm:w-56">
                <Field id="filtro-categoria" label="Categoria">
                  <Select id="filtro-categoria" value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
                    <option value="">Tutte</option>
                    {[...new Set(response.results.map((row) => row.category))].map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="sm:w-56">
                <Field id="filtro-stato" label="Stato">
                  <Select id="filtro-stato" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
                    <option value="">Tutti</option>
                    {(Object.keys(STATUS_LABELS) as ResultStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status].label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button onClick={computeWalking} disabled={pending || chosen.length === 0 || tooMany.walking}>
                Calcola distanza a piedi{chosen.length > 0 ? ` (${chosen.length})` : ""}
              </Button>
              <Button variant="primary" onClick={startImport} disabled={pending || chosen.length === 0 || tooMany.import}>
                Importa selezionati{chosen.length > 0 ? ` (${chosen.length})` : ""}
              </Button>
            </div>
          </div>
          {(tooMany.walking || tooMany.import) && (
            <p className="text-caption text-black-80">
              {tooMany.import
                ? `Hai selezionato ${chosen.length} risultati: si importano al massimo ${MAX_IMPORT} per volta e la distanza a piedi si calcola per al massimo ${MAX_WALKING}.`
                : `La distanza a piedi si calcola per al massimo ${MAX_WALKING} risultati per volta.`}
            </p>
          )}

          <ResultsTable
            rows={visible}
            numbers={new Map(visible.map((row, index) => [row.placeId, index + 1]))}
            checked={checked}
            onCheck={(placeId, on) =>
              setChecked((current) => {
                const next = new Set(current);
                if (on) next.add(placeId);
                else next.delete(placeId);
                return next;
              })
            }
            onCheckAll={(on) => setChecked(on ? new Set(visible.map((row) => row.placeId)) : new Set())}
            selectedId={selectedId}
            onSelect={setSelectedId}
            walking={walking}
            descending={descending}
            onSort={() => setDescending((value) => !value)}
          />
          <p className="text-caption text-black-60">
            Dati dei luoghi: <span className="font-semibold">Google Maps</span>. Distanze in linea d&apos;aria dal parcheggio; quelle a piedi da Google,
            calcolate su richiesta e non salvate.
          </p>
        </section>
      )}

      <ImportDialog
        state={dialog}
        pending={pending}
        onConfirm={finishImport}
        onClose={() => {
          if (dialog?.step === "done") {
            const { creati, aggiunti } = dialog.summary;
            setNotice(`Import completato: ${creati} ${creati === 1 ? "soggetto creato" : "soggetti creati"}, ${aggiunti} ${aggiunti === 1 ? "aggiunto" : "aggiunti"} a soggetti esistenti.`);
          }
          setDialog(null);
        }}
      />
    </div>
  );
}

function ResultsTable({
  rows,
  numbers,
  checked,
  onCheck,
  onCheckAll,
  selectedId,
  onSelect,
  walking,
  descending,
  onSort,
}: {
  rows: SearchResult[];
  numbers: Map<string, number>;
  checked: Set<string>;
  onCheck: (placeId: string, on: boolean) => void;
  onCheckAll: (on: boolean) => void;
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  walking: Map<string, WalkingDistance>;
  descending: boolean;
  onSort: () => void;
}) {
  if (rows.length === 0) return <p className="text-body text-black-60">Nessun risultato con questi filtri.</p>;
  const allChecked = rows.every((row) => checked.has(row.placeId));
  return (
    <div className="relative max-w-full overflow-x-auto rounded-md border border-grey-60 bg-white">
      <table className="w-full border-separate border-spacing-0 text-[14px] leading-snug text-brand-black">
        <caption className="sr-only">Risultati della ricerca, ordinati per distanza</caption>
        <thead>
          <tr>
            <Th>
              <input
                type="checkbox"
                aria-label="Seleziona tutti i risultati visibili"
                className="size-5 cursor-pointer accent-brand-blue align-middle"
                checked={allChecked}
                onChange={(event) => onCheckAll(event.target.checked)}
              />
            </Th>
            <Th>N.</Th>
            <Th>Nome</Th>
            <Th>Categoria</Th>
            <Th>Indirizzo</Th>
            <Th align="end">
              <button type="button" onClick={onSort} className="rounded-xs uppercase underline-offset-2 hover:underline" aria-label={`Ordina per distanza, ora ${descending ? "dal più lontano" : "dal più vicino"}`}>
                Distanza {descending ? "↓" : "↑"}
              </button>
            </Th>
            <Th>Stato</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.placeId === selectedId;
            const walk = walking.get(row.placeId);
            const cell = `border-b border-grey-60 px-3 py-2.5 align-middle ${selected ? "bg-blue-20" : "bg-white"}`;
            return (
              <tr key={row.placeId} id={`risultato-${row.placeId}`} aria-selected={selected} className="scroll-mt-24">
                <td className={`${cell} max-md:sticky max-md:left-0 max-md:z-[1]`}>
                  <input
                    type="checkbox"
                    aria-label={`Seleziona ${row.name}`}
                    className="size-5 cursor-pointer accent-brand-blue align-middle"
                    checked={checked.has(row.placeId)}
                    onChange={(event) => onCheck(row.placeId, event.target.checked)}
                  />
                </td>
                <td className={`${cell} tabular-nums text-black-60`}>{numbers.get(row.placeId)}</td>
                <td className={`${cell} min-w-48`}>
                  <button type="button" onClick={() => onSelect(row.placeId)} className="rounded-xs text-left font-semibold underline-offset-2 hover:underline">
                    {row.name}
                  </button>
                  <a
                    href={googleMapsPlaceUrl({ name: row.name, address: row.address, placeId: row.placeId }) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xs text-caption text-blue-ink underline underline-offset-2"
                  >
                    Apri in Google Maps<span className="sr-only"> (si apre in una nuova scheda)</span>
                  </a>
                </td>
                <td className={`${cell} whitespace-nowrap`}>{row.category}</td>
                <td className={`${cell} min-w-56 text-black-80`}>{row.address ?? "–"}</td>
                <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>
                  {formatMeters(row.distance)}
                  {walk && (
                    <span className="block text-caption text-black-80">
                      {walk.meters === null ? "a piedi: percorso non trovato" : `a piedi ${formatMeters(walk.meters)}, ${walk.minutes} min`}
                    </span>
                  )}
                </td>
                <td className={`${cell} min-w-40`}>
                  <span className="flex flex-col items-start gap-1">
                    <Badge tone={STATUS_LABELS[row.status].tone} icon={row.status === "esclusione" ? "ban" : undefined}>
                      {STATUS_LABELS[row.status].label}
                    </Badge>
                    {row.partyId && (
                      <Link href={`/soggetti/${row.partyId}`} className="rounded-xs text-caption text-blue-ink underline underline-offset-2">
                        Apri {row.partyName ?? "il soggetto"}
                      </Link>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
