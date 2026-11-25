# Passation VAlex, branche publique du 25 novembre 2026

## 1. Objet

Cette branche rend consultables les corrections realisees sur le depot public
`princemacy/Valex-boutique-`. Elle ne fusionne rien, ne deploie rien et
n'applique aucune migration en production.

- Depot : `princemacy/Valex-boutique-` (public)
- Branche : `fix/valex-p0-p3-20261124`
- Base : `44bea72` (`main` au moment du travail)
- Cible de revue : `main`
- Pull request DRAFT : `https://github.com/princemacy/Valex-boutique-/pull/1`
- Site concerne : `https://valexboutique.store`

## 2. Commits de la branche

| Commit | SHA complet | Contenu |
| --- | --- | --- |
| `723bba5` | `723bba561049a8dbe925543f5552c419ae21d8a2` | Site : GDS, publicites reelles, Pro dynamique, GIS, PWA, Worker 404 et garde-fou de chargement |
| `d1707d5` | `d1707d5bab2d4ce11f865c6934dc50afcf1f3d81` | SQL : migration `ad_home` avec `shop_id` et `shop_name`, archive de rollback |
| `5da6eef` | `5da6eefb962c4393b0dbeff8a17a0a69034ceea1` | Tests : 16 controles site, SQL, CI et securite |
| `b76f773` | `b76f7732a163bcd34c1b63f4d6e61c9adc4ce6f2` | CI et documentation : `verify.yml`, suppression de `publish.yml`, README, DEPLOYMENT, lockfile |

Les commits de documentation de cette passation sont visibles avec
`git log -- HANDOFF_FOR_CHATGPT.md`.

Aucun commit n'a ete pousse sur `main`. Aucun merge n'a ete effectue.

## 3. Fichiers ajoutes, modifies et retires

### Ajoutes

- `site/pwa.js` : inscription unique du service worker, banniere Android et
  iOS, indicateur hors ligne, blocage des mutations Supabase hors ligne.
- `sql/2026-11-24-ad-home-shop-name.sql` : migration preparee, non appliquee.
- `sql/archive/ad_home_2026-11-23.sql` : definition precedente pour rollback.
- `tests/site.test.mjs` : 16 tests.
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

## 5. Commandes executees et resultats

Toutes les commandes ont ete executees dans `/tmp/opencode/valex-public`.

| Commande | Resultat | Preuve |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS | 82 paquets installes depuis `package-lock.json` |
| `npm run check` | PASS | 50 fichiers analyses, 45 textes, aucun secret, hash CSP valide, syntaxe OK |
| `npm test` | PASS | 16 tests, 16 pass, 0 fail |
| `WRANGLER_SEND_METRICS=false npm run dry-run` | PASS | 50 fichiers lus, 16,03 KiB, aucune publication |
| Validation YAML de `verify.yml` | PASS | jobs `verify`, 6 etapes conformes |
| `node --check` du script inline | PASS | aucune erreur de syntaxe |
| `git diff --check` | PASS | aucune erreur d'espace |
| Scan de secrets dans l'arbre | PASS | aucun jeton ; seules les mentions du role `service_role` dans le SQL et les tests |
| `gh secret list` sur le depot public | PASS | 0 secret GitHub Actions |
| Check-run Workers Builds sur `44bea72` | PASS | `Workers Builds: valexboutique` en `success` |
| Check-run Verify sur `44bea72` | PASS | `verify` en `success` |
| Check-run Workers Builds sur la branche | FAIL | echec immediat sur chaque push de branche, aucun deploiement observe |
| Site public apres push de la branche | PASS | ancien hash CSP `sha256-UKNOT...` et prix HTG conserves, production inchangee |
| Protection de `main` | Observation | branche non protegee au moment du controle |

## 6. Migration SQL non appliquee

La migration `sql/2026-11-24-ad-home-shop-name.sql` n'a pas ete appliquee en
production. Elle est livree pour revue et doit etre appliquee seulement apres
autorisation explicite, sauvegarde verifiee et procedure de restauration
connue.

Elle est necessaire pour que le frontend recoive `shop_id` et `shop_name`. Tant
qu'elle n'est pas appliquee, `ad_home()` ne renvoie pas ces colonnes et le
frontend masque les publicites plutot que d'inventer une attribution.

Rollback : reappliquer
`sql/archive/ad_home_2026-11-23.sql`, puis recharger le cache PostgREST avec
`notify pgrst, 'reload schema'`.

Verification apres application, en lecture seule :

```sql
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ad_home'
 order by ordinal_position;

select has_function_privilege('anon', 'public.ad_home()', 'EXECUTE');

select * from public.ad_home();
```

Attendu : `shop_id` et `shop_name` presents, aucune erreur pour le role
`anon`, et 0 ligne si aucune campagne payante active et approuvee n'existe.

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

Chaque push sur `fix/valex-p0-p3-20261124` declenche un check-run
`Workers Builds: valexboutique` qui echoue immediatement, en moins d'une
seconde. Aucun deploiement GitHub n'est cree. Le site public conserve l'ancien
hash CSP `sha256-UKNOT...` et les prix HTG, ce qui prouve que la production n'a
pas change.

La cause exacte de cet echec n'a pas pu etre consultee : la session Cloudflare
disponible est autorisee sur d'autres comptes, pas sur
`19c96ea9b10d531ca3677e7bd3ee92a1`. Ce point est `BLOCKED` pour l'analyse des
journaux. L'echec est immediat et reproductible, il ne ressemble pas a un echec
de compilation. Avant merge, verifier les reglages Workers Builds (branche
surveillee, previews, filtre de branches) pour eviter un check rouge inutile
sur les pull requests.

## 8. Risques et points ouverts

1. **Migration `ad_home` non appliquee** : les publicites restent masquees tant
   que la migration n'est pas appliquee. Aucune donnee n'est inventee.
2. **Google Identity Services** : NOT TESTED avec un compte Google reel. Le
   nonce, le flux et la CSP sont verifies statiquement seulement.
3. **Publicite reelle** : NOT TESTED, aucune campagne approuvee en base.
4. **XSS navigateur** : NOT TESTED. Les tests ajoutes sont statiques. Une
   revue navigateur reste necessaire avant publication.
5. **Brevo, SMTP et DNS** : les anciennes cles sont compromises. Elles ne
   doivent pas etre utilisees ni testees. Regeneration et rotation par le
   proprietaire.
6. **Logo Google Cloud 120 x 120** : action proprietaire, non traitee ici.
7. **Rendu compact ou aere** : choix global en attente du proprietaire.
8. **Protection de `main`** : la branche n'etait pas protegee au moment du
   controle. Ajouter les checks requis est recommande avant merge.
9. **`HTG` dans le JSON-LD** : `priceCurrency` reste `HTG` pour les moteurs de
   recherche, alors que l'interface est en GDS. Decision a confirmer.
10. **Workers Builds sur les branches** : le check-run echoue immediatement
    sur un push de branche, sans deploiement. La cause exacte est `BLOCKED`
    faute d'acces au compte Cloudflare VAlex. Verifier la configuration avant
    merge pour ne pas laisser un check rouge sur la PR.

## 9. Taches restantes recommandees

1. Relire la PR DRAFT et verifier le diff complet.
2. Executer les tests navigateur sur la branche de travail, sans creer de
   commande, paiement, boutique, produit ou avis fictif.
3. Tester Google Identity Services avec un compte reel, puis retirer le compte
   de test.
4. Creer une campagne publicitaire de test approuvee, verifier l'affichage du
   nom de boutique, puis la desactiver.
5. Appliquer la migration `ad_home` apres autorisation, sauvegarde et
   verification du rollback.
6. Proteger `main` avec les checks requis `verify` et `Workers Builds`.
7. Faire tourner les cles Brevo compromises.
8. Decider du rendu compact ou aere et du traitement de `HTG` dans le JSON-LD.
9. Merge et deploiement par le proprietaire, apres validation de la PR.

## 10. Regles a conserver

- Ne jamais publier de vendeur, produit, commande, paiement, avis ou chiffre
  invente.
- Ne jamais copier un secret du depot prive vers le depot public.
- Ne jamais afficher un secret dans un journal, un diff ou une reponse.
- Ne jamais appliquer une migration, activer les paiements ou deployer sans
  autorisation distincte.
- Utiliser uniquement les statuts `PASS`, `FAIL`, `BLOCKED`, `NOT TESTED` et
  `PARTIAL`, avec une preuve.
