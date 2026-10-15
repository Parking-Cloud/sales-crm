-- Block 1a-8, part C: contacts exported for Crono (CSV built in the
-- browser, never stored on the server).
--
-- crono_export_rows(): one row per contact of the given parties (the party's
-- own address when it has no contacts), with car park and stage of its
-- opportunity (the one on p_parking when given, otherwise the newest open,
-- otherwise the newest) and the email permission. Rows that must never be
-- exported come back flagged with the reason: parties erased for GDPR,
-- parties or contacts "do not contact" or in the suppression list.
-- log_crono_export(): the export in the audit (who, when, how many rows),
-- without the data.

create function public.crono_export_rows(p_parties uuid[], p_parking uuid default null)
returns table (
  party_id uuid,
  contact_id uuid,
  first_name text,
  last_name text,
  job_title text,
  email text,
  phone text,
  company text,
  website text,
  city text,
  parking text,
  stage text,
  email_permission text,
  escluso boolean,
  motivo text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with parties as (
    select p.*,
      p.gdpr_cancellato_il is not null as erased,
      p.non_contattare or public.is_suppressed(array[p.email, p.telefono, p.dominio, p.piva]
        || array(select r.id_esterno from public.external_references r
                 where r.sistema = 'google_places' and r.entita = 'parties' and r.entita_id = p.id)) as blocked
    from public.parties p
    where p.id = any (coalesce(p_parties, '{}')) and p.merged_into_id is null
  ),
  opp as (
    select distinct on (o.party_id) o.party_id, coalesce(f.nome_breve, f.nome) as parking,
      case when o.esito = 'aperta' then public.stage_label(o.fase) when o.esito = 'persa' then 'Persa' else 'Vinta' end as stage
    from public.opportunities o
    join public.parking_facilities f on f.id = o.parking_id
    where o.party_id in (select id from parties)
    order by o.party_id, (p_parking is not null and o.parking_id = p_parking) desc, (o.esito = 'aperta') desc, o.created_at desc
  ),
  city as (
    select distinct on (l.party_id) l.party_id, l.citta
    from public.party_locations l
    where l.party_id in (select id from parties)
    order by l.party_id, l.principale desc, l.created_at
  ),
  people as (
    select p.id as party_id, c.id as contact_id, c.nome, c.cognome, c.ruolo, c.email, c.telefono,
      c.non_contattare or public.is_suppressed(array[c.email] || regexp_split_to_array(coalesce(c.telefono, ''), '\s*,\s*')) as blocked
    from parties p join public.contacts c on c.party_id = p.id
    union all
    -- No contacts: the party's own address.
    select p.id, null, case when p.tipo = 'persona' then p.nome end, case when p.tipo = 'persona' then p.cognome end,
      null, p.email, p.telefono, false
    from parties p
    where not exists (select 1 from public.contacts c where c.party_id = p.id)
  )
  select
    p.id,
    x.contact_id,
    x.nome,
    x.cognome,
    x.ruolo,
    x.email,
    x.telefono,
    coalesce(p.denominazione, nullif(btrim(concat_ws(' ', p.nome, p.cognome)), '')),
    p.sito,
    ci.citta,
    op.parking,
    op.stage,
    coalesce((
      select 'sì - ' || case cp.base when 'richiesta_in_chiamata' then 'richiesta in chiamata'
                                     when 'contatto_in_entrata' then 'ha scritto per primo'
                                     else 'consenso registrato' end
      from public.contact_permissions cp
      where cp.canale = 'email' and cp.stato = 'attivo'
        and ((x.contact_id is not null and cp.contact_id = x.contact_id)
             or (x.contact_id is null and cp.party_id = p.id and cp.contact_id is null))
      order by cp.data desc limit 1
    ), 'no'),
    p.erased or p.blocked or x.blocked,
    case when p.erased then 'Cancellato per richiesta GDPR'
         when p.blocked then 'Soggetto da non contattare o in lista di esclusione'
         when x.blocked then 'Contatto da non contattare o in lista di esclusione' end
  from parties p
  join people x on x.party_id = p.id
  left join opp op on op.party_id = p.id
  left join city ci on ci.party_id = p.id
  order by 8, x.cognome nulls first, x.nome
$$;

grant execute on function public.crono_export_rows(uuid[], uuid) to authenticated;

create function public.log_crono_export(p_righe integer, p_escluse integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.audit_logs (utente_id, entita, entita_id, azione, prima, dopo)
  values (auth.uid(), 'esportazione_crono', null, 'insert', null,
          jsonb_build_object('righe_esportate', greatest(coalesce(p_righe, 0), 0), 'righe_escluse', greatest(coalesce(p_escluse, 0), 0)));
end;
$$;

revoke all on function public.log_crono_export(integer, integer) from public;
grant execute on function public.log_crono_export(integer, integer) to authenticated;
