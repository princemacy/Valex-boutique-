# VAlex Boutique

Place de marche haïtienne : boutiques vérifiées, paiement à la livraison ou
avant livraison, code de réception, messagerie privée, assistant IA.

Ce dépôt est la source officielle de publication du site. Le dépôt privé
`princemacy/Valex-boutique` reste privé et ne sert jamais de source de
publication.

## Architecture de publication

Le site est publié sur **Cloudflare Workers Static Assets**.

- `site/` contient les fichiers publics : page principale, modules JavaScript,
  images, manifeste, service worker, pages À propos et FAQ.
- `site/_worker.js` est le **point d'entrée serveur** déclaré par
  `wrangler.toml` (`main`). Il rend les pages produit et boutique lisibles par
  Google et les aperçus WhatsApp, génère `sitemap.xml` et `robots.txt`,
  applique les en-têtes de sécurité et les pages d'erreur 400 à 503.
- `site/.assetsignore` exclut `_worker.js` et `_headers` des assets publics.
  Le code serveur est déployé comme Worker, jamais servi comme fichier.

### Correction de l'erreur `_worker.js`

La publication échouait avec :

```
Uploading a Pages _worker.js file as an asset.
This could expose your private server-side code to the public Internet.
```

Cause réelle : le dossier `site/` était traité comme un dossier d'assets et
`site/_worker.js` était envoyé comme fichier public. La correction conserve le
Worker comme composant serveur et l'exclut des assets avec
`site/.assetsignore` :

```
_worker.js
_headers
.assetsignore
```

La configuration `wrangler.toml` déclare explicitement :

```toml
main = "site/_worker.js"

[assets]
directory = "./site"
binding = "ASSETS"
run_worker_first = true
not_found_handling = "none"
```

`run_worker_first = true` garantit que le Worker applique les en-têtes de
sécurité et le rendu SEO avant de servir un asset. Aucune protection de
sécurité n'a été désactivée.

## Publication

Le déploiement de production est assuré par **Cloudflare Workers Builds**,
relié au dépôt public `princemacy/Valex-boutique-` et à la branche `main`.
Après un merge ou un push sur `main`, Cloudflare construit et déploie le
Worker `valexboutique`. Les branches de travail et les pull requests ne
déploient jamais la production.

Le workflow `.github/workflows/verify.yml` ne publie pas. Il vérifie :

- `npm run check` : aucun secret, hash CSP synchronisé, syntaxe ;
- `npm test` : tests unitaires ;
- `npm run dry-run` : configuration Workers à blanc.

Aucun secret Cloudflare n'est stocké dans GitHub Actions pour ce dépôt public.
Ne copiez jamais un secret du dépôt privé. Le jeton de build Workers est géré
côté Cloudflare.

Commandes locales équivalentes :

```bash
npm ci
npm run check
npm test
npm run dry-run
```

Voir `DEPLOYMENT.md` pour la vérification et le retour arrière.

## Sécurité

- Aucune clé `service_role`, aucun secret Cloudflare, GitHub, Supabase,
  MonCash, NatCash ou Kobara dans le dépôt.
- Seule la clé publique Supabase (`sb_publishable_...`) est présente. Elle est
  prévue pour être visible et soumise aux politiques RLS.
- Les secrets de production restent dans Cloudflare (jeton de build
  Workers), Supabase Vault et les champs sécurisés des fournisseurs. Aucun
  secret Cloudflare n'est stocké dans GitHub Actions pour ce dépôt public.
- Les fonctions d'administration sont protégées côté serveur par
  l'authentification Supabase et les politiques RLS. Leur code client est
  présent pour la parité fonctionnelle, sans donnée privée ni secret.

## Domaine

Le domaine officiel visé est `https://valexboutique.store`. Le Worker peut
aussi être vérifié sur son adresse `workers.dev` du compte cible avant le
rattachement du domaine.

## État

Le dépôt public est la version publiée. Les fonctions de paiement en ligne
restent désactivées tant que le barème et les contrats ne sont pas validés.
