# Contrat complet de l’interface partenaire VAlex

État: **backend non installé et non vérifié**. Cette interface ne prétend pas que les invitations, la réception, la création de boutique, les permissions, le badge ou les commissions fonctionnent.

## Routes SPA

- `#/espace-partenaire` : vue partenaire, compteurs backend, invitations, boutiques accompagnées, commissions non simulées.
- `#/invitation/<secret>` : lien reçu; la valeur est retirée de l’URL dès la lecture puis vérifiée en POST. Elle reste en mémoire seulement le temps de l’action.
- `#/compte` : flux Auth existant pour une personne possédant déjà un compte. Ne jamais appeler `signUp` pour accepter une invitation existante.

## Authentification existante

Réutiliser `window.sb.auth.getUser()`, `signInWithPassword`/OAuth/Google uniquement dans les composants Auth existants et la session Supabase existante. Ne jamais décider l’autorisation à partir de `user_metadata`. Le serveur vérifie `auth.uid()`, email confirmé et identité du marchand. Le mot de passe n’est jamais transmis à l’influenceur ni ajouté au journal.

## Edge Functions

- `valex-influencer-invites`: `send`, `resend`, `cancel`; accepte uniquement influenceur actif validé; envoi confirmé seulement par `{ok:true,...}`; idempotence côté serveur; annulation/renvoi selon les états réels.
- `valex-influencer-invitation`: `verify`, `accept`; vérifie lien, email confirmé et charte; accepte via le compte existant authentifié; ne crée aucun compte Auth ni nouvelle boutique sans RPC/atelier existant.

## RPC

- `influencer_dashboard()`
- `influencer_invitations(p_limit)`
- `influencer_shops(p_limit)`
- `influencer_shop_permissions(p_shop)`
- `merchant_influencer_delegations(p_limit)`
- `merchant_update_influencer_permissions(p_shop,p_permissions)`
- `merchant_revoke_influencer_access(p_shop)`
- `delegated_shop_activity(p_shop,p_limit)`
- `merchant_set_shop_influencer_badge(p_shop,p_visible)`
- `merchant_influencer_shop_setup_status()`
- `merchant_submit_influencer_shop(p_shop)`

Toute autorisation, propriété, permission, révocation, soumission et badge sont vérifiés côté serveur. Les opérations sensibles ne sont jamais présentées comme réussies sans retour réel.

## Parcours marchand

Les étapes affichées sont guidées et ordonnées: connexion avec compte existant, charte, informations boutique, livraison/paiement existants, vrai produit, revue des droits, soumission. Cette interface ne crée pas de boutique ni ne modifie les paiements. La boutique reste privée jusqu’à `approved` côté serveur.

## Badge

Prévoir « Boutique lancée avec [nom public validé] ». Le serveur fournit le nom validé, la valeur réelle de visibilité et vérifie que le marchand en est propriétaire. Le marchand peut masquer le badge. Un nom, une attribution ou un état absent reste indisponible; jamais inventé.

## Commissions

Ne lire que les RPC/backends financiers existants. Ne pas faire de calcul 2 % ni de crédit/déblocage frontend. Préserver le système de portefeuille/referral existant.
