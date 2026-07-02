import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsClient } from "../client/intervalsClient.js";
import { toErrorResult, toJsonResult } from "../mcpResult.js";
import { addDays, round, toDateString } from "../format.js";
import type { IntervalsWellnessEntry } from "../types/intervals.js";

const inputShape = {
  weeks: z
    .number()
    .int()
    .positive()
    .max(26)
    .optional()
    .describe("Nombre de semaines sur lesquelles calculer la tendance (défaut : 4)"),
};

function formStatus(tsb: number | undefined): string | undefined {
  if (tsb === undefined) return undefined;
  if (tsb < -10) return "fatigue élevée";
  if (tsb < -5) return "fatigué";
  if (tsb <= 5) return "neutre";
  return "frais / récupéré";
}

export function registerGetTrainingLoadSummary(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    "get_training_load_summary",
    {
      title: "Résumé de charge d'entraînement",
      description:
        "Calcule un résumé de la charge d'entraînement à partir des données de wellness : charge chronique (CTL), charge aiguë (ATL), forme (TSB = CTL - ATL), et tendance hebdomadaire sur N semaines.",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ weeks }) => {
      try {
        const weekCount = weeks ?? 4;
        const newest = new Date();
        const oldest = addDays(newest, -(weekCount * 7 + 7));

        const entries = await client.getWellness({
          oldest: toDateString(oldest),
          newest: toDateString(newest),
        });

        const withLoad = entries
          .filter(
            (e): e is IntervalsWellnessEntry & { ctl: number; atl: number } =>
              typeof e.ctl === "number" && typeof e.atl === "number",
          )
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

        if (withLoad.length === 0) {
          return toJsonResult({
            message:
              "Aucune donnée de charge (CTL/ATL) disponible sur cette période dans le wellness Intervals.icu.",
          });
        }

        const latest = withLoad[withLoad.length - 1]!;
        const tsb = round(latest.ctl - latest.atl, 1);

        const weeklyTrend = [];
        for (let i = weekCount - 1; i >= 0; i--) {
          const bucketEndStr = toDateString(addDays(newest, -i * 7));
          const entry = [...withLoad].reverse().find((e) => e.id <= bucketEndStr);
          if (entry) {
            weeklyTrend.push({
              week_ending: bucketEndStr,
              ctl: round(entry.ctl, 1),
              atl: round(entry.atl, 1),
              tsb: round(entry.ctl - entry.atl, 1),
            });
          }
        }

        return toJsonResult({
          as_of: latest.id,
          ctl: round(latest.ctl, 1),
          atl: round(latest.atl, 1),
          tsb,
          form_status: formStatus(tsb),
          weekly_trend: weeklyTrend,
        });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
