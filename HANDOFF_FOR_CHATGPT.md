# Passation VAlex, depot public, etat au 26 novembre 2026

## 1. Objet et etat final

Cette passation documente la finalisation des corrections P0 a P3 du depot
public `princemacy/Valex-boutique-` et leur publication reelle en production.

- Depot : `princemacy/Valex-boutique-` (public)
- Site : `https://valexboutique.store`
- `main` avant cette passe documentaire :
  `3160a126d49963dac315e96927a4fbea8089c980`
- PR #1 : fusionnee en squash, merge
  `0d24f6a3b5d084065ac8238a905bda0d98bb44f9`
- PR #2 : fusionnee en squash, merge
  `3160a126d49963dac315e96927a4fbea8089c980`
- Deux builds Cloudflare de production ont reussi et le site public a ete
  verifie apres chacun.
- Aucune migration n'a ete rejouee et aucune donnee de production n'a ete
  modifiee pendant cette finalisation.

Cette passe documentaire est publiee par une PR dediee. Son SHA de fusion est
visible avec `git log -- HANDOFF_FOR_CHATGPT.md`.

Deux migrations ont ete appliquees en production par une session anterieure,
le 25 novembre 2026, avec autorisation du proprietaire. Ce depot les documente
et reste aligne sur l'etat deploye, sans les rejouer.

## 2. Historique publie

### 2.1 PR #1

Branche `fix/valex-p0-p3-20261124`, tete
`982087e368e5a1814e9bb757cd5c1419ada2df61`, douze commits au-dessus de
`main`, fusionnee en squash dans
`0d24f6a3b5d084065ac8238a905bda0d98bb44f9`.

| Commit | SHA complet | Contenu |
| --- | --- | --- |
| `723bba5` | `723bba561049a8dbe925543f5552c419ae21d8a2` | Site : GDS, publicites reelles, Pro dynamique, GIS, PWA, Worker 404 et garde-fou de chargement |
| `d1707d5` | `d1707d5bab2d4ce11f865c6934dc50afcf1f3d81` | SQL : migration `ad_home` avec `shop_id` et `shop_name`, archive de rollback |
| `5da6eef` | `5da6eefb962c4393b0dbeff8a17a0a69034ceea1` | Tests : controles site, SQL, CI et securite |
| `b76f773` | `b76f7732a163bcd34c1b63f4d6e61c9adc4ce6f2` | CI et documentation : `verify.yml`, suppression de `publish.yml` |
| `b76ff34` | `b76ff3473fe0feb8c7266ac061742fab78b652f3` | Documentation : passation de la branche et preuves |
| `3274511` | `32745110794c3c4ea71d39e4fb32f3a273e0e073` | Documentation : lien de la PR |
| `7532132` | `75321321a89dd89741452724a6084681a6ed636e` | Documentation : constat Workers Builds et non-deploiement |
| `3672821` | `36728219ebe8b0571cdcc3a5e7fd86c838b064aa` | Documentation : reference des commits de passation |
| `6ca3b11` | `6ca3b119aab5a1ca90f7173bb5ebceb2f5767ee9` | Documentation : alignement sur les migrations du 25 novembre |
| `b30cf0f` | `b30cf0fad03385cf5cb75f33b54a47578a7f84be` | Documentation : echec Workers Builds et avertissement Node 20 |
| `aa3940b` | `aa3940b576b11d330fe5758ba53d23200d1f9de0` | Documentation : rollback finance qualifie de partiel |
| `982087e` | `982087e368e5a1814e9bb757cd5c1419ada2df61` | Documentation : etat reel de `shops` avec 1 boutique `pending` |

### 2.2 PR #2

Branche `fix/valex-partial-spinner`, tete
`b94b2315136f6333bddb95c0b509aa845b9c6db1`, un commit, fusionnee en squash
dans `3160a126d49963dac315e96927a4fbea8089c980`.

Correctif cible : le spinner de chargement de la conversation (`.msgs > .spin`)
n'etait pas couvert par le garde-fou de 12 secondes. Il declenche desormais la
barre « Le chargement prend plus de temps que prevu » avec le bouton
« Reessayer ». Le hash CSP a ete resynchronise et le test statique aligne.

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
- `tests/site.test.mjs` : 18 tests statiques.
- `DEPLOYMENT.md` : deploiement Workers Builds et retour arriere.
- `package-lock.json` : installation reproductible avec `npm ci`.

### Modifies

- `site/index.html` : prix en GDS, offres Pro dynamiques, Google Identity
  Services, garde-fou de chargement couvrant les skeletons, le fil video et la
  messagerie, etat vide video, erreurs neutres.
- `site/_worker.js` : CSP Google, vraies 404 produit et boutique, routes
  `/a-propos` et `/faq` sans boucle, sitemap resilient, `noindex, nofollow`.
- `site/_headers` : hash CSP synchronise apres chaque changement de script
  inline.
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
   Le garde-fou couvre les skeletons, le spinner du fil video et le spinner de
   la conversation. L'etat vide du fil video affiche « Aucune video
   disponible ».
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

## 6. Commandes executees et preuves

Toutes les commandes de verification locale sont executees dans
`/tmp/opencode/valex-public`.

| Commande | Resultat | Preuve |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS | installation depuis `package-lock.json` |
| `npm run check` avant correctif spinner | PASS | 50 fichiers, 45 textes, aucun secret, hash CSP valide |
| `npm test` avant correctif spinner | PASS | 18 tests, 18 pass, 0 fail |
| `npm run check` apres correctif spinner | PASS | hash `sha256-D1GA...` valide, syntaxe OK |
| `npm test` apres correctif spinner | PASS | 18 tests, 18 pass, 0 fail |
| `WRANGLER_SEND_METRICS=false npm run dry-run` | PASS | build local, aucune publication |
| Validation YAML de `verify.yml` | PASS | jobs et etapes conformes |
| `node --check` du script inline | PASS | aucune erreur de syntaxe |
| `git diff --check` | PASS | aucune erreur d'espace |
| Scan de secrets dans l'arbre | PASS | aucun jeton ; seules les mentions du role `service_role` |
| `gh secret list` sur le depot public | PASS | 0 secret GitHub Actions |
| Check-run `verify` sur la tete de la PR #1 | PASS | `success` sur `982087e` |
| Check-run `verify` sur le merge de la PR #1 | PASS | `success` sur `0d24f6a` |
| Check-run `verify` sur la tete de la PR #2 | PASS | `success` sur `b94b231` |
| Check-run `verify` sur le merge de la PR #2 | PASS | `success` sur `3160a12` |
| Check-run Workers Builds sur la tete de la PR #1 | FAIL | preview de branche : `This Worker does not exist on your account` |
| Build Cloudflare de production #1 | PASS | `a86e3b37-fa58-4dcc-b8eb-cc49e32251cf`, version `f73bc5a4-c507-4129-b3d5-99b1f469a379` |
| Build Cloudflare de production #2 | PASS | `971fc0b4-231a-4f63-8c9b-e0527bf3b30d`, version `1851a640-6536-4c90-aa14-799d58a68b2a` |
| Site public apres build #1 | PASS | CSP `sha256-ghFe...`, 29 GDS, 0 HTG, aucun `const PRO=` |
| Site public apres build #2 | PASS | CSP `sha256-D1GAkZrlynnqzKCVI79cMBk2y2icXjs9c293ZVncTXw=`, selecteur `.msgs > .spin` present, 29 GDS, 0 HTG |
| Routes publiques | PASS | `/`, `/sitemap.xml`, `/robots.txt`, `/manifest.json`, `/sw.js`, `/a-propos`, `/faq` en 200 |
| Routes inexistantes | PASS | `/p/inconnu` et `/b/inconnu` en 404 avec `<meta name="robots" content="noindex">` |
| Protection de `main` | Observation | `protected: false`, aucun check requis ; aucun contournement utilise |
| Acces direct Cloudflare au compte de production | BLOCKED | HTTP 403 ; le compte n'est pas dans la session MCP |

## 7. Deploiement

- Deploiement de production : DEPLOYE et verifie. Ce n'est plus un etat
  volontairement non deploye.
- Merge vers `main` : EFFECTUE pour la PR #1 puis la PR #2.
- PR #1 : `https://github.com/princemacy/Valex-boutique-/pull/1`.
- PR #2 : `https://github.com/princemacy/Valex-boutique-/pull/2`.
- Workers Builds est relie au depot public et a `main`. Chaque fusion sur
  `main` a produit un build de production reussi et une nouvelle version du
  Worker `valexboutique`.
- GitHub Actions ne deploie pas et ne demande aucun secret Cloudflare.
- `publish.yml` a ete supprime pour eviter un second systeme de deploiement.

### Builds de production

| Ordre | Build ID | Version Worker | Commit source | Resultat |
| --- | --- | --- | --- | --- |
| 1 | `a86e3b37-fa58-4dcc-b8eb-cc49e32251cf` | `f73bc5a4-c507-4129-b3d5-99b1f469a379` | `0d24f6a` | PASS |
| 2 | `971fc0b4-231a-4f63-8c9b-e0527bf3b30d` | `1851a640-6536-4c90-aa14-799d58a68b2a` | `3160a12` | PASS |

Les deux check-runs `Workers Builds: valexboutique` sont en `success` et
pointent vers le tableau de bord Cloudflare du compte de production. L'acces
direct a ce compte reste `BLOCKED` pour l'agent (403), donc le suivi passe par
les check-runs GitHub et par la verification du site public.

### Workers Builds sur les branches

Le check `Workers Builds: valexboutique` echoue encore sur certains pushes de
branche avec le message :

```text
Preview creation failed: This Worker does not exist on your account.
```

Ce check concerne la creation de preview de branche, pas le Worker de
production. Les deux builds de production declenches par les fusions sur
`main` ont reussi. Aucune protection de branche n'a ete contournee : `main`
n'est pas protegee et aucun check n'y est requis au moment de la finalisation.
Ne pas rendre ce check de preview obligatoire avant reparation cote Cloudflare,
sinon les pull requests resteront bloquees.

Le check `verify` de GitHub Actions passe sur les deux merges, avec un unique
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
   revue navigateur reste necessaire.
4. **Session proprietaire MFA AAL2** : NOT TESTED. La politique finance est
   verifiee en base ; l'affichage reel de `fee_config` dans la page
   proprietaire avec une session AAL2 reste a tester.
5. **Brevo, SMTP et DNS** : les anciennes cles sont compromises. Elles ne
   doivent pas etre utilisees ni testees. Regeneration et rotation par le
   proprietaire.
6. **Logo Google Cloud 120 x 120** : action proprietaire, non traitee ici.
7. **Rendu compact ou aere** : choix global en attente du proprietaire.
8. **Protection de `main`** : la branche n'est pas protegee. Ajouter les checks
   requis est recommande apres reparation de la preview Cloudflare, pour ne pas
   bloquer les PR sur un check de preview non functionnel.
9. **`HTG` dans le JSON-LD** : `priceCurrency` reste `HTG` pour les moteurs de
   recherche, alors que l'interface est en GDS. Decision a confirmer.
10. **Workers Builds sur les branches** : echec de preview confirme. La
    correction demande l'acces proprietaire au compte Cloudflare VAlex. Les
    builds de production, eux, reussissent.
11. **Rollback finance partiel** : le fichier archive restaure les GRANT mais
    aucune politique SELECT. RLS restant actif, il ne retablit pas la lecture.
    Une restauration complete exige la definition de la politique anterieure,
    disponible seulement dans une sauvegarde.
12. **Base de lancement** : `shops` contient 1 boutique reelle `pending`
    (`is_demo=false`), alors que la cible annoncee est 0 boutique. Elle
    n'apparait pas via `ad_home()` car elle n'est pas approuvee. Ne pas la
    supprimer sans autorisation ; le proprietaire doit decider de la traiter
    ou de la retirer par une procedure validee.
13. **`AbortController` generalise** : PARTIAL. Aucune utilisation dans
    `site/index.html`. Les requetes ne sont pas annulees a la navigation.
14. **File de synchronisation hors ligne** : PARTIAL. Les mutations Supabase
    sont bloquees hors ligne et aucune mutation financiere n'est mise en file,
    mais les favoris et messages ne disposent pas encore d'une file de
    synchronisation.
15. **Skeletons specifiques par page** : PARTIAL. Le garde-fou generique de
    12 secondes est present, tous les skeletons ne sont pas specialises.
16. **Telemetrie live et limites serveur** : PARTIAL. Limite client de 5
    envois, limite serveur de 20 via `private.take_limit`, masquage des
    secrets verifie statiquement ; aucun test live avec erreur reelle.
17. **Appareils physiques** : NOT TESTED sur Android, iPhone, tablette et
    desktop.
18. **Acces direct Cloudflare** : BLOCKED pour l'agent. Le compte de production
    `19c96ea9b10d531ca3677e7bd3ee92a1` n'est pas dans la session MCP ; les
    builds sont suivis par les check-runs GitHub.
19. **HIBP** : BLOCKED par le plan Supabase Free, sans demande d'upgrade.

## 9. Taches restantes recommandees

1. Faire tourner les cles Brevo compromises et mettre a jour les secrets cote
   fournisseur, sans jamais les exposer dans le depot public.
2. Decider du plan Supabase ou du report du controle HIBP.
3. Reparer l'integration Workers Builds de preview, puis proteger `main` avec
   au minimum `verify` et le build de production.
4. Mettre a jour `actions/checkout` et `actions/setup-node` pour retirer
   l'avertissement Node.js 20.
5. Decider du sort de la boutique `pending` existante, sans suppression non
   autorisee, pour respecter la cible de lancement a 0 boutique.
6. Decider du rendu compact ou aere et du traitement de `HTG` dans le JSON-LD.
7. Tester Google Identity Services avec un compte reel, puis retirer le compte
   de test.
8. Creer une campagne publicitaire de test approuvee, verifier l'affichage du
   nom de boutique, puis la desactiver.
9. Tester la page proprietaire avec une session MFA AAL2 et verifier que
   `fee_config` se charge, puis que `anon` ne peut pas le lire.
10. Executer un test XSS navigateur avec un contenu malveillant.
11. Tester Android, iPhone, tablette et desktop.
12. Supprimer les branches distantes fusionnees
    `fix/valex-p0-p3-20261124` et `fix/valex-partial-spinner`. Aucun outil MCP
    de suppression de branche n'etait disponible pendant la finalisation.
13. Traiter les PARTIAL restants dans le backlog : `AbortController`, file de
    synchronisation hors ligne, skeletons specifiques, telemetrie live.

## 10. Regles a conserver

- Ne jamais publier de vendeur, produit, commande, paiement, avis ou chiffre
  invente.
- Ne jamais copier un secret du depot prive vers le depot public.
- Ne jamais afficher un secret dans un journal, un diff ou une reponse.
- Ne jamais appliquer une migration, activer les paiements ou deployer sans
  autorisation distincte.
- Utiliser uniquement les statuts `PASS`, `FAIL`, `BLOCKED`, `NOT TESTED` et
  `PARTIAL`, avec une preuve.
