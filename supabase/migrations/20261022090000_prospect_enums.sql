-- Block 1a-9: types of the prospect model, in their own migration (a value
-- added by ALTER TYPE cannot be used in the same transaction).
--
-- prospect_status: the status of a prospect (spec "Revisione 22/10/2026").
-- pipeline_offer_status: the offer of a prospect + car park pair in the
-- pipeline (the offers table stays for the full offers of phase 2).
-- loss_reason "non_indicato": the reason is optional now; a closed
-- opportunity still needs one, this is it when none was chosen.

create type public.prospect_status as enum ('da_contattare', 'interessato', 'molto_interessato', 'non_interessato');

create type public.pipeline_offer_status as enum ('da_inviare', 'inviata', 'accettata', 'rifiutata');

alter type public.loss_reason add value if not exists 'non_indicato';
