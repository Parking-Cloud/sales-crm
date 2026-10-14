"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  confirmAddressCoordinates,
  proposeAddressCoordinates,
  refreshLocationCoordinates,
  type AddressProposal,
} from "@/app/(app)/soggetti/[id]/sedi/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { safeCall } from "@/lib/import/safe-call";
import { OSM_ATTRIBUTION } from "@/lib/geo/osm-attribution";

const COORDINATE = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

// Coordinate actions of a location: "Aggiorna" for Google coordinates past
// 30 days, "Conferma indirizzo" (Nominatim, confirmed by the user) for any
// location not yet on Nominatim coordinates.
export function LocationCoordinates({
  partyId,
  locationId,
  canRefresh,
  canConfirm,
}: {
  partyId: string;
  locationId: string;
  canRefresh: boolean;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [proposal, setProposal] = useState<AddressProposal | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "critical"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run<T>(call: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>, done: (data: T) => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await safeCall(call);
      if (!result.ok) return setMessage({ tone: "critical", text: result.message });
      done(result.data);
    });
  }

  if (!canRefresh && !canConfirm) return null;
  return (
    <div className="flex flex-col gap-2 md:items-end">
      {proposal ? (
        <div className="flex max-w-80 flex-col gap-2 rounded-sm border border-grey-60 p-3 text-caption">
          <p>
            OpenStreetMap ha trovato: <strong>{proposal.formattedAddress}</strong> ({COORDINATE.format(proposal.lat)}, {COORDINATE.format(proposal.lng)}).
            Usare queste coordinate?
          </p>
          <p className="text-black-60">{OSM_ATTRIBUTION}</p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                run(
                  () => confirmAddressCoordinates(partyId, locationId, proposal),
                  () => {
                    setProposal(null);
                    setMessage({ tone: "success", text: "Indirizzo confermato: coordinate da OpenStreetMap." });
                    router.refresh();
                  },
                )
              }
            >
              Conferma
            </Button>
            <Button disabled={pending} onClick={() => setProposal(null)}>
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 md:justify-end">
          {canRefresh && (
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => refreshLocationCoordinates(partyId, locationId),
                  (data) => {
                    setMessage(
                      data.found
                        ? { tone: "success", text: "Coordinate aggiornate da Google." }
                        : { tone: "critical", text: "Il luogo non esiste più su Google: coordinate cancellate. Usa Conferma indirizzo." },
                    );
                    router.refresh();
                  },
                )
              }
            >
              Aggiorna
            </Button>
          )}
          {canConfirm && (
            <Button disabled={pending} onClick={() => run(() => proposeAddressCoordinates(partyId, locationId), setProposal)}>
              Conferma indirizzo
            </Button>
          )}
        </div>
      )}
      {message && (
        <Alert tone={message.tone} className="max-w-80">
          {message.text}
        </Alert>
      )}
    </div>
  );
}
