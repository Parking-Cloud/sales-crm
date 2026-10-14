-- Block 1a-4: duplicate check of all import rows in one call, for the
-- preview. Same rules as public.check_party_duplicates, plus a block for
-- rows already imported (same sheet and ID_Contatto, kept as an "excel"
-- external reference).
--
-- p_rows: [{ "ref": "...", "externalId": "...", "party": { denominazione,
--   nome, cognome, piva, telefono, email, sito }, "cap": "...", "citta": "..." }]
create function public.check_import_rows(p_rows jsonb)
returns table (ref text, livello text, motivo text, party_id uuid, nome text)
language sql
stable
security invoker
set search_path = ''
as $$
  select r ->> 'ref', d.livello, d.motivo, d.party_id, d.nome
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  cross join lateral public.check_party_duplicates(
    p_denominazione => r -> 'party' ->> 'denominazione',
    p_nome => r -> 'party' ->> 'nome',
    p_cognome => r -> 'party' ->> 'cognome',
    p_piva => r -> 'party' ->> 'piva',
    p_telefono => r -> 'party' ->> 'telefono',
    p_email => r -> 'party' ->> 'email',
    p_sito => r -> 'party' ->> 'sito',
    p_cap => r ->> 'cap',
    p_citta => r ->> 'citta'
  ) d

  union all

  select r ->> 'ref', 'blocco', 'Già importato (stesso foglio e ID)', p.id,
    coalesce(p.denominazione, nullif(btrim(concat_ws(' ', p.nome, p.cognome)), ''))
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  join public.external_references x
    on x.sistema = 'excel' and x.entita = 'parties' and x.id_esterno = r ->> 'externalId'
  join public.parties p on p.id = x.entita_id
$$;

grant execute on function public.check_import_rows(jsonb) to authenticated;
