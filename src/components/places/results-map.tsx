"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import type { ResultStatus, SearchResult } from "@/lib/places/types";

// Google Maps JavaScript, loaded only on the map search page with the
// browser key (restricted to the site in the Google console). It shows the
// car park, the search circle and one numbered marker per result; the
// numbers are those of the table, and a click selects the row. Places
// content is shown on a Google map, as the Places terms require.

// Minimal typing of the parts of the Maps API used here (no extra package).
type LatLngLiteral = { lat: number; lng: number };
type MapsListener = { remove: () => void };
type GMap = { fitBounds: (bounds: unknown, padding?: number) => void; panTo: (point: LatLngLiteral) => void };
type GMarker = {
  setMap: (map: GMap | null) => void;
  setZIndex: (z: number) => void;
  setIcon: (icon: unknown) => void;
  addListener: (event: string, handler: () => void) => MapsListener;
};
type GCircle = { setMap: (map: GMap | null) => void; getBounds: () => unknown };
type MapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GMap;
  Marker: new (options: Record<string, unknown>) => GMarker;
  Circle: new (options: Record<string, unknown>) => GCircle;
  SymbolPath: { CIRCLE: number };
};
type MapsWindow = Window & { google?: { maps?: MapsApi }; __crmMapsReady?: () => void; gm_authFailure?: () => void };

let loader: Promise<MapsApi> | null = null;

function loadMaps(key: string): Promise<MapsApi> {
  const win = window as MapsWindow;
  if (win.google?.maps?.Map) return Promise.resolve(win.google.maps);
  if (loader) return loader;
  loader = new Promise<MapsApi>((resolve, reject) => {
    win.__crmMapsReady = () => (win.google?.maps ? resolve(win.google.maps) : reject(new Error("maps")));
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=it&region=IT&loading=async&callback=__crmMapsReady`;
    script.async = true;
    script.onerror = () => reject(new Error("maps"));
    document.head.appendChild(script);
  }).catch((error) => {
    loader = null;
    throw error;
  });
  return loader;
}

// Marker colours from the UI Kit tokens: the map draws on its own canvas
// and cannot read var(), so the values are read from the page.
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const STATUS_TOKEN: Record<ResultStatus, string> = {
  nuovo: "--brand-blue",
  presente: "--black-60",
  esclusione: "--error",
};

export function ResultsMap({
  center,
  radius,
  parkingName,
  results,
  selectedId,
  onSelect,
}: {
  center: LatLngLiteral;
  radius: number;
  parkingName: string;
  // Numbered as in the table: index + 1.
  results: SearchResult[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<GMap | null>(null);
  const api = useRef<MapsApi | null>(null);
  const markers = useRef<Map<string, GMarker>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

  // Map, car park and circle: once per search.
  useEffect(() => {
    if (!key) {
      setError("La mappa non è configurata (chiave Google del browser mancante). I risultati restano nella tabella.");
      return;
    }
    let cancelled = false;
    const win = window as MapsWindow;
    win.gm_authFailure = () => setError("Google ha rifiutato la chiave della mappa. I risultati restano nella tabella; avvisa l'amministratore.");
    const overlays: { setMap: (map: GMap | null) => void }[] = [];
    loadMaps(key)
      .then((maps) => {
        if (cancelled || !element.current) return;
        api.current = maps;
        const instance = new maps.Map(element.current, {
          center,
          zoom: 15,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        });
        map.current = instance;
        const circle = new maps.Circle({
          map: instance,
          center,
          radius,
          strokeColor: token("--brand-blue"),
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: token("--brand-blue"),
          fillOpacity: 0.06,
          clickable: false,
        });
        const parking = new maps.Marker({
          map: instance,
          position: center,
          title: `Parcheggio: ${parkingName}`,
          label: { text: "P", color: token("--white"), fontWeight: "700" },
          icon: { path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: token("--brand-black"), fillOpacity: 1, strokeColor: token("--white"), strokeWeight: 2 },
          zIndex: 1000,
        });
        overlays.push(circle, parking);
        instance.fitBounds(circle.getBounds(), 24);
        setReady(true);
      })
      .catch(() => setError("La mappa non si è caricata. I risultati restano nella tabella."));
    return () => {
      cancelled = true;
      overlays.forEach((overlay) => overlay.setMap(null));
      setReady(false);
    };
  }, [key, center, radius, parkingName]);

  // Result markers: whenever the list (filters) changes.
  useEffect(() => {
    const maps = api.current;
    const instance = map.current;
    if (!ready || !maps || !instance) return;
    const created = new Map<string, GMarker>();
    const listeners: MapsListener[] = [];
    results.forEach((result, index) => {
      const marker = new maps.Marker({
        map: instance,
        position: { lat: result.lat, lng: result.lng },
        title: `${index + 1}. ${result.name}`,
        label: { text: String(index + 1), color: token("--white"), fontSize: "11px", fontWeight: "700" },
        icon: icon(maps, result.status, false),
        zIndex: results.length - index,
      });
      listeners.push(marker.addListener("click", () => onSelect(result.placeId)));
      created.set(result.placeId, marker);
    });
    markers.current = created;
    return () => {
      listeners.forEach((listener) => listener.remove());
      created.forEach((marker) => marker.setMap(null));
    };
  }, [ready, results, onSelect]);

  // Selected row: larger marker on top, map centred on it.
  useEffect(() => {
    const maps = api.current;
    if (!ready || !maps) return;
    results.forEach((result, index) => {
      const marker = markers.current.get(result.placeId);
      if (!marker) return;
      const selected = result.placeId === selectedId;
      marker.setIcon(icon(maps, result.status, selected));
      marker.setZIndex(selected ? 2000 : results.length - index);
      if (selected) map.current?.panTo({ lat: result.lat, lng: result.lng });
    });
  }, [ready, results, selectedId]);

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert tone="warning">{error}</Alert>}
      <div
        ref={element}
        role="region"
        aria-label={`Mappa dei risultati intorno a ${parkingName}`}
        className="h-[320px] w-full overflow-hidden rounded-md border border-grey-60 bg-grey-40 md:h-[440px]"
      />
      <p className="text-caption text-black-60">
        P = parcheggio; i numeri sono quelli della tabella. Colori: blu nuovo, grigio già nel CRM, rosso in lista di esclusione.
      </p>
    </div>
  );
}

function icon(maps: MapsApi, status: ResultStatus, selected: boolean) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: selected ? 14 : 10,
    fillColor: token(STATUS_TOKEN[status]),
    fillOpacity: 1,
    strokeColor: selected ? token("--accent-cyan") : token("--white"),
    strokeWeight: selected ? 4 : 2,
  };
}
