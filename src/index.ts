#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { IntervalsClient } from "./client/intervalsClient.js";
import { loadConfig } from "./config.js";
import { registerAllTools } from "./tools/index.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new IntervalsClient(config);

  const server = new McpServer({
    name: "intervals-icu",
    version: "0.1.0",
  });

  registerAllTools(server, client);

  // Transport stdio : stdout est réservé au protocole JSON-RPC, donc tout
  // log applicatif doit passer par stderr (console.error), jamais console.log.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("intervals-icu-mcp-server démarré (stdio)");
}

main().catch((err) => {
  // Ne jamais logger la config ou la clé API ici.
  console.error(
    "Erreur fatale du serveur MCP Intervals.icu :",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
