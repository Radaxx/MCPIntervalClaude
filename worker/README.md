# Intervals.icu MCP Server — Cloudflare Workers (hébergé)

Version hébergée du serveur MCP Intervals.icu, à ajouter comme **connecteur personnalisé distant** dans claude.ai. Transport Streamable HTTP + authentification OAuth 2.1 (via [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider)), **multi-utilisateurs** : chaque personne a son propre compte (identifiant/mot de passe) et sa propre clé API Intervals.icu — ses données restent isolées des autres.

Réutilise le client Intervals.icu et les 9 tools du serveur stdio (`../src/client`, `../src/tools`) — un seul code métier, deux façons de le déployer.

## Architecture

- `IntervalsMcp` (`src/index.ts`) : un [`McpAgent`](https://github.com/cloudflare/agents) — un Durable Object par session cliente, qui enregistre les mêmes 9 tools que la version stdio, avec un client Intervals.icu construit à partir des identifiants de la personne connectée (jamais un compte global partagé).
- `OAuthProvider` : gère l'enregistrement dynamique des clients (claude.ai), l'émission/validation des jetons, et protège l'unique route `/mcp`.
- Écran `/authorize` : formulaire identifiant + mot de passe, sans dépendance externe (pas de CDN).
- `USERS_KV` : un enregistrement par compte (identifiant, mot de passe **haché** en PBKDF2, clé API Intervals.icu et Athlete ID propres à cette personne). **Pas d'inscription publique** : les comptes sont créés par toi, l'admin, via `npm run add-user`.

## 1. Prérequis

- Un compte Cloudflare (gratuit) : https://dash.cloudflare.com/sign-up
- `wrangler` est déjà en devDependency (`npx wrangler` fonctionne depuis ce dossier après `npm install` à la racine du repo, grâce aux workspaces npm).

```bash
npx wrangler login
```

## 2. Créer les KV namespaces

```bash
npx wrangler kv namespace create OAUTH_KV
npx wrangler kv namespace create USERS_KV
```

Copie chaque `id` retourné dans `wrangler.jsonc`, à la place de `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` / `REPLACE_WITH_YOUR_USERS_KV_NAMESPACE_ID`.

## 3. Créer les comptes utilisateurs

Plus aucun secret Worker à définir pour l'authentification (`OWNER_PASSWORD` a disparu) : chaque compte se crée avec un script, qui hache le mot de passe et écrit l'enregistrement dans `USERS_KV`.

```bash
npm run add-user -- <identifiant> <mot_de_passe> <cle_api_intervals> <athlete_id> --remote
```

Exemple pour toi-même (migration depuis l'ancien `OWNER_PASSWORD`) :

```bash
npm run add-user -- alexis "un-mot-de-passe-long-et-unique" ta_cle_api_intervals i363650 --remote
```

Puis pour chaque ami/proche, avec **sa propre** clé API Intervals.icu (Settings > Developer Settings sur son compte intervals.icu) et **son propre** Athlete ID :

```bash
npm run add-user -- copine "un-autre-mot-de-passe" sa_cle_api son_athlete_id --remote
```

Relancer la commande avec le même identifiant met à jour le compte (changement de mot de passe ou de clé API).

## 4. Développement local

```bash
npm run dev
```

`wrangler dev` démarre sur `http://localhost:8787` avec des bindings KV/Durable Objects simulés localement — pas besoin d'avoir déjà déployé pour tester. Crée des comptes de test dans le KV local avec `--local` au lieu de `--remote` :

```bash
npm run add-user -- test motdepasse cle_api_test athlete_id_test --local
```

## 5. Déploiement

```bash
npm run deploy
```

Wrangler affiche l'URL publique, du type `https://intervals-icu-mcp.<ton-sous-domaine>.workers.dev`.

## 6. Ajouter le connecteur dans claude.ai

1. Sur claude.ai : **Settings → Connectors → Add custom connector**.
2. Colle l'URL du endpoint MCP : `https://intervals-icu-mcp.<ton-sous-domaine>.workers.dev/mcp`.
3. claude.ai découvre automatiquement la configuration OAuth (`/.well-known/oauth-authorization-server`), s'enregistre dynamiquement comme client, puis te redirige vers l'écran `/authorize`.
4. Chacun entre **son propre identifiant et mot de passe** (créés à l'étape 3). Une fois validé, claude.ai reçoit un jeton d'accès (durée par défaut : 1h, renouvelable via refresh token ~30 jours) lié à ce compte, et les 9 tools apparaissent (dont 3 en écriture) — avec les données Intervals.icu de la personne connectée, jamais celles d'un autre compte.

Le comportement exact de l'UI "custom connector" de claude.ai (position du champ, wording) peut évoluer — si l'ajout échoue, vérifie d'abord que `https://.../mcp` répond bien (voir section Dépannage) avant de suspecter la config OAuth.

## 7. Mettre à jour le serveur déployé

Après une modification du code (ici ou dans `../src`) :

```bash
npm run deploy
```

Aucune reconnexion nécessaire côté claude.ai — les tokens existants restent valides. Les comptes dans `USERS_KV` ne sont pas affectés par un déploiement.

## 8. Logs en direct

```bash
npm run tail
```

Utile pour voir les erreurs réelles de l'API Intervals.icu (401/429/etc.) sans jamais exposer de secret : le client ne journalise jamais une clé API, comme en local. Les logs identifient la session par le nom d'utilisateur (`userId`), jamais par la clé API.

## 9. Coûts

Le tier gratuit de Cloudflare Workers couvre largement un usage personnel/familial, mais les Durable Objects (requis par `McpAgent`) peuvent nécessiter le plan payant selon l'offre en vigueur au moment où tu déploies — vérifie la page tarifs Cloudflare actuelle avant de déployer si c'est un critère important.

## 10. Sécurité des comptes

- Les mots de passe sont hachés avec PBKDF2-SHA256 (100 000 itérations, sel aléatoire par compte) avant stockage — jamais en clair, y compris dans `USERS_KV`.
- Chaque clé API Intervals.icu est stockée dans `USERS_KV`, associée à un seul compte. Le Worker ne les journalise jamais.
- Le formulaire de connexion renvoie un message générique ("Identifiant ou mot de passe incorrect") sans préciser lequel des deux est faux, pour ne pas révéler si un identifiant existe.
- Il n'y a pas de page d'inscription publique : seule la personne qui a accès à `wrangler` (toi) peut créer un compte via `npm run add-user`.
- Il n'y a pas encore de commande pour supprimer un compte — pour révoquer l'accès de quelqu'un, écrase son enregistrement avec un mot de passe aléatoire inconnu, ou supprime directement la clé dans le dashboard Cloudflare (Workers & Pages → KV → `USERS_KV`).

## 11. Dépannage

- **`wrangler deploy` échoue sur `compatibility_date`** : mets à jour la valeur dans `wrangler.jsonc` avec la date suggérée par l'erreur.
- **`wrangler deploy` échoue avec "You need a workers.dev subdomain" (code 10063)** : ton compte Cloudflare n'a pas encore de sous-domaine `workers.dev`. Dans le dashboard, **Workers & Pages** propose normalement de le créer au premier accès. Si cette page ne le propose pas (bug côté Cloudflare déjà rencontré), crée-le via l'API directement :
  ```bash
  curl -X PUT "https://api.cloudflare.com/client/v4/accounts/<TON_ACCOUNT_ID>/workers/subdomain" \
    -H "Authorization: Bearer <TON_API_TOKEN>" \
    -H "Content-Type: application/json" \
    --data '{"subdomain":"<le-nom-que-tu-veux>"}'
  ```
  (Account ID via `wrangler whoami` ; token créé sur https://dash.cloudflare.com/profile/api-tokens avec la permission `Account > Workers Scripts > Edit`.) Relance ensuite `npm run deploy`.
- **"Identifiant ou mot de passe incorrect" alors que c'est correct** : vérifie que le compte a bien été créé avec `--remote` (et pas `--local`, qui n'écrit que dans le KV simulé de `wrangler dev`) — `npm run add-user -- ... --remote`.
- **401 après connexion réussie** : la clé API Intervals.icu enregistrée pour ce compte (`npm run add-user`) est invalide ou expirée ; recrée le compte avec la bonne clé.
- **Erreur liée à un KV namespace au déploiement** : l'`id` dans `wrangler.jsonc` (pour `OAUTH_KV` et `USERS_KV`) doit correspondre exactement à celui retourné par `wrangler kv namespace create`.
