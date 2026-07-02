import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsClient } from "../client/intervalsClient.js";
import { toErrorResult, toJsonResult } from "../mcpResult.js";
import { formatDistanceKm, formatDuration, formatPacePerKm } from "../format.js";
import type { IntervalsActivityInterval } from "../types/intervals.js";

const PACE_BASED_TYPES = new Set(["Run", "TrailRun", "Walk", "Hike"]);

const inputShape = {
  activity_id: z.string().min(1).describe("ID de l'activité Intervals.icu (ex: i12345678)"),
};

function summarizeInterval(interval: IntervalsActivityInterval) {
  const distance = interval.distance as number | undefined;
  const movingTime = interval.moving_time as number | undefined;
  return {
    label: interval.label ?? interval.type,
    duration: formatDuration(movingTime),
    distance_km: formatDistanceKm(distance),
    avg_hr: interval.average_heartrate,
    max_hr: interval.max_heartrate,
    avg_watts: interval.average_watts,
    avg_pace: formatPacePerKm(movingTime, distance),
  };
}

export function registerGetActivityDetail(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    "get_activity_detail",
    {
      title: "Détail d'une activité",
      description:
        "Retourne le détail d'une activité Intervals.icu précise (résumé + métriques) ainsi que ses intervalles/splits si disponibles.",
      inputSchema: inputShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ activity_id }) => {
      try {
        const [activity, intervalsResponse] = await Promise.all([
          client.getActivity(activity_id),
          client.getActivityIntervals(activity_id),
        ]);

        const distance = activity.distance as number | undefined;
        const movingTime = activity.moving_time as number | undefined;
        const isPaceBased = activity.type !== undefined && PACE_BASED_TYPES.has(activity.type);
        const intervals = intervalsResponse.icu_intervals ?? [];

        return toJsonResult({
          id: activity.id,
          date: activity.start_date_local,
          type: activity.type,
          name: activity.name,
          distance_km: formatDistanceKm(distance),
          duration: formatDuration(movingTime),
          elevation_gain_m: activity.total_elevation_gain,
          training_load: activity.icu_training_load,
          avg_hr: activity.average_heartrate,
          max_hr: activity.max_heartrate,
          avg_cadence: activity.average_cadence,
          ...(isPaceBased
            ? { avg_pace: formatPacePerKm(movingTime, distance) }
            : { avg_watts: activity.icu_weighted_avg_watts ?? activity.icu_average_watts }),
          perceived_exertion: activity.icu_rpe ?? activity.perceived_exertion,
          intervals_count: intervals.length,
          intervals: intervals.map(summarizeInterval),
        });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
