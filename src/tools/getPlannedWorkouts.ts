import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsClient } from "../client/intervalsClient.js";
import { toErrorResult, toJsonResult } from "../mcpResult.js";
import { addDays, formatDistanceKm, formatDuration, toDateString } from "../format.js";
import type { IntervalsEvent } from "../types/intervals.js";
import { dateSchema } from "./shared.js";

const inputShape = {
  oldest: dateSchema.optional().describe("Date de début (YYYY-MM-DD). Défaut : aujourd'hui."),
  newest: dateSchema.optional().describe("Date de fin (YYYY-MM-DD). Défaut : dans 14 jours."),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe("Nombre maximum de séances à retourner"),
};

function summarize(event: IntervalsEvent) {
  return {
    id: event.id,
    date: event.start_date_local,
    type: event.type,
    name: event.name,
    description: event.description,
    planned_duration: formatDuration(event.moving_time as number | undefined),
    planned_distance_km: formatDistanceKm(event.distance as number | undefined),
    planned_load: event.icu_training_load,
  };
}

export function registerGetPlannedWorkouts(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    "get_planned_workouts",
    {
      title: "Séances planifiées",
      description:
        "Liste les séances planifiées à venir dans le calendrier Intervals.icu (par défaut, les 14 prochains jours).",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ oldest, newest, limit }) => {
      try {
        const today = toDateString(new Date());
        const defaultNewest = toDateString(addDays(new Date(), 14));

        const events = await client.getEvents({
          oldest: oldest ?? today,
          newest: newest ?? defaultNewest,
          category: "WORKOUT",
        });

        const planned = events.filter((e) => e.category === undefined || e.category === "WORKOUT");
        const limited = limit ? planned.slice(0, limit) : planned;

        return toJsonResult({
          count: limited.length,
          planned_workouts: limited.map(summarize),
        });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
