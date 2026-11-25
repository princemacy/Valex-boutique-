-- VAlex Boutique - rollback de secure_finance_fee_config_access.
-- Archive d'urgence, NON APPLIQUEE. Ne pas executer sans autorisation.
--
-- ATTENTION : ce rollback restaure un etat moins sur qu'avant le durcissement.
-- Il redonne a anon et authenticated la lecture directe de fee_config,
-- credit_hold_lines et pro_capacity_bonus_override, et supprime la politique
-- reservee aux proprietaires avec AAL2. A n'utiliser que si la migration
-- appliquee le 25 novembre 2026 (20261125113651) provoque une panne confirmee,
-- avec sauvegarde prealable et autorisation explicite.
--
-- RLS reste active ; sans politique, les lignes restent non visibles via
-- Data API pour les roles concernes une fois le GRANT seul insuffisant.
-- Ce fichier n'est pas une procedure de retour arriere recommandee.

DROP POLICY IF EXISTS fee_config_owner_aal2_select ON public.fee_config;
GRANT SELECT ON TABLE public.fee_config TO anon, authenticated;
GRANT SELECT ON TABLE public.credit_hold_lines TO anon, authenticated;
GRANT SELECT ON TABLE public.pro_capacity_bonus_override TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
