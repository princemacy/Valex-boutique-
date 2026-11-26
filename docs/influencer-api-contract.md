# Contrat d’intégration — programme partenaire VAlex

**État : contrat préparatoire, backend non installé.** Ce document ne décrit pas une fonctionnalité active. Les RPC et Edge Functions nommées ci-dessous sont des propositions de contrat à implémenter et vérifier dans Supabase avant toute intégration en production. Le frontend doit afficher un message neutre d’indisponibilité si elles manquent ; il ne crée ni invitation, ni boutique, ni attribution, ni commission de remplacement.

Ce contrat est destiné au dépôt public `princemacy/Valex-boutique-`. Il ne demande ni ne contient de secret. Ne pas modifier les migrations déjà appliquées, l’énumération `public.user_role`, les RPC financières ou les attributions existantes dans le cadre de ce contrat.

## Principes transversaux

- Un commerçant garde son compte Auth, son profil et sa propriété de boutique existants. Une invitation ne crée jamais un deuxième compte.
- Authentification par session VAlex existante (`window.sb.auth`). Le serveur doit identifier l’acteur depuis le JWT validé, jamais depuis `user_metadata`, un `user_id` fourni par le client ou un champ de rôle envoyé par le navigateur.
- Toutes les op��rations exigent une vérification d’autorisation côté serveur et des politiques RLS adaptées. La révocation doit s’appliquer aux appels suivants même pour une session déjà ouverte.
- Aucun accès client direct aux tables d’invitation, de délégation, d’activité ou de commissions n’est prévu par ce contrat. Les RPC renvoient uniquement les champs nécessaires au rôle appelant.
- Les opérations mutantes vérifient l’état courant, l’identité et les droits en transaction serveur. Les commandes répétées doivent être idempotentes lorsque possible.
- Aucun jeton d’invitation dans une URL query, un log, l’analytics, le stockage navigateur ou le journal d’activité. Le lien doit être à usage unique, à durée limitée, révocable et transporté vers le backend en POST.
- Le navigateur ne calcule, crédite, débloque ni estime une commission. Les valeurs d’affichage viennent exclusivement d’une réponse backend vérifiée.
- Les fonctions financières et le portefeuille existants restent la source de vérité. Les règles définitives (2 %, douze mois à compter de l’approbation publique, base hors livraison, commande créée dans la fenêtre et commission due après paiement/livraison/confirmation client, annulations et remboursements exclus ou corrigés selon le système existant) nécessitent un travail serveur distinct. Aucune finance n’est changée par ce frontend.

## Permissions et délégations

### Capacités de base prévues

- `products_create`
- `products_edit`
- `products_publish`
- `ai_assist`
- `referral_tools` — utiliser les outils de parrainage propres à l’utilisateur, sans écriture sur les attributions de boutique existantes.

### Permissions facultatives contrôlées par le marchand

- `stock_manage`
- `prices_manage`
- `orders_manage`
- `delivery_manage`
- `messages_reply`

Les permissions de base ne confèrent jamais un accès propriétaire. Le serveur fixe la politique de base et valide chaque action par rapport à la délégation active. Les permissions facultatives ne s’appliquent qu’à la boutique désignée.

### Permissions jamais délégables

MonCash/NatCash, coordonnées bancaires, paiements et destinations de paiement, portefeuille, soldes, retraits, données financières privées du marchand, email ou mot de passe du propriétaire, transfert de propriété, suppression de boutique, documents d’identité, rôles administratifs et paramètres de sécurité. Le schéma backend doit refuser explicitement ces champs, même si un client les envoie. Ils ne sont pas exposés par le module API.

### Révocation et historique

La révocation retire immédiatement le droit de mutation pour les opérations ultérieures, sans effacer l’attribution de parrainage ni l’historique. Une décision de suspension pour fraude relève de l’administration. Le journal d’audit contient seulement l’acteur, la boutique, l’action, l’identifiant d’objet strictement utile, l’horodatage et un résumé expurgé. Pas de secrets, mot de passe, données de paiement, détails financiers privés ou contenus privés non nécessaires.

Événements pris en charge : produit créé/modifié/supprimé, stock modifié, prix modifié, commande gérée, livraison modifiée, message envoyé, permission modifiée et accès révoqué.

## Contrats Edge Functions

Toutes les réponses suivent `{ "ok": true, ... }` ou une erreur HTTP non-2xx avec un code et un message neutre. L’absence de fonction est une indisponibilité, pas une réussite. Les fonctions doivent exiger une session authentifiée sauf vérification limitée du lien, appliquer une limitation de débit et ne jamais renvoyer les secrets de service.

### `valex-influencer-invites` — POST authentifié

Actions : `send`, `resend`, `cancel`.

- `send`: `{ action, email, idempotency_key }`. Le serveur confirme que l’appelant est un influenceur autorisé et actif, applique l’unicité/idempotence, crée l’invitation, envoie le message et renvoie le statut réellement constaté, l’identifiant, les dates de création/expiration et un code d’état d’envoi. Ne jamais afficher un succès avant l’envoi confirmé. Ne pas révéler si une adresse a déjà un compte ; le destinataire existant doit pouvoir se connecter avec son compte.
- `resend`: `{ action, invitation_id, idempotency_key }`. Réservé à l’influenceur propriétaire de l’invitation ; refuser invitation acceptée, annulée ou expirée selon la politique serveur. Retourner l’état d’envoi réel.
- `cancel`: `{ action, invitation_id, idempotency_key }`. Réservé à l’influenceur propriétaire et aux états annulables. L’opération est idempotente et conserve une trace d’audit.

Le serveur crée un token aléatoire robuste, n’en conserve qu’une empreinte vérifiable si possible, fixe la durée de validité (valeur à décider par VAlex et à exposer par configuration/contrat de réponse), invalide les tokens remplacés et masque les erreurs d’envoi. Le token n’est jamais écrit dans les logs.

### `valex-influencer-invitation` — POST

- `verify`: `{ action: "verify", token }`. Vérifie le token côté serveur et retourne email masqué, validité/expiration, charte courante et un indicateur indiquant si une authentification est requise. Aucune identité de compte n’est révélée avant la connexion.
- `accept`: `{ action: "accept", token, charter_version, charter_accepted: true }`, session authentifiée obligatoire. Le serveur exige un email Auth confirmé et correspondant à l’invitation, résout l’identité existante et lie la boutique au `auth.uid()` existant. Ne reçoit aucun mot de passe et ne crée aucun compte Auth. Le marchand confirme les permissions et termine le parcours de boutique via les parcours existants ; la boutique reste privée jusqu’à validation administrative (`approved`). L’acceptation doit être atomique, à usage unique et idempotente.

Si l’adresse correspond à un compte confirmé déjà existant, le parcours demande une connexion et l’acceptation par ce compte. Ne pas utiliser un flux d’inscription séparé comme solution de repli.

## Contrats RPC authentifiés

Les RPC renvoient des JSON versionnés (`contract_version`) ou des lignes documentées. Elles utilisent l’identité de session; elles n’acceptent jamais un `user_id` arbitraire.

| RPC | Rôle attendu | Entrées | Sortie minimale |
|---|---|---|---|
| `influencer_dashboard()` | Influenceur actif validé par VAlex | aucune | compteurs d’invitations, états de boutiques, ventes éligibles et commissions réelles pending/available issus du backend. Pas de calcul client. |
| `influencer_invitations(p_limit)` | Influenceur actif | limite 1–100 | invitations du seul appelant : id, email (selon politique de confidentialité), status (`pending`, `accepted`, `expired`, `cancelled`, `send_error`), created_at, expires_at, accepted_at. Aucun token ni lien. |
| `influencer_shops(p_limit)` | Influenceur actif | limite 1–100 | boutiques associées serveur : id, name, status, launched_at, product_count, activity réelle, état de délégation, commissions réelles renvoyées par la source financière et visibilité du badge. |
| `influencer_shop_permissions(p_shop)` | Influenceur délégué actif, permissions strictement bornées | UUID de boutique | capacités de base, permissions facultatives effectivement accordées, statut actif et dernière activité. Aucun champ financier/sensible. |
| `merchant_influencer_delegations(p_limit)` | Marchand propriétaire authentifié | limite 1–100 | délégations des boutiques possédées : nom public validé, boutique, permissions actuelles, statut, dernière activité. |
| `merchant_update_influencer_permissions(p_shop, p_permissions)` | Marchand propriétaire de la boutique | UUID + patch de permissions facultatives | permissions persistées et résultat réel. Refuser toute clé inconnue/interdite et journaliser le changement. |
| `merchant_revoke_influencer_access(p_shop)` | Marchand propriétaire de la boutique | UUID de boutique | révocation persistée et timestamp. Doit être effective immédiatement, idempotente, auditable et ne pas supprimer `referral_attributions`. |
| `delegated_shop_activity(p_shop, p_limit)` | Marchand propriétaire; éventuellement influenceur encore autorisé avec visibilité limitée | UUID + limite 1–100 | événements autorisés, expurgés, du plus récent au plus ancien. Les événements restent consultables après révocation par le marchand. |

Le tableau de bord et les boutiques doivent renvoyer des montants en unités entières, devise et état selon un format documenté. Ils n’exposent aucune coordonnée de paiement ni détail comptable du marchand. Les lignes financières ne peuvent être lues qu’après application des règles d’éligibilité par les fonctions financières approuvées.

## Contrat frontend préparé

- `site/influencer-core.mjs`: validation d’email, normalisation stricte des réponses, libellés, liste blanche de permissions, prévention de la synthèse de compteurs/commissions et fonctions d’état pures.
- `site/influencer-api.js`: centralisation des RPC/Edge Function ci-dessus, délégation à la session `window.sb` existante, erreurs explicites de backend absent, aucune clé secrète et aucun accès direct aux tables.
- Aucun module ne crée un rôle, un compte, une boutique, une permission persistante, une attribution ou une commission.
- L’intégration aux vues et composants de `site/index.html` est différée : le point d’insertion Auth/routage précis n’a pas été confirmé par l’inspection disponible. Le fichier ne doit pas être reconstruit.

## Charte versionnée à collecter

Avant le premier envoi, le backend exige l’acceptation d’une version de charte par un influenceur administrativement validé : action exclusivement pour le marchand dans les limites des permissions; interdiction de détourner des paiements ou de créer de fausses commandes/boutiques; possibilité de suspension administrative pour fraude; aucune commission en dehors des règles publiées. Conserver version, acteur et timestamp côté serveur. Les liens ne sont pas publiés dans les analytics.

## Déploiement backend ultérieur

1. Concevoir le modèle de données et politiques RLS sans toucher aux migrations déjà appliquées; proposer toute migration nouvelle dans une passe dédiée avec revue et autorisation.
2. Implémenter les Edge Functions/RPC avec tests d’identité, unicité, idempotence, limitation d’envoi, propriétaire, permissions sensibles, révocation, confidentialité, audit et comptes existants.
3. Vérifier les règles de commission dans la couche financière existante, sans portefeuille parallèle et sans frontend financier.
4. Déployer d’abord sur un environnement autorisé/non-production, valider avec comptes de test dédiés et examiner les politiques RLS.
5. Déployer le frontend uniquement après confirmation des fonctions, contrats, tests et autorisation de déploiement distincte.

À ce stade, le backend de ce programme est **indisponible / non vérifié**. Aucun appel n’est présenté comme opérationnel tant que les fonctions ne sont pas installées et testées.
