-- Block 1a-7: new enum values, in their own migration (a value added by
-- ALTER TYPE cannot be used in the same transaction).
--
-- loss_reason "non_contattare": opportunities closed because the party or
-- the contact opposed being contacted (C1), when no listed reason fits.
-- suppression_type "piva" and "place_id": the suppression list also blocks
-- by VAT number and Google place (C1, C3).

alter type public.loss_reason add value if not exists 'non_contattare';
alter type public.suppression_type add value if not exists 'piva';
alter type public.suppression_type add value if not exists 'place_id';
