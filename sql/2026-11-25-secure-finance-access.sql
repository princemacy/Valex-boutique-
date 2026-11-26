-- VAlex Boutique - migration appliquee en production le 25 novembre 2026.
-- Historique Supabase : 20261125113651 / secure_finance_fee_config_access.
-- Ne pas rejouer ce fichier sans autorisation : il est conserve comme source
-- de verite de l'etat deploye et comme reference de revue.
--
-- finance.js charge fee_config uniquement dans la page proprietaire.
-- La lecture est reservee a authenticated avec public.is_owner()
-- (admin/owner + AAL2). Les tables de support de credit/bonus restent
-- internes aux fonctions serveur.
--
-- Verification apres application (lecture seule) :
--   select relname, relacl
--     from pg_class
--    where relname in ('fee_config', 'credit_hold_lines',
--                      'pro_capacity_bonus_override');
--   select polname, roles, cmd
--     from pg_policies
--    where schemaname = 'public' and tablename = 'fee_config';
--   select public.is_owner();
-- Attendu : anon sans SELECT sur fee_config, politique
-- fee_config_owner_aal2_select pour authenticated avec public.is_owner(),
-- aucune lecture anon/authenticated directe sur credit_hold_lines et
-- pro_capacity_bonus_override.

REVOKE SELECT ON TABLE public.fee_config FROM anon;

DROP POLICY IF EXISTS fee_config_owner_aal2_select ON public.fee_config;
CREATE POLICY fee_config_owner_aal2_select
ON public.fee_config
FOR SELECT
TO authenticated
USING (public.is_owner());

REVOKE SELECT ON TABLE public.credit_hold_lines FROM anon, authenticated;
REVOKE SELECT ON TABLE public.pro_capacity_bonus_override FROM anon, authenticated;

COMMENT ON POLICY fee_config_owner_aal2_select ON public.fee_config IS
  'Lecture de la configuration des frais reservee aux proprietaires/admins avec AAL2 via public.is_owner().';

NOTIFY pgrst, 'reload schema';
