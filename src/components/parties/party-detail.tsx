import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from "@/lib/geo/osm-attribution";
import { googleMapsLink } from "@/lib/google/maps-link";
import { formatKm } from "@/lib/settings/distance";
import {
  CONTACT_CHANNEL_LABELS,
  DATA_STATUS_LABELS,
  PARTY_TYPE_LABELS,
  PRIVATE_PARKING_LABELS,
  partyName,
} from "@/lib/parties/labels";
import type { Contact, Distance, HistoryEntry, Party, PartyLocation, Provenance } from "@/lib/parties/queries";
import { TRACKED_FIELD_LABELS, type TrackedField } from "@/lib/parties/validation";
import { DoNotContactBadge } from "./data-status-badge";
import { DoNotContactControl } from "./do-not-contact-control";
import { HistoryList } from "./history-list";
import { ProvenanceBadge } from "./provenance";

const COORDINATE = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function Section({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titolo`} className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-titolo`} className="text-h4 font-semibold">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">{label}</dt>
      <dd className="text-body break-words">{children}</dd>
    </div>
  );
}

function formatDistance(meters: number): string {
  return `${formatNumber(meters)} m`;
}

export function PartyDetail({
  party,
  locations,
  contacts,
  provenance,
  distances,
  maxDistanceM,
  history,
  isAdmin,
  dialogOpenFor,
}: {
  party: Party;
  locations: PartyLocation[];
  contacts: Contact[];
  provenance: Provenance[];
  distances: Distance[];
  maxDistanceM: number;
  history: HistoryEntry[];
  isAdmin: boolean;
  // For previews only: open the "Non contattare" dialog of this record.
  dialogOpenFor?: string;
}) {
  const name = partyName(party);
  const company = party.tipo === "azienda";
  const partyProvenance = (field: TrackedField) =>
    provenance.find((row) => row.entita === "parties" && row.entita_id === party.id && row.campo === field);
  const contactProvenance = (contactId: string) =>
    provenance.find((row) => row.entita === "contacts" && row.entita_id === contactId && row.campo === "referente");

  const tracked = (field: TrackedField, value: React.ReactNode, hasValue: boolean) => (
    <Detail label={TRACKED_FIELD_LABELS[field]}>
      <span className="flex flex-col gap-1">
        <span>{hasValue ? value : "–"}</span>
        {hasValue && <ProvenanceBadge provenance={partyProvenance(field)} />}
      </span>
    </Detail>
  );

  const fieldLabel = (row: Provenance) => {
    if (row.entita === "contacts") {
      const contact = contacts.find((item) => item.id === row.entita_id);
      return `Referente: ${[contact?.nome, contact?.cognome].filter(Boolean).join(" ") || contact?.ruolo || "contatto"}`;
    }
    return TRACKED_FIELD_LABELS[row.campo as TrackedField] ?? row.campo;
  };

  return (
    <>
      <p className="text-caption">
        <Link href="/soggetti" className="rounded-xs text-blue-ink underline underline-offset-2">
          Soggetti
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h2 leading-tight font-semibold break-words">{name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="neutral">{PARTY_TYPE_LABELS[party.tipo]}</Badge>
            {party.categoria && <Badge tone="info">{party.categoria}</Badge>}
            {party.non_contattare && <DoNotContactBadge />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/soggetti/${party.id}/modifica`}>Modifica</ButtonLink>
          <DoNotContactControl
            entita="parties"
            id={party.id}
            partyId={party.id}
            name={name}
            active={party.non_contattare}
            isAdmin={isAdmin}
            initiallyOpen={dialogOpenFor === party.id}
          />
          {isAdmin && <ButtonLink href={`/soggetti/${party.id}/unisci`}>Unisci con un altro</ButtonLink>}
        </div>
      </div>

      {party.non_contattare && (
        <Alert tone="critical" title="Non contattare" className="mt-6">
          Questo soggetto ha chiesto di non essere contattato. I suoi recapiti sono nella lista di esclusione.
        </Alert>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <Section id="dati" title="Dati">
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {company ? (
              <Detail label="Partita IVA">{party.piva ?? "–"}</Detail>
            ) : (
              <Detail label="Codice fiscale">{party.codice_fiscale ?? "–"}</Detail>
            )}
            {tracked("telefono", party.telefono, Boolean(party.telefono))}
            {tracked(
              "email",
              party.email && (
                <a href={`mailto:${party.email}`} className="rounded-xs text-blue-ink underline underline-offset-2">
                  {party.email}
                </a>
              ),
              Boolean(party.email),
            )}
            {company &&
              tracked(
                "sito",
                party.sito && (
                  <a
                    href={/^https?:\/\//i.test(party.sito) ? party.sito : `https://${party.sito}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xs text-blue-ink underline underline-offset-2"
                  >
                    {party.dominio ?? party.sito}
                    <span className="sr-only"> (si apre in una nuova scheda)</span>
                  </a>
                ),
                Boolean(party.sito),
              )}
            {company && party.form_web_url && (
              <Detail label="Canale: form sul sito">
                <a href={party.form_web_url} target="_blank" rel="noopener noreferrer" className="rounded-xs text-blue-ink underline underline-offset-2">
                  Apri il modulo<span className="sr-only"> (si apre in una nuova scheda)</span>
                </a>
              </Detail>
            )}
            {company &&
              tracked("dipendenti_stimati", formatNumber(party.dipendenti_stimati), party.dipendenti_stimati !== null)}
            {company &&
              tracked(
                "parcheggio_privato",
                PRIVATE_PARKING_LABELS[party.parcheggio_privato],
                party.parcheggio_privato !== "non_noto",
              )}
          </dl>
        </Section>

        <Section
          id="sedi"
          title="Sedi"
          action={<ButtonLink href={`/soggetti/${party.id}/sedi/nuova`}>Aggiungi sede</ButtonLink>}
        >
          {locations.length === 0 ? (
            <p className="text-body text-black-60">Nessuna sede inserita.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-grey-60">
              {locations.map((location) => {
                const near = distances.filter((row) => row.location_id === location.id);
                const located = location.lat !== null && location.lng !== null;
                return (
                  <li key={location.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {location.indirizzo ?? "Indirizzo non indicato"}
                        {location.principale && <Badge tone="info">Principale</Badge>}
                      </p>
                      <p className="text-body text-black-80">{[location.cap, location.citta].filter(Boolean).join(" ") || "–"}</p>
                      {location.lat !== null && location.lng !== null ? (
                        <p className="mt-1 text-caption text-black-60">
                          {COORDINATE.format(location.lat)}, {COORDINATE.format(location.lng)} ·{" "}
                          {location.coordinate_fonte === "nominatim" ? (
                            <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="rounded-xs underline underline-offset-2">
                              {OSM_ATTRIBUTION}
                            </a>
                          ) : (
                            "Coordinate inserite a mano"
                          )}{" "}
                          ·{" "}
                          <a
                            href={googleMapsLink(location.lat, location.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xs text-blue-ink underline underline-offset-2"
                          >
                            Apri in Google Maps<span className="sr-only"> (si apre in una nuova scheda)</span>
                          </a>
                        </p>
                      ) : (
                        <p className="mt-1 text-caption text-black-60">Coordinate non calcolate: modifica la sede per cercarle.</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 md:items-end">
                      {located && near.length === 0 && (
                        <p className="text-caption text-black-60">Nessun parcheggio entro {formatKm(maxDistanceM)}</p>
                      )}
                      {near.length > 0 && (
                        <div className="text-caption">
                          <p className="font-semibold text-black-80">
                            Parcheggi attivi entro {formatKm(maxDistanceM)}, in linea d&apos;aria
                          </p>
                          <ul>
                            {near.map((row) => (
                              <li key={row.parking_id} className="tabular-nums">
                                {row.parcheggio}: <strong>{formatDistance(row.distanza_m)}</strong>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <Link
                        href={`/soggetti/${party.id}/sedi/${location.id}/modifica`}
                        className="rounded-xs font-semibold text-blue-ink underline underline-offset-2"
                      >
                        Modifica sede
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section
          id="contatti"
          title="Contatti"
          action={
            <ButtonLink href={`/soggetti/${party.id}/contatti/nuovo`} variant="primary">
              Aggiungi contatto
            </ButtonLink>
          }
        >
          {contacts.length === 0 ? (
            <p className="text-body text-black-60">Nessun contatto inserito.</p>
          ) : (
            <Table caption="Contatti del soggetto">
              <thead>
                <tr>
                  <Th>Referente</Th>
                  <Th>Email</Th>
                  <Th>Telefono</Th>
                  <Th>Canale preferito</Th>
                  <Th>Provenienza</Th>
                  <Th>
                    <span className="sr-only">Azioni</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => {
                  const contactName = [contact.nome, contact.cognome].filter(Boolean).join(" ") || contact.ruolo || "Contatto";
                  return (
                    <Tr key={contact.id}>
                      <Td wrap>
                        <span className="font-semibold">{contactName}</span>
                        {contact.ruolo && (contact.nome || contact.cognome) && (
                          <span className="block text-caption text-black-60">{contact.ruolo}</span>
                        )}
                        {contact.non_contattare && (
                          <span className="mt-1 block">
                            <DoNotContactBadge />
                          </span>
                        )}
                      </Td>
                      <Td>{contact.email ?? "–"}</Td>
                      <Td wrap>{contact.telefono ?? "–"}</Td>
                      <Td>{contact.canale_preferito ? CONTACT_CHANNEL_LABELS[contact.canale_preferito] : "–"}</Td>
                      <Td wrap>
                        <ProvenanceBadge provenance={contactProvenance(contact.id)} />
                      </Td>
                      <Td>
                        <span className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/soggetti/${party.id}/contatti/${contact.id}/modifica`}
                            className="rounded-xs font-semibold text-blue-ink underline underline-offset-2"
                          >
                            Modifica<span className="sr-only"> {contactName}</span>
                          </Link>
                          <DoNotContactControl
                            entita="contacts"
                            id={contact.id}
                            partyId={party.id}
                            name={contactName}
                            active={contact.non_contattare}
                            isAdmin={isAdmin}
                            initiallyOpen={dialogOpenFor === contact.id}
                          />
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Section>

        <Section id="opportunita" title="Opportunità">
          <EmptyState title="Disponibile nei prossimi rilasci" />
        </Section>

        <Section id="provenienza" title="Provenienza dei dati">
          {provenance.length === 0 ? (
            <p className="text-body text-black-60">Nessuna provenienza registrata.</p>
          ) : (
            <Table caption="Provenienza dei dati del soggetto e dei contatti">
              <thead>
                <tr>
                  <Th>Dato</Th>
                  <Th>Stato</Th>
                  <Th>Fonte</Th>
                  <Th>Acquisito il</Th>
                  <Th>Verificato il</Th>
                </tr>
              </thead>
              <tbody>
                {provenance.map((row) => (
                  <Tr key={`${row.entita_id}-${row.campo}`}>
                    <Td wrap>{fieldLabel(row)}</Td>
                    <Td>
                      <Badge tone={row.stato === "verificato" ? "success" : row.stato === "stimato" ? "attention" : "info"}>
                        {DATA_STATUS_LABELS[row.stato]}
                      </Badge>
                    </Td>
                    <Td>{row.fonte ?? "–"}</Td>
                    <Td>{formatDate(row.acquisito_il)}</Td>
                    <Td>{formatDate(row.verificato_il)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <Section id="cronologia" title="Cronologia delle modifiche">
          <HistoryList entries={history} />
        </Section>
      </div>
    </>
  );
}
