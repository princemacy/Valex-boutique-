## Accès délégués — interface et limites d’intégration

La route frontend `#/acces-delegues` affiche uniquement les lignes normalisées renvoyées par `merchant_influencer_delegations(p_limit)`. Schéma minimal attendu par ligne : `shop_id`, `shop_name`, `influencer_public_name` (validé), `delegation_active`, `last_activity_at`, `base_permissions` et `permissions` (permissions facultatives booléennes effectives).

Le marchand peut proposer la modification d’une permission facultative par `merchant_update_influencer_permissions(p_shop,p_permissions)`. La réponse doit être `{ok:true,...}` après validation transactionnelle du propriétaire et du patch; sinon l’interface affiche une erreur et recharge les droits. Les clés autorisées sont `stock_manage`, `prices_manage`, `orders_manage`, `delivery_manage`, `messages_reply` uniquement.

La révocation utilise `merchant_revoke_influencer_access(p_shop)` après confirmation explicite. Le backend doit vérifier que l’appelant est le propriétaire de la boutique, révoquer atomiquement et immédiatement toutes les opérations suivantes, écrire l’audit tout en conservant l’historique et l’attribution commerciale. Le frontend ne peut pas établir cette garantie : tant que la RPC et ses tests serveur n’existent pas, la révocation est **indisponible/non vérifiée**.

L’historique est lu avec `delegated_shop_activity(p_shop,p_limit)`. Le backend filtre strictement les actions et expurge les contenus privés inutiles, numéros de paiement, mots de passe et détails financiers. L’accès marchand historique persiste après révocation.

Pour l’influenceur, `influencer_shop_permissions(p_shop)` doit renvoyer les droits effectivement accordés (capacités de base, permissions facultatives, `delegation_active`, `last_activity_at`). La vue n’utilise ces droits qu’à titre informatif. Le backend doit aussi vérifier chaque mutation produit dans les fonctions/RPC produit existantes; aucune route d’édition déléguée n’est reliée faute d’inspection et de preuve des contrôles serveur existants. L’interface ne prétend donc pas que les actions produit sont autorisées.

Droits absolument interdits : paiements et destinations MonCash/NatCash, coordonnées bancaires, portefeuille, soldes, retraits, informations financières privées du marchand, email/mot de passe, propriété/suppression de boutique, documents d’identité, administration et sécurité. Ces clés ne sont pas exposées aux composants frontend.
