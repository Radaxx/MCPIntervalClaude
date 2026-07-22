#!/usr/bin/env node
// Script admin : crée/met à jour un compte dans USERS_KV. Pas d'inscription
// publique — c'est le propriétaire du Worker qui exécute ce script pour
// chaque personne à qui il veut donner accès.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { hashPassword } from "../src/passwordHash.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const local = args.includes("--local");
  const positional = args.filter((a) => a !== "--local" && a !== "--remote");
  const [username, password, apiKey, athleteId, baseUrl] = positional;

  if (!username || !password || !apiKey || !athleteId) {
    console.error(
      "Usage: npm run add-user -- <identifiant> <mot_de_passe> <cle_api_intervals> <athlete_id> [base_url] [--local]",
    );
    console.error(
      "  --local : écrit dans le KV local simulé par `wrangler dev` (pour tester), au lieu du KV de production.",
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const record = JSON.stringify({
    passwordHash,
    intervalsApiKey: apiKey,
    intervalsAthleteId: athleteId,
    ...(baseUrl ? { intervalsBaseUrl: baseUrl } : {}),
  });

  const workerDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const key = `user:${username.trim().toLowerCase()}`;

  execFileSync(
    "npx",
    ["wrangler", "kv", "key", "put", "--binding=USERS_KV", key, record, local ? "--local" : "--remote"],
    { stdio: "inherit", cwd: workerDir },
  );

  console.log(`\nCompte "${username}" ${local ? "(local)" : "(production)"} créé/mis à jour.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
