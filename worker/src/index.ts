import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OAuthProvider, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { IntervalsClient } from "../../src/client/intervalsClient.js";
import { registerAllTools } from "../../src/tools/index.js";
import { verifyPassword } from "./passwordHash.js";
import { getUser } from "./userStore.js";

interface WorkerEnv {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  MCP_OBJECT: DurableObjectNamespace;
  USERS_KV: KVNamespace;
}

/** Identité + identifiants Intervals.icu de la personne connectée pour cette session MCP. */
interface IntervalsMcpProps extends Record<string, unknown> {
  userId: string;
  intervalsApiKey: string;
  intervalsAthleteId: string;
  intervalsBaseUrl?: string;
}

/**
 * Serveur MCP Intervals.icu, exposé via Streamable HTTP. Une instance
 * (Durable Object) est créée par session cliente ; init() est rappelé à
 * chaque démarrage de session pour enregistrer les 9 tools, avec le client
 * Intervals.icu construit à partir des identifiants de la personne connectée
 * (this.props, posés par completeAuthorization dans defaultHandler) —
 * jamais un compte global partagé.
 */
export class IntervalsMcp extends McpAgent<WorkerEnv, unknown, IntervalsMcpProps> {
  server = new McpServer({ name: "intervals-icu", version: "0.1.0" });

  async init(): Promise<void> {
    if (!this.props) {
      throw new Error("Session MCP sans identité authentifiée (this.props manquant).");
    }
    const client = new IntervalsClient({
      apiKey: this.props.intervalsApiKey,
      athleteId: this.props.intervalsAthleteId,
      baseUrl: this.props.intervalsBaseUrl ?? "https://intervals.icu/api/v1",
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
  <form method="POST" action="/authorize?${escapeHtml(opts.query)}">
    <h1>Accès au serveur MCP Intervals.icu</h1>
    ${errorHtml}
    <label for="username">Identifiant</label>
    <input id="username" name="username" type="text" required autocomplete="username" autofocus />
    <label for="password">Mot de passe</label>
    <input id="password" name="password" type="password" required autocomplete="current-password" />
    <button type="submit">Continuer</button>
  </form>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Pas de `form-action` : claude.ai charge cette page dans un contexte
      // (popup/webview) où le navigateur a bloqué la soumission du
      // formulaire même vers 'self', avec une "CSP violates form-action
      // 'self'" — constaté en conditions réelles. Le vrai verrou reste
      // l'identifiant/mot de passe, pas cette restriction en plus.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Écran de connexion multi-utilisateurs avant d'accorder un jeton OAuth au
 * client MCP (claude.ai). Chaque compte (identifiant + mot de passe haché +
 * identifiants Intervals.icu propres) vit dans USERS_KV, créé par l'admin
 * via `npm run add-user` — pas d'inscription publique. Le jeton émis porte
 * les identifiants Intervals.icu de LA personne qui vient de se connecter
 * (props), jamais un compte global partagé.
 *
 * Message d'erreur volontairement générique ("identifiants incorrects")
 * pour ne pas révéler si un identifiant existe.
 *
 * Pas de protection CSRF par cookie ici (contrairement aux exemples pour
 * serveurs proxy vers un IdP tiers) : on n'a ni session déjà authentifiée à
 * protéger contre un "confused deputy", ni upstream OAuth à sécuriser. Un
 * cookie __Host- s'est révélé bloqué dans le contexte où claude.ai charge
 * cette page (constaté en conditions réelles), d'où son absence.
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
      const username = String(form.get("username") ?? "").trim();
      const password = String(form.get("password") ?? "");

      const user = username ? await getUser(bindings.USERS_KV, username) : null;
      const valid = user ? await verifyPassword(password, user.passwordHash) : false;

      if (!user || !valid) {
        return loginPage({
          query: url.searchParams.toString(),
          error: "Identifiant ou mot de passe incorrect.",
        });
      }

      const props: IntervalsMcpProps = {
        userId: username.toLowerCase(),
        intervalsApiKey: user.intervalsApiKey,
        intervalsAthleteId: user.intervalsAthleteId,
        intervalsBaseUrl: user.intervalsBaseUrl,
      };

      const { redirectTo } = await provider.completeAuthorization({
        request: oauthReqInfo,
        userId: props.userId,
        scope: [],
        props,
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
