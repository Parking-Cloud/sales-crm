-- Block 1a-9: the reminders still open from "Oggi" (tasks) are no longer
-- shown anywhere. Each one becomes a line at the end of its prospect's notes,
-- "Promemoria precedente: <dd/mm/yyyy> – <text>" (date in Europe/Rome, text =
-- title and note of the reminder), in date order; then the reminder is
-- closed. The audit records the changed notes and tasks.

with open_reminders as (
  select t.id,
    coalesce(t.party_id, o.party_id) as party_id,
    t.scadenza,
    t.created_at,
    'Promemoria precedente: '
      || coalesce(to_char(t.scadenza at time zone 'Europe/Rome', 'DD/MM/YYYY'), 'senza data')
      || ' – ' || btrim(t.titolo)
      || coalesce(' – ' || nullif(btrim(t.nota), ''), '') as riga
  from public.tasks t
  left join public.opportunities o on o.id = t.opportunity_id
  where t.completata_il is null
),
lines as (
  select party_id, string_agg(riga, E'\n' order by scadenza nulls last, created_at) as righe
  from open_reminders
  where party_id is not null
  group by party_id
)
update public.parties p
set note = left(coalesce(nullif(btrim(p.note), '') || E'\n', '') || l.righe, 5000),
    note_modificate_il = now(),
    note_modificate_da = null
from lines l
where l.party_id = p.id;

update public.tasks t
set completata_il = now()
where t.completata_il is null
  and coalesce(t.party_id, (select o.party_id from public.opportunities o where o.id = t.opportunity_id)) is not null;
