-- Block 1a-9: "Soggetti" is called "Prospect" in the interface. Messages the
-- database returns to the screens change the same way; tables and code keep
-- their names. Each function is recreated from its current definition with
-- the texts replaced (the replacement must happen, or the migration fails).
-- The functions of the disabled features (import, cadences) are left as
-- they are.

do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select * from (values
      ('public.add_to_parking(uuid[], uuid, public.opportunity_stage, text)', 'Soggetto non trovato', 'Prospect non trovato'),
      ('public.add_to_parking(uuid[], uuid, public.opportunity_stage, text)', 'Soggetto unito a un altro', 'Prospect unito a un altro'),
      ('public.add_to_parking(uuid[], uuid, public.opportunity_stage, text)', 'Soggetto da non contattare', 'Prospect da non contattare'),
      ('public.export_party_rows(uuid[], uuid)', 'Soggetto da non contattare o in lista di esclusione', 'Prospect da non contattare o in lista di esclusione'),
      ('public.email_eligibility(uuid, uuid)', 'Il soggetto è da non contattare', 'Il prospect è da non contattare'),
      ('public.email_eligibility(uuid, uuid)', 'email del soggetto', 'email del prospect'),
      ('public.email_eligibility(uuid, uuid)', 'telefono del soggetto', 'telefono del prospect'),
      ('public.email_eligibility(uuid, uuid)', 'dominio del soggetto', 'dominio del prospect'),
      ('public.email_eligibility(uuid, uuid)', 'partita IVA del soggetto', 'partita IVA del prospect'),
      ('public.email_eligibility(uuid, uuid)', 'luogo Google del soggetto', 'luogo Google del prospect'),
      ('public.gdpr_erase(text, uuid)', 'Soggetto cancellato (GDPR)', 'Prospect cancellato (GDPR)')
    ) as t (fn, old_text, new_text)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_new := replace(v_def, '''' || r.old_text || '''', '''' || r.new_text || '''');
    if v_new = v_def then
      raise exception 'text "%" not found in %', r.old_text, r.fn;
    end if;
    execute v_new;
  end loop;
end;
$$;

-- Prospects already erased carry the placeholder as their name.
update public.parties
set denominazione = 'Prospect cancellato (GDPR)'
where gdpr_cancellato_il is not null and denominazione = 'Soggetto cancellato (GDPR)';
