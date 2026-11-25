# Déploiement et retour arrière

## Déploiement normal

Le site est servi par le Worker Cloudflare `valexboutique` en mode Workers
Static Assets, sur `https://valexboutique.store`.

Le déploiement de production est assuré par **Cloudflare Workers Builds**,
relié au dépôt public `princemacy/Valex-boutique-` et à la branche `main`.

1. Le travail se fait sur une branche, puis en pull request vers `main`.
2. La pull request exécute `.github/workflows/verify.yml` :
   - `npm run check` : aucun secret, hash CSP synchronisé, syntaxe ;
   - `npm test` : tests unitaires ;
   - `npm run dry-run` : configuration Workers à blanc.
3. Après merge ou push sur `main`, Cloudflare Workers Builds construit et
   déploie automatiquement le Worker. GitHub Actions ne déploie pas.
4. Une branche de travail ou une pull request non fusionnée ne déclenche
   aucun déploiement de production : Workers Builds surveille `main`.
5. Aucun secret Cloudflare n'est stocké dans GitHub Actions pour ce dépôt
   public. Le jeton de build est géré côté Cloudflare. Ne copiez jamais un
   secret du dépôt privé vers ce dépôt public.

Le 25 novembre 2026, le Worker `valexboutique` était relié à ce dépôt avec
`auto_build_enabled = true`, la commande de déploiement `npx wrangler deploy`
et un jeton de build déjà configuré côté Cloudflare. Le commit `44bea72`
possède un contrôle `Workers Builds: valexboutique` terminé avec succès dans
l'historique GitHub. Ce mécanisme reste la seule voie de déploiement normale.

## Vérification après publication

- `https://valexboutique.store/` répond 200.
- L'en-tête `Content-Security-Policy` contient le hash du script inline publié
  et `https://accounts.google.com` pour Google Identity Services.
- `https://valexboutique.store/sitemap.xml`, `robots.txt`, `manifest.json` et
  `sw.js` répondent 200.
- `/_worker.js`, `/_headers` et `/.assetsignore` répondent 404.
- Une route inconnue (`/b/inconnu`, `/p/inconnu`) répond une vraie page 404.
- Le parcours connexion, catalogue, panier et commande est contrôlé sans créer
  de commande, paiement, boutique, produit ou avis fictif.
- La version Worker affichée dans Cloudflare correspond au commit de `main`
  attendu. En cas de doute, comparer le contenu publié et l'historique des
  versions avant toute nouvelle modification.

## Retour arrière

Cloudflare conserve les versions précédentes du Worker.

1. Ouvrir le tableau de bord Cloudflare du compte
   `19c96ea9b10d531ca3677e7bd3ee92a1`.
2. Workers & Pages > `valexboutique` > Deployments (ou Versions).
3. Choisir la dernière version dont le site public était vérifié.
4. Utiliser l'action de retour arrière vers cette version.
5. Vérifier immédiatement l'accueil, la CSP, le catalogue et une route produit.

Alternative en ligne de commande, si les identifiants Cloudflare sont
disponibles et après accord du propriétaire :

```bash
npx wrangler deployments list
npx wrangler rollback <version-id>
```

Ne jamais supprimer une version, une migration ou une donnée pour annuler un
déploiement. Le retour arrière porte uniquement sur la version du Worker.
Après un retour arrière, consigner la version restaurée, la raison, l'heure et
la vérification effectuée.

## En cas d'échec

- Échec de `Verify` sur une pull request : la production n'a pas changé.
- Échec de Workers Builds après un merge sur `main` : la production reste sur
  la dernière version réussie. Corriger sur une branche, puis nouvelle pull
  request.
- Si le site public ne correspond pas au commit attendu, appliquer le retour
  arrière ci-dessus, puis corriger sur une branche.
- Ne jamais ajouter un second système de déploiement concurrent, ni un
  workflow GitHub qui exécute `wrangler deploy` sans autorisation explicite.
