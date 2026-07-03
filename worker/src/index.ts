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

const CSRF_COOKIE_NAME = "__Host-intervals_csrf";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loginPage(opts: { query: string; csrfToken: string; error?: string }): Response {
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
    <input type="hidden" name="csrf_token" value="${escapeHtml(opts.csrfToken)}" />
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

function readCsrfCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  return cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`))
    ?.slice(CSRF_COOKIE_NAME.length + 1);
}

function csrfCookieHeader(token: string): string {
  return `${CSRF_COOKIE_NAME}=${token}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`;
}

/**
 * Écran de connexion personnel avant d'accorder un jeton OAuth au client MCP
 * (claude.ai). Un seul propriétaire (toi) : le "mot de passe" est un secret
 * Worker distinct de la clé API Intervals.icu, jamais la clé elle-même.
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
      const csrfToken = crypto.randomUUID();
      const response = loginPage({ query: url.searchParams.toString(), csrfToken });
      response.headers.append("Set-Cookie", csrfCookieHeader(csrfToken));
      return response;
    }

    if (request.method === "POST") {
      const form = await request.formData();
      const password = String(form.get("password") ?? "");
      const csrfFromForm = String(form.get("csrf_token") ?? "");
      const csrfFromCookie = readCsrfCookie(request);

      const refreshedCsrfToken = crypto.randomUUID();

      if (!csrfFromCookie || !csrfFromForm || csrfFromCookie !== csrfFromForm) {
        const response = loginPage({
          query: url.searchParams.toString(),
          csrfToken: refreshedCsrfToken,
          error: "Session expirée, réessaie.",
        });
        response.headers.append("Set-Cookie", csrfCookieHeader(refreshedCsrfToken));
        return response;
      }

      if (!bindings.OWNER_PASSWORD || password !== bindings.OWNER_PASSWORD) {
        const response = loginPage({
          query: url.searchParams.toString(),
          csrfToken: refreshedCsrfToken,
          error: "Mot de passe incorrect.",
        });
        response.headers.append("Set-Cookie", csrfCookieHeader(refreshedCsrfToken));
        return response;
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
        headers: {
          Location: redirectTo,
          "Set-Cookie": `${CSRF_COOKIE_NAME}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`,
        },
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
