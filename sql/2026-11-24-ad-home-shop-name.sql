-- VAlex - contrat public de la page d'accueil publicitaire.
--
-- STATUT : APPLIQUEE en production le 25 novembre 2026.
-- Version Supabase : 20261125113318 / ad_home_shop_name_contract.
-- Ne pas rejouer ce fichier sans autorisation : il contient le DROP/CREATE
-- historique de l'application. Le fichier est conserve comme source de verite
-- du contrat deploye et comme reference de revue.
--
-- Objectif : ne jamais fabriquer d'annonce. `ad_home()` ne renvoie que les
-- campagnes payantes reellement actives, approuvees, commencees et non
-- expirees, avec le nom reel de la boutique pour l'attribution « de [nom] ».
--
-- Cette migration remplace la version precedente dont le type de retour ne
-- contenait pas shop_id/shop_name. Aucune donnee n'est modifiee.
--
-- Le DROP est necessaire : PostgreSQL refuse de changer le type de retour
-- d'une fonction avec CREATE OR REPLACE.
-- Rollback : reappliquer la definition precedente (archivee dans
-- sql/archive/ad_home_2026-11-23.sql) puis recharger le cache PostgREST.
--
-- Verification apres application (lecture seule). `ad_home` est une fonction :
-- information_schema.columns ne la voit pas. Utiliser pg_get_function_result :
--   select pg_get_function_result('public.ad_home()'::regprocedure);
--   select has_function_privilege('anon', 'public.ad_home()', 'EXECUTE');
--   select * from public.ad_home();
-- Attendu : shop_id et shop_name presents, 0 ligne si aucune campagne payante
-- active et approuvee, aucune erreur pour le role anon.

begin;

drop function if exists public.ad_home();

create function public.ad_home()
returns table (
  slot_no integer,
  kind text,
  title text,
  image_path text,
  target_url text,
  tier text,
  starts_at timestamptz,
  ends_at timestamptz,
  remaining_seconds bigint,
  shop_id uuid,
  shop_name text
)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform private.take_limit('ad_home', 1200, interval '10 minutes');

  return query
  select
    s.slot_no,
    'paid'::text as kind,
    c.title,
    c.image_path,
    c.target_url,
    c.tier,
    c.starts_at,
    c.ends_at,
    greatest(extract(epoch from (c.ends_at - now()))::bigint, 0) as remaining_seconds,
    sh.id as shop_id,
    sh.name as shop_name
  from public.ad_slots as s
  join lateral (
    select c2.title, c2.image_path, c2.target_url, c2.tier,
           c2.starts_at, c2.ends_at, c2.shop_id
    from public.ad_campaigns as c2
    where c2.slot_no = s.slot_no
      and c2.status = 'active'
      and c2.moderation_status = 'approved'
      and c2.starts_at <= now()
      and c2.ends_at > now()
    order by c2.starts_at desc, c2.id
    limit 1
  ) as c on true
  join public.shops as sh on sh.id = c.shop_id
  where s.is_active
    and s.kind = 'paid'
    and s.slot_no between 3 and 10
    and sh.is_active
    and sh.status = 'approved'
    and sh.is_demo = false
  order by s.slot_no;
end;
$function$;

revoke all on function public.ad_home() from public;
grant execute on function public.ad_home() to anon, authenticated, service_role;

comment on function public.ad_home() is
  'Annonces payantes actives et approuvees uniquement, avec le nom reel de la boutique. Aucune annonce maison, aucun champ de paiement.';

commit;

-- Recharge le cache de schema PostgREST pour que le nouveau type de retour
-- soit visible immediatement par l'API.
notify pgrst, 'reload schema';
