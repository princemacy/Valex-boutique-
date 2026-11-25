-- Archive de la definition de public.ad_home() observee en production
-- le 24 novembre 2026, avant la migration
-- sql/2026-11-24-ad-home-shop-name.sql.
--
-- Ce fichier sert uniquement au retour arriere. Il ne doit pas etre applique
-- en dehors d'une restauration explicitement autorisee.
--
-- La nouvelle fonction change le type de retour (ajout de shop_id et
-- shop_name) : un simple CREATE OR REPLACE echouerait. Le DROP ci-dessous est
-- donc necessaire pour revenir a l'ancien contrat.

drop function if exists public.ad_home();

create or replace function public.ad_home()
returns table (
  slot_no integer,
  kind text,
  title text,
  image_path text,
  target_url text,
  tier text,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  remaining_seconds bigint
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
    greatest(extract(epoch from (c.ends_at - now()))::bigint, 0)
  from public.ad_slots as s
  join lateral (
    select
      c2.title,
      c2.image_path,
      c2.target_url,
      c2.tier,
      c2.starts_at,
      c2.ends_at
    from public.ad_campaigns as c2
    where c2.slot_no = s.slot_no
      and c2.status = 'active'
      and c2.moderation_status = 'approved'
      and c2.starts_at <= now()
      and c2.ends_at > now()
    order by c2.starts_at desc, c2.id
    limit 1
  ) as c on true
  where s.is_active
    and s.kind = 'paid'
    and s.slot_no between 3 and 10
  order by s.slot_no;
end
$function$;

revoke all on function public.ad_home() from public;
grant execute on function public.ad_home() to anon, authenticated, service_role;
