import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsClient } from "../client/intervalsClient.js";
import { toErrorResult, toJsonResult } from "../mcpResult.js";
import { formatDistanceKm, formatDuration, formatPacePerKm } from "../format.js";
import type { IntervalsActivity } from "../types/intervals.js";
import { dateSchema } from "./shared.js";

const PACE_BASED_TYPES = new Set(["Run", "TrailRun", "Walk", "Hike"]);

const inputShape = {
  oldest: dateSchema.describe("Date la plus ancienne à inclure (YYYY-MM-DD)"),
  newest: dateSchema.describe("Date la plus récente à inclure (YYYY-MM-DD)"),
  type: z
    .string()
    .optional()
    .describe("Filtrer par type d'activité (ex: Run, Ride, Swim). Omis = toutes les activités."),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe("Nombre maximum d'activités à retourner (défaut : toutes celles de la période, max 200)"),
};

function summarize(activity: IntervalsActivity) {
  const distance = activity.distance as number | undefined;
  const movingTime = activity.moving_time as number | undefined;
  const isPaceBased = activity.type !== undefined && PACE_BASED_TYPES.has(activity.type);

  return {
    id: activity.id,
    date: activity.start_date_local,
    type: activity.type,
    name: activity.name,
    distance_km: formatDistanceKm(distance),
    duration: formatDuration(movingTime),
    training_load: activity.icu_training_load,
    avg_hr: activity.average_heartrate,
    max_hr: activity.max_heartrate,
    ...(isPaceBased
      ? { avg_pace: formatPacePerKm(movingTime, distance) }
      : { avg_watts: activity.icu_weighted_avg_watts ?? activity.icu_average_watts }),
    perceived_exertion: activity.icu_rpe ?? activity.perceived_exertion,
  };
}

export function registerGetActivities(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    "get_activities",
    {
      title: "Lister les activités",
      description:
        "Liste les activités Intervals.icu sur une période donnée avec un résumé lisible : date, type, distance, durée, charge d'entraînement (icu_training_load), FC moyenne/max, allure ou watts moyens, RPE.",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ oldest, newest, type, limit }) => {
      try {
        const activities = await client.getActivities({ oldest, newest, type, limit });
        return toJsonResult({
          count: activities.length,
          activities: activities.map(summarize),
        });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
