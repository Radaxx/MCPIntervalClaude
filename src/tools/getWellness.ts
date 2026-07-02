import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsClient } from "../client/intervalsClient.js";
import { toErrorResult, toJsonResult } from "../mcpResult.js";
import { round } from "../format.js";
import type { IntervalsWellnessEntry } from "../types/intervals.js";
import { dateSchema } from "./shared.js";

const inputShape = {
  oldest: dateSchema.describe("Date la plus ancienne à inclure (YYYY-MM-DD)"),
  newest: dateSchema.describe("Date la plus récente à inclure (YYYY-MM-DD)"),
};

function summarize(entry: IntervalsWellnessEntry) {
  const ctl = entry.ctl as number | undefined;
  const atl = entry.atl as number | undefined;
  const sleepSecs = entry.sleepSecs as number | undefined;

  return {
    date: entry.id,
    resting_hr: entry.restingHR,
    hrv: entry.hrv ?? entry.hrvSDNN,
    sleep_hours: sleepSecs !== undefined ? round(sleepSecs / 3600, 1) : undefined,
    sleep_score: entry.sleepScore ?? entry.sleepQuality,
    weight_kg: entry.weight,
    fatigue: entry.fatigue,
    stress: entry.stress,
    soreness: entry.soreness,
    mood: entry.mood,
    ctl: ctl !== undefined ? round(ctl, 1) : undefined,
    atl: atl !== undefined ? round(atl, 1) : undefined,
    form: ctl !== undefined && atl !== undefined ? round(ctl - atl, 1) : undefined,
  };
}

export function registerGetWellness(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    "get_wellness",
    {
      title: "Données de wellness",
      description:
        "Retourne les données de wellness (FC repos, HRV, sommeil, poids, fatigue/forme) sur une période donnée.",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ oldest, newest }) => {
      try {
        const entries = await client.getWellness({ oldest, newest });
        return toJsonResult({
          count: entries.length,
          wellness: entries.map(summarize),
        });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
