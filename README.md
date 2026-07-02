# Intervals.icu MCP Server

Serveur [MCP](https://modelcontextprotocol.io) qui expose tes données [Intervals.icu](https://intervals.icu) (activités, wellness, profil athlète, charge d'entraînement, séances planifiées) à Claude — en local via Claude Desktop / Claude Code, similaire au connecteur Strava officiel.

Lecture seule : ce serveur n'effectue aucune écriture sur ton compte Intervals.icu.

## 1. Obtenir ta clé API et ton Athlete ID

1. Connecte-toi sur [intervals.icu](https://intervals.icu).
2. Va dans **Settings > Developer Settings**.
3. Génère une clé API personnelle (bouton "Generate" ou équivalent) → c'est ta `INTERVALS_API_KEY`.
4. Ton **Athlete ID** est visible dans l'URL une fois connecté, sous la forme `i123456` (ex: `https://intervals.icu/athlete/i123456/...`) → c'est ta `INTERVALS_ATHLETE_ID`.

Garde cette clé secrète : elle donne accès en lecture à toutes tes données d'entraînement.

## 2. Configuration

Copie le fichier d'exemple et renseigne tes valeurs :

```bash
cp .env.example .env
```

```env
# .env
INTERVALS_API_KEY=ta_cle_api_personnelle
INTERVALS_ATHLETE_ID=i123456
```

`.env` est dans `.gitignore` — il ne sera jamais commité. Ne mets jamais ta clé en dur dans le code.

## 3. Installation et lancement en local

```bash
npm install
npm run build
npm start
```

Pour développer avec rechargement direct (sans étape de build), utilise :

```bash
npm run dev
```

Le serveur communique en JSON-RPC sur stdio (`stdin`/`stdout`) : il n'affiche rien d'utile si tu le lances seul dans un terminal, c'est normal — il attend un client MCP (Claude Desktop, Claude Code, ou un script de test) pour lui parler.

## 4. Ajouter le serveur à Claude Desktop

Édite le fichier de config de Claude Desktop :

- macOS : `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows : `%APPDATA%\Claude\claude_desktop_config.json`
- Linux : `~/.config/Claude/claude_desktop_config.json`

Ajoute une entrée dans `mcpServers` (adapte le chemin absolu vers `dist/index.js`) :

```json
{
  "mcpServers": {
    "intervals-icu": {
      "command": "node",
      "args": ["/chemin/absolu/vers/intervals-icu-mcp-server/dist/index.js"],
      "env": {
        "INTERVALS_API_KEY": "ta_cle_api_personnelle",
        "INTERVALS_ATHLETE_ID": "i123456"
      }
    }
  }
}
```

Redémarre Claude Desktop. Le connecteur "intervals-icu" doit apparaître avec ses 6 tools.

## 5. Ajouter le serveur à Claude Code

**Option A — commande CLI** (depuis n'importe quel dossier) :

```bash
claude mcp add intervals-icu \
  -e INTERVALS_API_KEY=ta_cle_api_personnelle \
  -e INTERVALS_ATHLETE_ID=i123456 \
  -- node /chemin/absolu/vers/intervals-icu-mcp-server/dist/index.js
```

**Option B — fichier `.mcp.json`** à la racine d'un projet (pratique si tu veux versionner la config d'équipe, mais alors ne commite jamais les vraies valeurs des variables `env` — préfère laisser Claude Code lire `.env` ou utilise des placeholders) :

```json
{
  "mcpServers": {
    "intervals-icu": {
      "command": "node",
      "args": ["/chemin/absolu/vers/intervals-icu-mcp-server/dist/index.js"],
      "env": {
        "INTERVALS_API_KEY": "ta_cle_api_personnelle",
        "INTERVALS_ATHLETE_ID": "i123456"
      }
    }
  }
}
```

Vérifie ensuite avec `claude mcp list` que le serveur est bien détecté.

## 6. Tools disponibles

Tous les tools sont en lecture seule et retournent des données déjà agrégées (pas le JSON brut complet de l'API).

| Tool | Description | Paramètres |
|---|---|---|
| `get_activities` | Liste des activités sur une période | `oldest`, `newest` (YYYY-MM-DD), `type` (optionnel, ex: `Run`, `Ride`), `limit` (optionnel) |
| `get_activity_detail` | Détail d'une activité, avec intervalles/splits | `activity_id` |
| `get_wellness` | FC repos, HRV, sommeil, poids, fatigue/forme | `oldest`, `newest` (YYYY-MM-DD) |
| `get_athlete_profile` | FTP, zones FC/allure/puissance, poids, unités | — |
| `get_training_load_summary` | CTL/ATL/TSB et tendance hebdomadaire | `weeks` (optionnel, défaut 4) |
| `get_planned_workouts` | Séances planifiées à venir | `oldest`, `newest` (optionnels, défaut : 14 prochains jours), `limit` (optionnel) |

## 7. Sécurité

- Authentification HTTP Basic (`username: API_KEY`, `password: <ta clé>`), jamais journalisée, y compris en cas d'erreur.
- Aucune opération d'écriture n'est exposée : seuls des appels `GET` sont effectués vers l'API Intervals.icu.
- Les erreurs 401 (clé invalide) et 429 (rate limit) sont détectées et renvoient un message clair au lieu de faire échouer silencieusement l'appel.

## 8. Dépannage

- **"Configuration invalide" au démarrage** : `INTERVALS_API_KEY` ou `INTERVALS_ATHLETE_ID` manquant — vérifie ton `.env` ou la config `env` du client MCP.
- **Erreur 401** : la clé API est invalide, expirée, ou mal copiée.
- **Erreur 429** : trop de requêtes envoyées à l'API Intervals.icu en peu de temps ; réessaie après le délai indiqué.
- **Aucun tool n'apparaît dans Claude** : vérifie que le chemin vers `dist/index.js` est absolu et que `npm run build` a bien été exécuté au préalable.

## 9. Hébergement distant (HTTP/SSE)

Ce serveur tourne pour l'instant en local via stdio (un seul utilisateur = toi, un seul process). Pour l'utiliser comme connecteur personnalisé distant dans claude.ai, deux changements structurels sont nécessaires avant de choisir un hébergeur.

### Transport

Le SDK MCP a remplacé l'ancien transport "HTTP+SSE" par **Streamable HTTP** (un seul endpoint POST, avec streaming optionnel) : c'est le transport recommandé aujourd'hui, le SSE pur est legacy. Le SDK expose aussi une variante "web standard" (basée sur `fetch`/`Request`/`Response`) qui tourne nativement sur les runtimes edge (Cloudflare Workers, Deno) sans dépendre du module `http` de Node.

### Authentification

Une clé API unique en variable d'env n'est plus suffisante dès que le serveur est exposé publiquement : il faut une couche d'auth entre claude.ai et le serveur, sinon n'importe qui connaissant l'URL pourrait lire tes données d'entraînement. claude.ai attend en général une authentification OAuth 2.1 côté serveur MCP distant pour les connecteurs personnalisés. Le comportement exact et à jour de claude.ai sur ce point (OAuth strictement requis ou non pour un connecteur privé) est à vérifier en conditions réelles au moment de brancher le connecteur.

### Comparatif des options d'hébergement

| | **Cloudflare Workers** | **Fly.io** |
|---|---|---|
| Modèle | Edge serverless, `fetch` handler | Container Node persistant |
| Transport | Web-standard Streamable HTTP du SDK, natif | Streamable HTTP via `http.createServer`/Express, quasi le même code qu'en local |
| OAuth | Lib officielle `workers-oauth-provider` de Cloudflare (utilisée dans leurs démos MCP), assez clé-en-main | À implémenter/intégrer soi-même (plus de travail) |
| Secrets | `wrangler secret put` | `fly secrets set` |
| Coût / ops | Généreux tier gratuit, zéro serveur à gérer, TLS/domaine custom faciles | Petit coût mensuel, déploiement du conteneur à gérer soi-même |
| Effort de migration | Moyen (adapter le transport + ajouter OAuth) | Faible sur le code (proche du stdio actuel), moyen sur l'OAuth |

**Recommandation** : Cloudflare Workers, pour le transport web-standard qui colle bien au SDK et la lib OAuth prête à l'emploi — ça évite d'écrire un serveur OAuth 2.1 à la main. Fly.io reste une bonne option si tu préfères garder un modèle "process Node classique" que tu contrôles entièrement.

Cette migration n'a pas encore été implémentée : elle est prévue une fois la version locale (stdio) validée avec de vrais appels à l'API Intervals.icu, pour éviter de découvrir un problème de mapping de champs une fois déployé.
