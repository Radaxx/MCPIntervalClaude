import { env } from "cloudflare:workers";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OAuthProvider, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { IntervalsClient } from "../../src/client/intervalsClient.js";
import { registerAllTools } from "../../src/tools/index.js";

interface WorkerEnv {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  MCP_OBJECT: DurableObjectNamespace;
  INTERVALS_API_KEY: string;
  INTERVALS_ATHLETE_ID: string;
  INTERVALS_BASE_URL?: string;
  OWNER_PASSWORD: string;
}

/**
 * Serveur MCP Intervals.icu, en lecture seule, exposé via Streamable HTTP.
 * Une instance (Durable Object) est créée par session cliente ; init() est
 * rappelé à chaque démarrage de session pour enregistrer les 6 tools.
 */
export class IntervalsMcp extends McpAgent<WorkerEnv> {
  server = new McpServer({ name: "intervals-icu", version: "0.1.0" });

  async init(): Promise<void> {
    const bindings = env as unknown as WorkerEnv;
    const client = new IntervalsClient({
      apiKey: bindings.INTERVALS_API_KEY,
      athleteId: bindings.INTERVALS_ATHLETE_ID,
      baseUrl: bindings.INTERVALS_BASE_URL ?? "https://intervals.icu/api/v1",
    });
    registerAllTools(this.server, client);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loginPage(opts: { query: string; error?: string }): Response {
  const errorHtml = opts.error ? `<p class="error">${escapeHtml(opts.error)}</p>` : "";
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Connexion — Intervals.icu MCP</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f4f4f5; display: grid; place-items: center; min-height: 100vh; margin: 0; }
  form { background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); width: 100%; max-width: 320px; }
  h1 { font-size: 1.1rem; margin: 0 0 1rem; }
  label { display: block; font-size: 0.85rem; margin-bottom: 0.4rem; color: #444; }
  input { width: 100%; box-sizing: border-box; padding: 0.6rem; border: 1px solid #ccc; border-radius: 6px; margin-bottom: 1rem; }
  button { width: 100%; padding: 0.6rem; background: #111; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
  .error { color: #b91c1c; font-size: 0.85rem; margin: 0 0 0.75rem; }
</style>
</head>
<body>
  <form method="POST" action="/authorize?${opts.query}">
    <h1>Accès au serveur MCP Intervals.icu</h1>
    ${errorHtml}
    <label for="password">Mot de passe</label>
    <input id="password" name="password" type="password" required autocomplete="current-password" autofocus />
    <button type="submit">Continuer</button>
  </form>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Écran de connexion personnel avant d'accorder un jeton OAuth au client MCP
 * (claude.ai). Un seul propriétaire (toi) : le "mot de passe" est un secret
 * Worker distinct de la clé API Intervals.icu, jamais la clé elle-même.
 *
 * Pas de protection CSRF par cookie ici (contrairement aux exemples pour
 * serveurs proxy vers un IdP tiers) : on n'a ni session déjà authentifiée à
 * protéger contre un "confused deputy", ni upstream OAuth à sécuriser — le
 * seul secret qui compte est OWNER_PASSWORD lui-même. Un cookie __Host- s'est
 * révélé bloqué dans le contexte où claude.ai charge cette page, cassant le
 * flow ; ça correspond à l'exemple officiel Cloudflare, qui n'en met pas non
 * plus pour ce cas d'usage.
 */
const defaultHandler = {
  async fetch(request: Request, rawEnv: unknown): Promise<Response> {
    const bindings = rawEnv as WorkerEnv;
    const provider = bindings.OAUTH_PROVIDER;
    const url = new URL(request.url);

    if (url.pathname !== "/authorize") {
      return new Response("Not found", { status: 404 });
    }

    let oauthReqInfo;
    try {
      oauthReqInfo = await provider.parseAuthRequest(request);
    } catch (err) {
      return new Response(
        `Requête OAuth invalide : ${err instanceof Error ? err.message : String(err)}`,
        { status: 400 },
      );
    }

    if (request.method === "GET") {
      return loginPage({ query: url.searchParams.toString() });
    }

    if (request.method === "POST") {
      const form = await request.formData();
      const password = String(form.get("password") ?? "");

      if (!bindings.OWNER_PASSWORD || password !== bindings.OWNER_PASSWORD) {
        return loginPage({
          query: url.searchParams.toString(),
          error: "Mot de passe incorrect.",
        });
      }

      const { redirectTo } = await provider.completeAuthorization({
        request: oauthReqInfo,
        userId: bindings.INTERVALS_ATHLETE_ID,
        scope: [],
        props: { userId: bindings.INTERVALS_ATHLETE_ID },
        metadata: undefined,
      });

      return new Response(null, {
        status: 302,
        headers: { Location: redirectTo },
      });
    }

    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
  },
};

export default new OAuthProvider({
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  apiRoute: "/mcp",
  apiHandler: IntervalsMcp.serve("/mcp"),
  defaultHandler,
});
