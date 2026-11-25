-- VAlex Boutique - rollback de secure_finance_fee_config_access.
-- Archive d'urgence, NON APPLIQUEE. Ne pas executer sans autorisation.
--
-- ATTENTION : ce rollback est PARTIEL et non recommande.
-- Il restaure les privileges SELECT anterieurs et supprime la politique
-- reservee aux proprietaires avec AAL2, mais il ne recree pas la politique
-- SELECT qui existait avant le durcissement.
-- RLS reste active sur fee_config : sans politique, les GRANT seuls ne
-- rendent aucune ligne lisible via Data API pour anon ni authenticated.
-- Pour retrouver un acces fonctionnel, restaurer la definition exacte de la
-- politique anterieure depuis une sauvegarde, puis verifier avec pg_policies.
-- A n'utiliser qu'en cas de panne confirmee, avec sauvegarde prealable et
-- autorisation explicite du proprietaire.
--
-- Verification apres execution (lecture seule) :
--   select relrowsecurity from pg_class where oid = 'public.fee_config'::regclass;
--   select polname, roles, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'fee_config';
-- Attendu avec ce fichier seul : RLS active, aucune politique, donc aucune
-- ligne lisible malgre les GRANT. Ce n'est pas un retour fonctionnel complet.

DROP POLICY IF EXISTS fee_config_owner_aal2_select ON public.fee_config;
GRANT SELECT ON TABLE public.fee_config TO anon, authenticated;
GRANT SELECT ON TABLE public.credit_hold_lines TO anon, authenticated;
GRANT SELECT ON TABLE public.pro_capacity_bonus_override TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
