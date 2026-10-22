"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { confirmImport, prepareImport, searchPlaces, walkingDistances } from "@/app/(app)/ricerca-mappa/actions";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { formatNumber } from "@/lib/format";
import { googleMapsPlaceUrl } from "@/lib/google/maps-link";
import { safeCall } from "@/lib/import/safe-call";
import { TABLE_PAGE_SIZE } from "@/lib/tables/paging";
import type { TableQuery } from "@/lib/tables/query";
import { pageRows, toggleSelection } from "@/lib/tables/selection";
import { SEARCH_CATEGORIES, type SearchCategory } from "@/lib/places/categories";
import { MAX_IMPORT, MAX_RADIUS, MAX_WALKING, MIN_RADIUS } from "@/lib/places/limits";
import { MAX_KEYWORD } from "@/lib/places/search";
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
  const [keyword, setKeyword] = useState(initial?.response?.keyword ?? "");
  const [query, setQuery] = useState<TableQuery>({ filters: {}, sort: null, desc: false, page: 1 });
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

  // Filters and sorting of the results (in the page, not in the URL).
  const visible = useMemo(() => {
    const { categoria, stato } = query.filters;
    const rows = (response?.results ?? []).filter((row) => (!categoria || row.category === categoria) && (!stato || row.status === stato));
    const sorted = query.sort === "nome" ? [...rows].sort((a, b) => a.name.localeCompare(b.name, "it")) : rows;
    return query.desc ? [...sorted].reverse() : sorted;
  }, [response, query]);
  const numbers = useMemo(() => new Map(visible.map((row, index) => [row.placeId, index + 1])), [visible]);
  const page = pageRows(visible, query.page, TABLE_PAGE_SIZE).map((row) => ({ ...row, id: row.placeId }));
  const chosen = (response?.results ?? []).filter((row) => checked.has(row.placeId));

  // A marker clicked on the map: its page of the table, then the row.
  const onSelect = useCallback(
    (placeId: string) => {
      setSelectedId(placeId);
      const index = visible.findIndex((row) => row.placeId === placeId);
      if (index >= 0) setQuery((current) => ({ ...current, page: Math.floor(index / TABLE_PAGE_SIZE) + 1 }));
      requestAnimationFrame(() => document.getElementById(`risultato-${placeId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    },
    [visible],
  );

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
    if (categories.size === 0 && !keyword.trim()) return setError("Scegli almeno una categoria o scrivi una parola chiave.");
    startTransition(async () => {
      const result = await safeCall(() =>
        actions.search({ parkingId: parking.id, radius: radiusValue, categories: [...categories], keyword: keyword.trim() || undefined }),
      );
      if (!result.ok) return setError(result.message);
      setResponse(result.data);
      setChecked(new Set());
      setWalking(new Map());
      setSelectedId(null);
      setQuery({ filters: {}, sort: null, desc: false, page: 1 });
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
  const tooMany = { walking: chosen.length > MAX_WALKING };

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
        <div className="sm:max-w-md">
          <Field
            id="parola-chiave"
            label="Parola chiave"
            hint="Facoltativa, per esempio: sede centrale. Se la scrivi si cerca questa parola nel raggio; le categorie servono solo a classificare i risultati."
          >
            <Input id="parola-chiave" value={keyword} maxLength={MAX_KEYWORD} autoComplete="off" onChange={(event) => setKeyword(event.target.value)} hasDescription />
          </Field>
        </div>
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
              {response.keyword && <> per &ldquo;{response.keyword}&rdquo;</>}
            </h2>
            <p className="text-caption text-black-60">
              {formatNumber(response.calls)} {response.calls === 1 ? "chiamata" : "chiamate"} a Google. I risultati restano solo in questa pagina:
              si salvano soltanto quelli importati.
            </p>
          </div>
          {response.partial && (
            <Alert tone="warning">
              {response.keyword ? "Risultati parziali: restringi il raggio o usa una parola chiave più precisa." : "Risultati parziali: restringi il raggio o le categorie."}
            </Alert>
          )}

          <ResultsMap
            center={response.center}
            radius={response.radius}
            parkingName={response.parkingName}
            results={visible}
            selectedId={selectedId}
            onSelect={onSelect}
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-body" aria-live="polite">
              <span className="font-semibold">{chosen.length === 1 ? "1 risultato selezionato" : `${chosen.length} risultati selezionati`}</span>
              <span className="block text-caption text-black-60">
                Puoi selezionare fino a {MAX_IMPORT} risultati alla volta; la selezione resta cambiando pagina.
              </span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button onClick={computeWalking} disabled={pending || chosen.length === 0 || tooMany.walking}>
                Calcola distanza a piedi{chosen.length > 0 ? ` (${chosen.length})` : ""}
              </Button>
              <Button variant="primary" onClick={startImport} disabled={pending || chosen.length === 0}>
                Importa selezionati{chosen.length > 0 ? ` (${chosen.length})` : ""}
              </Button>
            </div>
          </div>
          {tooMany.walking && <p className="text-caption text-black-80">La distanza a piedi si calcola per al massimo {MAX_WALKING} risultati per volta.</p>}

          <DataTable
            caption="Risultati della ricerca"
            columns={resultColumns({ numbers, walking, selectedId, onSelect: setSelectedId, categories: [...new Set(response.results.map((row) => row.category))] })}
            rows={page}
            total={visible.length}
            query={query}
            onQueryChange={setQuery}
            empty="Nessun risultato."
            rowId={(row) => `risultato-${row.placeId}`}
            rowClassName={(row) => (row.placeId === selectedId ? "!bg-blue-20" : "")}
            selection={{
              selected: checked,
              full: checked.size >= MAX_IMPORT,
              label: (row) => row.name,
              onChange: (ids, on) => setChecked((current) => toggleSelection(current, ids, on, MAX_IMPORT)),
            }}
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
            setNotice(`Import completato: ${creati} ${creati === 1 ? "prospect creato" : "prospect creati"}, ${aggiunti} ${aggiunti === 1 ? "aggiunto" : "aggiunti"} a prospect esistenti.`);
          }
          setDialog(null);
        }}
      />
    </div>
  );
}

type ResultRow = SearchResult & { id: string };

// Columns of the results table: number, name (with the Google Maps link),
// category, address, distance, status. Category and status are filters,
// distance and name sort.
function resultColumns({
  numbers,
  walking,
  selectedId,
  onSelect,
  categories,
}: {
  numbers: Map<string, number>;
  walking: Map<string, WalkingDistance>;
  selectedId: string | null;
  onSelect: (placeId: string) => void;
  categories: string[];
}): Column<ResultRow>[] {
  return [
    { key: "numero", label: "N.", cell: (row) => <span className="tabular-nums text-black-60">{numbers.get(row.placeId)}</span> },
    {
      key: "nome",
      label: "Nome",
      sort: "nome",
      sticky: true,
      width: "min-w-48 max-w-64",
      cell: (row) => (
        <span className="flex flex-col items-start">
          <button
            type="button"
            onClick={() => onSelect(row.placeId)}
            aria-pressed={row.placeId === selectedId}
            className="rounded-xs text-left font-semibold break-words underline-offset-2 hover:underline"
          >
            {row.name}
          </button>
          <a
            href={googleMapsPlaceUrl({ name: row.name, address: row.address, placeId: row.placeId }) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xs text-caption text-blue-ink underline underline-offset-2"
          >
            Apri in Google Maps<span className="sr-only"> (si apre in una nuova scheda)</span>
          </a>
        </span>
      ),
    },
    {
      key: "categoria",
      label: "Categoria",
      filter: { param: "categoria", type: "select", options: categories.map((value) => ({ value, label: value })), allLabel: "Tutte" },
      cell: (row) => <span className="whitespace-nowrap">{row.category}</span>,
    },
    { key: "indirizzo", label: "Indirizzo", width: "min-w-56", cell: (row) => <span className="text-black-80">{row.address ?? "–"}</span> },
    {
      key: "distanza",
      label: "Distanza",
      sort: "distanza",
      cell: (row) => {
        const walk = walking.get(row.placeId);
        return (
          <span className="whitespace-nowrap tabular-nums">
            {formatMeters(row.distance)}
            {walk && (
              <span className="block text-caption text-black-80">
                {walk.meters === null ? "a piedi: percorso non trovato" : `a piedi ${formatMeters(walk.meters)}, ${walk.minutes} min`}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "stato",
      label: "Stato",
      width: "min-w-40",
      filter: {
        param: "stato",
        type: "select",
        options: (Object.keys(STATUS_LABELS) as ResultStatus[]).map((value) => ({ value, label: STATUS_LABELS[value].label })),
      },
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <Badge tone={STATUS_LABELS[row.status].tone} icon={row.status === "esclusione" ? "ban" : undefined}>
            {STATUS_LABELS[row.status].label}
          </Badge>
          {row.partyId && (
            <Link href={`/prospect/${row.partyId}`} className="rounded-xs text-caption text-blue-ink underline underline-offset-2">
              Apri {row.partyName ?? "il prospect"}
            </Link>
          )}
        </span>
      ),
    },
  ];
}
