# Passation VAlex, branche publique du 25 novembre 2026

## 1. Objet

Cette branche rend consultables les corrections realisees sur le depot public
`princemacy/Valex-boutique-`. Elle ne fusionne rien et ne deploie rien.

- Depot : `princemacy/Valex-boutique-` (public)
- Branche : `fix/valex-p0-p3-20261124`
- Base : `44bea72` (`main` au moment du travail)
- Cible de revue : `main`
- Pull request DRAFT : `https://github.com/princemacy/Valex-boutique-/pull/1`
- Site concerne : `https://valexboutique.store`

Deux migrations ont ete appliquees en production par une session anterieure,
le 25 novembre 2026, avec autorisation du proprietaire. Cette passe les
documente, aligne le depot public sur l'etat deploye et corrige la requete de
verification erronee. Aucune migration n'a ete rejouee.

## 2. Commits de la branche

| Commit | SHA complet | Contenu |
| --- | --- | --- |
| `723bba5` | `723bba561049a8dbe925543f5552c419ae21d8a2` | Site : GDS, publicites reelles, Pro dynamique, GIS, PWA, Worker 404 et garde-fou de chargement |
| `d1707d5` | `d1707d5bab2d4ce11f865c6934dc50afcf1f3d81` | SQL : migration `ad_home` avec `shop_id` et `shop_name`, archive de rollback |
| `5da6eef` | `5da6eefb962c4393b0dbeff8a17a0a69034ceea1` | Tests : 16 controles site, SQL, CI et securite |
| `b76f773` | `b76f7732a163bcd34c1b63f4d6e61c9adc4ce6f2` | CI et documentation : `verify.yml`, suppression de `publish.yml`, README, DEPLOYMENT, lockfile |

La passe du 25 novembre 2026 ajoute les artefacts finance, les tests
correspondants et cette mise a jour de passation. Son SHA est visible avec
`git log -- HANDOFF_FOR_CHATGPT.md`.

Aucun commit n'a ete pousse sur `main`. Aucun merge n'a ete effectue.

## 3. Fichiers ajoutes, modifies et retires

### Ajoutes

- `site/pwa.js` : inscription unique du service worker, banniere Android et
  iOS, indicateur hors ligne, blocage des mutations Supabase hors ligne.
- `sql/2026-11-24-ad-home-shop-name.sql` : contrat `ad_home` avec
  `shop_id`/`shop_name`, APPLIQUE le 25/11/2026 (version `20261125113318`).
- `sql/2026-11-25-secure-finance-access.sql` : durcissement finance APPLIQUE
  le 25/11/2026 (version `20261125113651`).
- `sql/archive/ad_home_2026-11-23.sql` : definition precedente pour rollback.
- `sql/archive/finance_rls_rollback_2026-11-25.sql` : rollback finance
  archive, NON APPLIQUE, avec avertissement sur la perte de securite.
- `tests/site.test.mjs` : 18 tests.
- `DEPLOYMENT.md` : deploiement Workers Builds et retour arriere.
- `package-lock.json` : installation reproductible avec `npm ci`.

### Modifies

- `site/index.html` : prix en GDS, offres Pro dynamiques, Google Identity
  Services, garde-fou de chargement, etat vide video, erreurs neutres.
- `site/_worker.js` : CSP Google, vraies 404 produit et boutique, routes
  `/a-propos` et `/faq` sans boucle, sitemap resilient, `noindex, nofollow`.
- `site/_headers` : hash CSP synchronise.
- `site/ads-core.mjs` et `site/ads.js` : uniquement des campagnes payantes
  actives, avec le nom reel de la boutique, sans fallback VAlex.
- `site/agent.js`, `site/dispute-core.mjs`, `site/refunds-core.mjs`,
  `site/wallet-core.mjs` : affichage en GDS.
- `site/push.js` : reutilise l'inscription unique du service worker.
- `site/sw.js` : cache statique versionne, aucune donnee utilisateur.
- `.github/workflows/verify.yml` : verification sans deploiement.
- `README.md` : publication par Workers Builds, pas de secret dans Actions.
- `package.json` : scripts `check`, `test` et `dry-run`.

### Retire

- `.github/workflows/publish.yml` : second systeme de deploiement supprime.
  Workers Builds reste le seul mecanisme de publication de `main`.

## 4. Corrections principales

1. **Monnaie** : tous les prix visibles sont en GDS. Le selecteur HTG, USD et
   DOLA a ete supprime. `HTG` ne reste que dans certains champs stockes et
   dans `priceCurrency` du JSON-LD, jamais dans un libelle d'interface.
2. **Publicites** : `ad_home()` ne renvoie que des campagnes payantes actives,
   approuvees, commencees et non expirees. Le frontend masque le bloc s'il n'y
   a aucune campagne. Aucune annonce VAlex, aucun badge, aucun compteur et
   aucune fausse attribution.
3. **Offres Pro** : les plans, packs de credits, couts et prix de capacite sont
   lus depuis la base. La constante `PRO`, le prix annuel invente, la mention
   « 2 mois offerts », « 15 questions par jour », `VALEX_PAY` et le faux
   numero ont ete retires.
4. **Google Identity Services** : integration avec nonce, `signInWithIdToken`
   et repli OAuth. La CSP autorise `https://accounts.google.com` et le hash du
   script inline est synchronise entre `site/_headers` et `site/_worker.js`.
5. **PWA** : une seule inscription du service worker. Banniere Android et iOS,
   badge hors ligne, refus des mutations Supabase hors ligne. Le cache ne
   contient que des assets statiques versionnes.
6. **Worker** : un produit ou une boutique inexistant renvoie une vraie 404.
   Les routes `/a-propos` et `/faq` ne bouclent plus. Le sitemap reste
   disponible meme si Supabase echoue. Les pages d'erreur sont en
   `noindex, nofollow`.
7. **Chargement** : apres 12 secondes de skeleton ou de spinner visible, une
   barre « Le chargement prend plus de temps que prevu » propose « Reessayer ».
   L'etat vide du fil video affiche « Aucune video disponible ».
8. **Erreurs** : les appels navigateur a `expire_pending_orders()` ont ete
   retires. Les erreurs utilisateur sont neutres avec un code `VX-XXXX` et les
   journaux sont masques.
9. **Finance** : `fee_config` n'est plus lisible par `anon`. La lecture est
   reservee a `authenticated` via `public.is_owner()` (admin/owner + AAL2).
   `credit_hold_lines` et `pro_capacity_bonus_override` ne sont plus lisibles
   directement par `anon` ni `authenticated`.

## 5. Etat des migrations en production

### 5.1 `ad_home` (version `20261125113318`)

Statut : APPLIQUEE le 25 novembre 2026. Ne pas rejouer.

Verification en lecture seule, executee depuis la session d'audit :

```sql
select pg_get_function_result('public.ad_home()'::regprocedure);
select has_function_privilege('anon', 'public.ad_home()', 'EXECUTE');
select * from public.ad_home();
```

Preuves observees :

- 11 colonnes de retour, dont `shop_id uuid` et `shop_name text` ;
- `security definer`, `search_path=pg_catalog` ;
- EXECUTE accorde a `anon`, `authenticated` et `service_role` ;
- `ad_home()` renvoie 0 ligne : `ad_campaigns = 0` et la seule boutique
  existante est `pending`, donc non approuvee ;
- `shops` contient 1 ligne reelle : `is_demo=false`, `status=pending`,
  `is_active=true`. Ce n'est pas une boutique fictive et elle n'apparait pas
  via `ad_home()`. La cible de lancement a 0 boutique n'est pas atteinte ;
  ne pas supprimer cette ligne sans autorisation du proprietaire ;
- 8 emplacements `ad_slots` actifs, tous de type paye, 0 emplacement maison.

La requete precedente fondee sur `information_schema.columns` avec
`table_name = 'ad_home'` etait erronee : `ad_home` est une fonction, pas une
table. Elle est remplacee par `pg_get_function_result(...)` dans le fichier SQL
et couverte par un test.

### 5.2 Finance (version `20261125113651`)

Statut : APPLIQUEE le 25 novembre 2026. Ne pas rejouer.

Preuves observees :

- `fee_config` : 4 lignes, 2 actives ; la colonne de statut est `active` ;
- politique `fee_config_owner_aal2_select` presente pour `authenticated` avec
  `public.is_owner()` ;
- `anon` n'a plus SELECT sur `fee_config` ; `authenticated` conserve SELECT
  sous la politique ;
- `credit_hold_lines` et `pro_capacity_bonus_override` : plus de SELECT pour
  `anon` ni `authenticated` ;
- `public.is_owner()` = `has_role(['admin','owner']) AND current_aal()='aal2'`.

Le rollback finance est archive dans
`sql/archive/finance_rls_rollback_2026-11-25.sql`. Il est PARTIEL et non
recommande : il restaure les GRANT SELECT et supprime la politique AAL2, mais
ne recree pas la politique anterieure. RLS restant actif sur `fee_config`,
les GRANT seuls ne rendent aucune ligne lisible via Data API. Pour un retour
fonctionnel, restaurer la definition exacte de la politique precedente depuis
une sauvegarde, avec autorisation explicite.

## 6. Commandes executees et resultats

Toutes les commandes de verification locale sont executees dans
`/tmp/opencode/valex-public`.

| Commande | Resultat | Preuve |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS | installation depuis `package-lock.json` |
| `npm run check` | PASS | fichiers analyses, textes, secrets, hash CSP, syntaxe |
| `npm test` | PASS | 18 tests, 18 pass, 0 fail |
| `WRANGLER_SEND_METRICS=false npm run dry-run` | PASS | build local, aucune publication |
| Validation YAML de `verify.yml` | PASS | jobs et etapes conformes |
| `node --check` du script inline | PASS | aucune erreur de syntaxe |
| `git diff --check` | PASS | aucune erreur d'espace |
| Scan de secrets dans l'arbre | PASS | aucun jeton ; seules les mentions du role `service_role` |
| `gh secret list` sur le depot public | PASS | 0 secret GitHub Actions |
| Check-run Verify sur la branche | PASS | `verify` en `success` ; 1 avertissement Node.js 20 (actions/checkout@v4 et setup-node@v4) |
| Check-run Workers Builds sur la branche | FAIL | `Preview creation failed: This Worker does not exist on your account`, build `86b26e65-fa89-41b4-8d39-9629ce1841ee` |
| Site public apres push de la branche | PASS | hash CSP `sha256-UKNOT...` et prix HTG conserves, production inchangee |
| Protection de `main` | Observation | branche non protegee au moment du controle |

## 7. Deploiement

- Deploiement de production : NOT DONE, volontairement.
- Merge vers `main` : NOT DONE, volontairement.
- Push de la branche et PR DRAFT : effectues. PR :
  `https://github.com/princemacy/Valex-boutique-/pull/1`.
- Workers Builds est relie au depot public et a `main`. Un push sur une branche
  ou une PR non fusionnee ne deploie pas.
- GitHub Actions ne deploie pas et ne demande aucun secret Cloudflare.
- `publish.yml` a ete supprime pour eviter un second systeme de deploiement.

### Workers Builds sur la branche

Malgre la desactivation des previews, le check-run `Workers Builds:
valexboutique` echoue encore sur un push de branche. Le message public est
explicite :

```text
Preview creation failed: This Worker does not exist on your account.
Build ID: 86b26e65-fa89-41b4-8d39-9629ce1841ee
```

Le build est visible dans le compte Cloudflare
`19c96ea9b10d531ca3677e7bd3ee92a1`, service `valexboutique`, mais l'integration
ne retrouve pas le Worker sur le compte connecte. Aucun deploiement de
production n'est cree par ce push. Le site public conserve l'ancien hash CSP
`sha256-UKNOT...` et des prix HTG, ce qui confirme que la production n'a pas
change.

La correction est donc cote Cloudflare : verifier le compte et le Worker
associes a l'integration Workers Builds, ou retablir le Worker attendu. Cette
action demande l'acces proprietaire au compte Cloudflare VAlex ; elle reste
`BLOCKED` pour l'agent.

Le check `verify` de GitHub Actions passe sur le meme SHA, avec un unique
avertissement : Node.js 20 est deprecie pour `actions/checkout@v4` et
`actions/setup-node@v4`. Ce n'est pas un echec, mais les actions devront etre
mises a jour avant la suppression de Node.js 20 sur les runners.

## 8. Risques et points ouverts

1. **Google Identity Services** : NOT TESTED avec un compte Google reel. Le
   nonce, le flux et la CSP sont verifies statiquement seulement.
2. **Publicite reelle** : NOT TESTED, aucune campagne approuvee en base
   (`ad_campaigns = 0`). Le contrat SQL est applique et verifie, l'affichage
   reel avec une campagne reste a tester.
3. **XSS navigateur** : NOT TESTED. Les tests ajoutes sont statiques. Une
   revue navigateur reste necessaire avant publication.
4. **Session proprietaire MFA AAL2** : NOT TESTED. La politique finance est
   verifiee en base ; l'affichage reel de `fee_config` dans la page
   proprietaire avec une session AAL2 reste a tester.
5. **Brevo, SMTP et DNS** : les anciennes cles sont compromises. Elles ne
   doivent pas etre utilisees ni testees. Regeneration et rotation par le
   proprietaire.
6. **Logo Google Cloud 120 x 120** : action proprietaire, non traitee ici.
7. **Rendu compact ou aere** : choix global en attente du proprietaire.
8. **Protection de `main`** : la branche n'etait pas protegee au moment du
   controle. Ajouter les checks requis est recommande avant merge.
9. **`HTG` dans le JSON-LD** : `priceCurrency` reste `HTG` pour les moteurs de
   recherche, alors que l'interface est en GDS. Decision a confirmer.
10. **Workers Builds sur les branches** : echec confirme apres desactivation
    des previews, avec le message « This Worker does not exist on your
    account ». La correction demande l'acces proprietaire au compte Cloudflare
    VAlex. Ne pas rendre ce check obligatoire avant reparation, sinon les
    pull requests resteront bloquees.
11. **Rollback finance partiel** : le fichier archive restaure les GRANT mais
    aucune politique SELECT. RLS restant actif, il ne rétablit pas la lecture.
    Une restauration complete exige la definition de la politique anterieure,
    disponible seulement dans une sauvegarde.
12. **Base de lancement** : `shops` contient 1 boutique reelle `pending`
    (`is_demo=false`), alors que la cible annoncee est 0 boutique. Elle
    n'apparait pas via `ad_home()` car elle n'est pas approuvee. Ne pas la
    supprimer sans autorisation ; le proprietaire doit decider de la traiter
    ou de la retirer par une procedure validee.

## 9. Taches restantes recommandees

1. Relire la PR DRAFT et verifier le diff complet.
2. Executer les tests navigateur sur la branche de travail, sans creer de
   commande, paiement, boutique, produit ou avis fictif.
3. Tester Google Identity Services avec un compte reel, puis retirer le compte
   de test.
4. Creer une campagne publicitaire de test approuvee, verifier l'affichage du
   nom de boutique, puis la desactiver.
5. Tester la page proprietaire avec une session MFA AAL2 et verifier que
   `fee_config` se charge, puis que `anon` ne peut pas le lire.
6. Reparer l'integration Workers Builds (compte/Worker associe), puis proteger
   `main` avec les checks requis `verify` et `Workers Builds`.
7. Mettre a jour `actions/checkout` et `actions/setup-node` pour retirer
   l'avertissement Node.js 20.
8. Faire tourner les cles Brevo compromises.
9. Decider du sort de la boutique `pending` existante, sans suppression non
   autorisee, pour respecter la cible de lancement a 0 boutique.
10. Decider du rendu compact ou aere et du traitement de `HTG` dans le JSON-LD.
11. Merge et deploiement par le proprietaire, apres validation de la PR.

## 10. Regles a conserver

- Ne jamais publier de vendeur, produit, commande, paiement, avis ou chiffre
  invente.
- Ne jamais copier un secret du depot prive vers le depot public.
- Ne jamais afficher un secret dans un journal, un diff ou une reponse.
- Ne jamais appliquer une migration, activer les paiements ou deployer sans
  autorisation distincte.
- Utiliser uniquement les statuts `PASS`, `FAIL`, `BLOCKED`, `NOT TESTED` et
  `PARTIAL`, avec une preuve.
