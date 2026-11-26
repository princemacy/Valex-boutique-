# Vérification finale — état de disponibilité du frontend partenaire

**Le code client est une préparation, pas un programme activé.** Les tests locaux doivent couvrir validation email, retours API absents, normalisation stricte, comptes Auth existants, permissions, révocation, provenance des métriques financières et CSP.

État du backend au moment de ce changement : non installé/non vérifié. Sont donc indisponibles jusqu’à preuve de création et tests Supabase : `valex-influencer-invites`, `valex-influencer-invitation`, `influencer_dashboard`, `influencer_invitations`, `influencer_shops`, `influencer_shop_permissions`, `merchant_influencer_delegations`, `merchant_update_influencer_permissions`, `merchant_revoke_influencer_access` et `delegated_shop_activity`.

La vue partenaire ne présente aucun montant de commission. La structure de normalisation peut traiter des métriques server-side, mais l’interface ne rend pas les commissions jusqu’à ce qu’un contrat financier existant et l’autorisation d’exposition soient confirmés.

La vue d’accès délégué affiche les permissions retournées, transmet les modifications et révocations aux RPC prévues et n’accorde aucune permission côté client. Les modifications ne sont **pas sécurisées/actives** tant que les fonctions serveur, RLS et tests de révocation en session ouverte ne sont pas créés et vérifiés. Les opérations produit existantes ne sont pas reliées à une délégation, faute d’inspection et preuve des contrôles serveur correspondants.

Les liens d’invitation, créations de boutique, soumissions, badges et actions d’activité sont des contrats d’intégration préparatoires uniquement. Ne pas les annoncer comme opérationnels sans backend.
