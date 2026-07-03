# Intervals.icu MCP Server

Serveur [MCP](https://modelcontextprotocol.io) qui expose tes données [Intervals.icu](https://intervals.icu) (activités, wellness, profil athlète, charge d'entraînement, séances planifiées) à Claude — en local via Claude Desktop / Claude Code, similaire au connecteur Strava officiel.

Principalement en lecture : 6 des 7 tools ne font que lire tes données. Un seul tool écrit sur ton compte — `create_planned_workout`, qui ajoute des séances au calendrier (voir section 6 et 7).

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

Redémarre Claude Desktop. Le connecteur "intervals-icu" doit apparaître avec ses 7 tools.

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

6 tools en lecture seule (données déjà agrégées, pas le JSON brut complet de l'API) et 1 tool en écriture, clairement marqué comme tel.

| Tool | Description | Paramètres |
|---|---|---|
| `get_activities` | Liste des activités sur une période | `oldest`, `newest` (YYYY-MM-DD), `type` (optionnel, ex: `Run`, `Ride`), `limit` (optionnel) |
| `get_activity_detail` | Détail d'une activité, avec intervalles/splits | `activity_id` |
| `get_wellness` | FC repos, HRV, sommeil, poids, fatigue/forme | `oldest`, `newest` (YYYY-MM-DD) |
| `get_athlete_profile` | FTP, zones FC/allure/puissance, poids, unités | — |
| `get_training_load_summary` | CTL/ATL/TSB et tendance hebdomadaire | `weeks` (optionnel, défaut 4) |
| `get_planned_workouts` | Séances planifiées à venir | `oldest`, `newest` (optionnels, défaut : 14 prochains jours), `limit` (optionnel) |
| `create_planned_workout` ⚠️ **écriture** | Ajoute une séance planifiée dans le calendrier Intervals.icu | `date`, `type`, `name`, `description` (optionnel, syntaxe structurée Intervals.icu), `planned_duration_minutes`, `planned_distance_km`, `planned_load` (optionnels) |

## 7. Sécurité

- Authentification HTTP Basic (`username: API_KEY`, `password: <ta clé>`), jamais journalisée, y compris en cas d'erreur.
- 6 des 7 tools sont strictement en lecture (`GET`). Un seul tool écrit sur ton compte : `create_planned_workout`, qui **crée** une nouvelle séance dans le calendrier — il ne modifie ni ne supprime jamais une activité ou une séance existante.
- `create_planned_workout` est marqué `readOnlyHint: false` dans son schéma MCP : Claude Desktop/Code et claude.ai doivent te demander confirmation avant de l'exécuter (comportement standard du client MCP, pas garanti à 100% selon le client).
- Les erreurs 401 (clé invalide) et 429 (rate limit) sont détectées et renvoient un message clair au lieu de faire échouer silencieusement l'appel.

## 8. Dépannage

- **"Configuration invalide" au démarrage** : `INTERVALS_API_KEY` ou `INTERVALS_ATHLETE_ID` manquant — vérifie ton `.env` ou la config `env` du client MCP.
- **Erreur 401** : la clé API est invalide, expirée, ou mal copiée.
- **Erreur 429** : trop de requêtes envoyées à l'API Intervals.icu en peu de temps ; réessaie après le délai indiqué.
- **Aucun tool n'apparaît dans Claude** : vérifie que le chemin vers `dist/index.js` est absolu et que `npm run build` a bien été exécuté au préalable.

## 9. Hébergement distant (HTTP/SSE) — connecteur claude.ai

La version hébergée est implémentée dans [`worker/`](./worker) : un serveur MCP sur Cloudflare Workers, transport Streamable HTTP, protégé par OAuth 2.1 (`@cloudflare/workers-oauth-provider`) derrière un écran de connexion par mot de passe personnel. Elle réutilise le même client Intervals.icu et les mêmes 7 tools que la version stdio (`src/client`, `src/tools`) — un seul code métier, deux modes de déploiement.

Voir **[`worker/README.md`](./worker/README.md)** pour : créer le KV namespace OAuth, définir les secrets (`wrangler secret put`), tester en local (`npm run dev`), déployer (`npm run deploy`), et ajouter l'URL obtenue comme connecteur personnalisé dans claude.ai (Settings → Connectors → Add custom connector).

Pourquoi Cloudflare Workers plutôt que Fly.io : le SDK MCP expose un transport Streamable HTTP "web-standard" (basé sur `fetch`/`Request`/`Response`) nativement compatible avec les Workers, et Cloudflare fournit une lib OAuth 2.1 prête à l'emploi (`workers-oauth-provider`) — ça évite d'écrire un serveur d'autorisation à la main. Fly.io (container Node classique) reste une alternative valable si tu préfères gérer toi-même le serveur HTTP et l'OAuth.
