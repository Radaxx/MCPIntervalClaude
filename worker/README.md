# Intervals.icu MCP Server — Cloudflare Workers (hébergé)

Version hébergée du serveur MCP Intervals.icu, à ajouter comme **connecteur personnalisé distant** dans claude.ai. Transport Streamable HTTP + authentification OAuth 2.1 (via [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider)), gardée par un mot de passe personnel.

Réutilise le client Intervals.icu et les 7 tools du serveur stdio (`../src/client`, `../src/tools`) — un seul code métier, deux façons de le déployer.

## Architecture

- `IntervalsMcp` (`src/index.ts`) : un [`McpAgent`](https://github.com/cloudflare/agents) — un Durable Object par session cliente, qui enregistre les mêmes 7 tools que la version stdio.
- `OAuthProvider` : gère l'enregistrement dynamique des clients (claude.ai), l'émission/validation des jetons, et protège l'unique route `/mcp`.
- Écran `/authorize` : simple formulaire mot de passe (protégé par un jeton CSRF), sans dépendance externe (pas de CDN). Ce mot de passe (`OWNER_PASSWORD`) est **distinct** de ta clé API Intervals.icu — c'est juste la porte d'entrée qui autorise un client MCP à obtenir un jeton.

## 1. Prérequis

- Un compte Cloudflare (gratuit) : https://dash.cloudflare.com/sign-up
- `wrangler` est déjà en devDependency (`npx wrangler` fonctionne depuis ce dossier après `npm install` à la racine du repo, grâce aux workspaces npm).

```bash
npx wrangler login
```

## 2. Créer le KV namespace (stockage des jetons OAuth)

```bash
npx wrangler kv namespace create OAUTH_KV
```

Copie l'`id` retourné dans `wrangler.jsonc`, à la place de `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

## 3. Définir les secrets de production

```bash
npx wrangler secret put INTERVALS_API_KEY
npx wrangler secret put INTERVALS_ATHLETE_ID
npx wrangler secret put OWNER_PASSWORD
```

Choisis un `OWNER_PASSWORD` long et unique (ce n'est pas ta clé Intervals.icu) : c'est ce que tu taperas dans le navigateur la première fois que claude.ai demande à se connecter.

## 4. Développement local

```bash
cp .dev.vars.example .dev.vars
# remplis INTERVALS_API_KEY, INTERVALS_ATHLETE_ID, OWNER_PASSWORD dans .dev.vars
npm run dev
```

`wrangler dev` démarre sur `http://localhost:8787` avec des bindings KV/Durable Objects simulés localement — pas besoin d'avoir déjà déployé pour tester.

## 5. Déploiement

```bash
npm run deploy
```

Wrangler affiche l'URL publique, du type `https://intervals-icu-mcp.<ton-sous-domaine>.workers.dev`.

## 6. Ajouter le connecteur dans claude.ai

1. Sur claude.ai : **Settings → Connectors → Add custom connector**.
2. Colle l'URL du endpoint MCP : `https://intervals-icu-mcp.<ton-sous-domaine>.workers.dev/mcp`.
3. claude.ai découvre automatiquement la configuration OAuth (`/.well-known/oauth-authorization-server`), s'enregistre dynamiquement comme client, puis te redirige vers l'écran `/authorize`.
4. Entre ton `OWNER_PASSWORD`. Une fois validé, claude.ai reçoit un jeton d'accès (durée par défaut : 1h, renouvelable via refresh token ~30 jours) et les 7 tools apparaissent (dont 1 en écriture).

Le comportement exact de l'UI "custom connector" de claude.ai (position du champ, wording) peut évoluer — si l'ajout échoue, vérifie d'abord que `https://.../mcp` répond bien (voir section Dépannage) avant de suspecter la config OAuth.

## 7. Mettre à jour le serveur déployé

Après une modification du code (ici ou dans `../src`) :

```bash
npm run deploy
```

Aucune reconnexion nécessaire côté claude.ai — les tokens existants restent valides.

## 8. Logs en direct

```bash
npm run tail
```

Utile pour voir les erreurs réelles de l'API Intervals.icu (401/429/etc.) sans jamais exposer de secret : le client ne journalise jamais la clé API, comme en local.

## 9. Coûts

Le tier gratuit de Cloudflare Workers couvre largement un usage personnel, mais les Durable Objects (requis par `McpAgent`) peuvent nécessiter le plan payant selon l'offre en vigueur au moment où tu déploies — vérifie la page tarifs Cloudflare actuelle avant de déployer si c'est un critère important.

## 10. Dépannage

- **`wrangler deploy` échoue sur `compatibility_date`** : mets à jour la valeur dans `wrangler.jsonc` avec la date suggérée par l'erreur.
- **`wrangler deploy` échoue avec "You need a workers.dev subdomain" (code 10063)** : ton compte Cloudflare n'a pas encore de sous-domaine `workers.dev`. Dans le dashboard, **Workers & Pages** propose normalement de le créer au premier accès. Si cette page ne le propose pas (bug côté Cloudflare déjà rencontré), crée-le via l'API directement :
  ```bash
  curl -X PUT "https://api.cloudflare.com/client/v4/accounts/<TON_ACCOUNT_ID>/workers/subdomain" \
    -H "Authorization: Bearer <TON_API_TOKEN>" \
    -H "Content-Type: application/json" \
    --data '{"subdomain":"<le-nom-que-tu-veux>"}'
  ```
  (Account ID via `wrangler whoami` ; token créé sur https://dash.cloudflare.com/profile/api-tokens avec la permission `Account > Workers Scripts > Edit`.) Relance ensuite `npm run deploy`.
- **401 après connexion réussie** : vérifie que le secret `INTERVALS_API_KEY` déployé (`wrangler secret put`) est bien ta clé actuelle, pas celle du `.dev.vars` local.
- **Erreur liée au KV namespace au déploiement** : l'`id` dans `wrangler.jsonc` doit correspondre exactement à celui retourné par `wrangler kv namespace create OAUTH_KV`.
