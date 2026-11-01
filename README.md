# VAlex Boutique

Place de marché haïtienne : boutiques vérifiées, paiement à la livraison ou avant livraison, code de réception, messagerie privée, assistant IA.

## Contenu
- `site/index.html` : le site public (une seule page).
- `site/_worker.js` : petit programme Cloudflare Pages. Il donne une vraie page à chaque produit (`/p/…`) et à chaque boutique (`/b/…`) pour Google et les aperçus WhatsApp, et fournit `/sitemap.xml` et `/robots.txt`.

Le QG (administration) n'est **pas** dans ce dépôt et n'est jamais publié avec le site.
Aucune clé secrète ici : seule la clé publique Supabase (prévue pour être visible) est utilisée.

## Publication (Cloudflare Pages)
- Dossier publié : `site`
- Commande de construction : aucune
- Chaque envoi sur la branche `main` met le site à jour automatiquement.
